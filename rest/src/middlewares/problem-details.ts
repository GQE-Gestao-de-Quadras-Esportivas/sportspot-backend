import { ErrorRequestHandler, RequestHandler, Response } from "express";
import { HttpError } from "../errors/http-error.js";

// Todas as respostas de erro da API saem neste formato (RFC 9457):
// { type, title, status, detail, instance, requestId, errors? }

export function sendProblem(
  res: Response,
  status: number,
  body: { type: string; title: string; detail?: string; instance?: string; [k: string]: unknown },
) {
  return res
    .status(status)
    .type("application/problem+json")
    .json({
      type: `/problemas/${body.type}`,
      title: body.title,
      status,
      detail: body.detail,
      instance: body.instance,
      requestId: res.req.requestId,
      ...Object.fromEntries(
        Object.entries(body).filter(([k]) => !["type", "title", "detail", "instance"].includes(k)),
      ),
    });
}

// Rota inexistente → 404 em Problem Details (o Express responderia HTML)
export const notFoundHandler: RequestHandler = (req, res) => {
  sendProblem(res, 404, {
    type: "rota-inexistente",
    title: "Rota não encontrada",
    detail: `${req.method} ${req.originalUrl} não existe nesta API.`,
    instance: req.originalUrl,
  });
};

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof HttpError) {
    return sendProblem(res, err.status, {
      type: err.type,
      title: err.title,
      detail: err.detail,
      instance: req.originalUrl,
      ...(err.errors ? { errors: err.errors } : {}),
    });
  }

  // JSON malformado no corpo (erro lançado pelo express.json)
  if (err?.type === "entity.parse.failed") {
    return sendProblem(res, 400, {
      type: "json-invalido",
      title: "JSON inválido",
      detail: "O corpo da requisição não é um JSON válido.",
      instance: req.originalUrl,
    });
  }

  // id que não é UUID chega ao Postgres e falha com código 22P02
  if (err?.code === "22P02") {
    return sendProblem(res, 404, {
      type: "nao-encontrado",
      title: "Recurso não encontrado",
      detail: "O identificador informado não existe.",
      instance: req.originalUrl,
    });
  }

  console.error(`[rest] [${req.requestId}] erro inesperado:`, err);
  return sendProblem(res, 500, {
    type: "erro-interno",
    title: "Erro interno",
    detail: "Ocorreu um erro inesperado. Informe o requestId ao suporte.",
    instance: req.originalUrl,
  });
};
