import { randomUUID } from "node:crypto";

// O gateway é quem cria o X-Request-Id.
// Se o cliente mandar um id em formato seguro (letras, números, ponto, hífen, até 64
// caracteres), ele é mantido, para que o próprio cliente consiga rastrear a chamada.
// Qualquer outro valor é descartado e substituído por um UUID.
const FORMATO_SEGURO = /^[A-Za-z0-9._-]{1,64}$/;

export function requestId(req, res, next) {
  const recebido = req.get("X-Request-Id");
  req.requestId = recebido && FORMATO_SEGURO.test(recebido) ? recebido : randomUUID();
  res.setHeader("X-Request-Id", req.requestId);

  const inicio = Date.now();
  res.on("finish", () => {
    const cliente = req.cliente?.id ?? "-";
    const destino = res.locals.destino ?? "gateway";
    console.log(
      `[gateway] [${req.requestId}] ${cliente} ${req.method} ${req.originalUrl} -> ${destino} ${res.statusCode} (${Date.now() - inicio} ms)`,
    );
  });
  next();
}
