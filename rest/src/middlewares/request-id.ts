import { RequestHandler } from "express";
import { randomUUID } from "node:crypto";

// Usa o X-Request-Id que veio do gateway (ou gera um, se a chamada for direta),
// devolve no cabeçalho da resposta e registra cada requisição no log.
export const requestId: RequestHandler = (req, res, next) => {
  const id = req.get("X-Request-Id") || randomUUID();
  req.requestId = id;
  res.setHeader("X-Request-Id", id);

  const inicio = Date.now();
  res.on("finish", () => {
    console.log(
      `[rest] [${id}] ${req.get("X-Cliente-Id") ?? "direto"} ${req.method} ${req.originalUrl} -> ${res.statusCode} (${Date.now() - inicio} ms)`,
    );
  });
  next();
};
