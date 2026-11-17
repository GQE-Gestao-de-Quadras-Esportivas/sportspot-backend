import { chamarServico, FalhaServico } from "./chamar-servico.js";
import { enviarProblema } from "./problema.js";

// GET /api/painel/quadras/:id
// Tela "detalhe da quadra" do painel do proprietário, com UMA chamada em vez de três:
//   1. API REST     GET /v1/api/courts/:id               → dados da quadra (essencial)
//   2. API REST     GET /v1/api/courts/:id/appointments  → próximas reservas (opcional)
//   3. Faturamento  GET /quadras/:id                     → receita prevista (opcional)
//
// Degradação graciosa: se uma fonte OPCIONAL falhar, a resposta sai com o que deu
// para obter, com "parcial": true e um aviso. Sem a fonte essencial, não há tela: erro.

export async function painelQuadra(req, res) {
  const id = encodeURIComponent(req.params.id);
  const headers = {
    "x-request-id": req.requestId,
    "x-cliente-id": req.cliente.id,
    ...(req.get("authorization") ? { authorization: req.get("authorization") } : {}),
  };

  // As três chamadas saem em paralelo
  const [quadra, reservas, faturamento] = await Promise.allSettled([
    lerJson(chamarServico("rest", `/v1/api/courts/${id}`, { headers })),
    lerJson(chamarServico("rest", `/v1/api/courts/${id}/appointments`, { headers })),
    lerJson(chamarServico("faturamento", `/quadras/${id}`, { headers, timeoutMs: 1500 })),
  ]);
  res.locals.destino = "agregado";

  // ---- fonte essencial ----
  if (quadra.status === "rejected") {
    const e = quadra.reason;
    if (e instanceof FalhaServico) {
      if (e.retryAfter) res.setHeader("Retry-After", e.retryAfter);
      return enviarProblema(req, res, e.status, e.tipo, e.titulo, `Sem os dados da quadra não há painel: ${e.detalhe}`);
    }
    throw e;
  }
  if (quadra.value.status !== 200) {
    // 401, 404... vindos da API: repassa a resposta de erro dela
    return res.status(quadra.value.status).type("application/problem+json").json(quadra.value.corpo);
  }

  // ---- fontes opcionais ----
  const avisos = [];
  const opcional = (resultado, fonte) => {
    if (resultado.status === "fulfilled" && resultado.value.status === 200) return resultado.value.corpo;
    const motivo = resultado.status === "rejected" ? resultado.reason.detalhe ?? resultado.reason.message : `HTTP ${resultado.value.status}`;
    avisos.push({ fonte, motivo });
    return null;
  };
  const listaReservas = opcional(reservas, "reservas");
  const receita = opcional(faturamento, "faturamento");

  const agora = Date.now();
  res.status(200).json({
    quadra: quadra.value.corpo,
    proximasReservas: listaReservas?.filter((r) => r.status !== "cancelada" && new Date(r.start_time).getTime() >= agora) ?? null,
    receita: receita ? { reservas: receita.reservas, total: receita.receita } : null,
    parcial: avisos.length > 0,
    ...(avisos.length ? { avisos } : {}),
  });
}

async function lerJson(promessa) {
  const resposta = await promessa;
  const texto = await resposta.text();
  return { status: resposta.status, corpo: texto ? JSON.parse(texto) : null };
}
