import { servicos } from "../config.js";
import { disjuntorDe } from "./disjuntor.js";

// Erro de infraestrutura: o serviço não respondeu direito.
// status 502 (fora do ar), 504 (demorou demais) ou 503 (disjuntor aberto).
export class FalhaServico extends Error {
  constructor(status, tipo, titulo, detalhe, retryAfter) {
    super(detalhe);
    Object.assign(this, { status, tipo, titulo, detalhe, retryAfter });
  }
}

/**
 * Chama um serviço interno com timeout e disjuntor.
 * Usado pelo proxy e pela rota agregada.
 * Respostas 4xx do serviço são respostas válidas (não contam como falha);
 * falha de conexão, timeout e 5xx contam.
 */
export async function chamarServico(chaveServico, caminho, { method = "GET", headers = {}, body, timeoutMs } = {}) {
  const servico = servicos[chaveServico];
  const disjuntor = disjuntorDe(servico.nome);

  if (!disjuntor.permitir()) {
    throw new FalhaServico(503, "servico-indisponivel", "Serviço indisponível",
      `O disjuntor de ${servico.nome} está aberto após falhas seguidas. Nova tentativa em ${disjuntor.segundosParaTentar()} s.`,
      disjuntor.segundosParaTentar());
  }

  const limite = timeoutMs ?? servico.timeoutMs;
  let resposta;
  try {
    resposta = await fetch(servico.url + caminho, {
      method,
      headers,
      body,
      redirect: "manual",
      signal: AbortSignal.timeout(limite),
    });
  } catch (erro) {
    disjuntor.falha();
    if (erro.name === "TimeoutError") {
      throw new FalhaServico(504, "tempo-esgotado", "Tempo de resposta esgotado",
        `${servico.nome} não respondeu em ${limite} ms.`);
    }
    throw new FalhaServico(502, "servico-fora-do-ar", "Serviço fora do ar",
      `Não foi possível conectar a ${servico.nome} (${erro.cause?.code ?? erro.message}).`);
  }

  if (resposta.status >= 500) disjuntor.falha();
  else disjuntor.sucesso();
  return resposta;
}
