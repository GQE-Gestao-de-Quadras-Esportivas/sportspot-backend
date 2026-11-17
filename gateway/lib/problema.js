// Erros do próprio gateway em Problem Details (RFC 9457)

export function enviarProblema(req, res, status, tipo, titulo, detalhe, extras = {}) {
  res
    .status(status)
    .type("application/problem+json")
    .json({
      type: `/problemas/${tipo}`,
      title: titulo,
      status,
      detail: detalhe,
      instance: req.originalUrl,
      requestId: req.requestId,
      origem: "gateway",
      ...extras,
    });
}
