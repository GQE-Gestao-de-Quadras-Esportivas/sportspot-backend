import { enviarProblema } from "./problema.js";

// Limite de uso por cliente, em janela fixa de 1 minuto.
// Os contadores ficam na memória DESTE processo: com três cópias do gateway,
// cada uma contaria separado e o cliente teria, na prática, o triplo do limite.
// Em produção, o contador iria para um armazenamento compartilhado (ex.: Redis).

const JANELA_MS = 60_000;
const contadores = new Map(); // clienteId → { inicio, total }

export function limitarUso(req, res, next) {
  const { id, limitePorMinuto } = req.cliente;
  const agora = Date.now();

  let janela = contadores.get(id);
  if (!janela || agora - janela.inicio >= JANELA_MS) {
    janela = { inicio: agora, total: 0 };
    contadores.set(id, janela);
  }
  janela.total += 1;

  const restante = Math.max(0, limitePorMinuto - janela.total);
  const segundosParaReiniciar = Math.ceil((janela.inicio + JANELA_MS - agora) / 1000);
  res.setHeader("RateLimit-Limit", limitePorMinuto);
  res.setHeader("RateLimit-Remaining", restante);
  res.setHeader("RateLimit-Reset", segundosParaReiniciar);

  if (janela.total > limitePorMinuto) {
    res.setHeader("Retry-After", segundosParaReiniciar);
    return enviarProblema(req, res, 429, "limite-excedido", "Limite de uso excedido",
      `O plano de ${id} permite ${limitePorMinuto} requisições por minuto. Tente de novo em ${segundosParaReiniciar} s.`);
  }
  next();
}
