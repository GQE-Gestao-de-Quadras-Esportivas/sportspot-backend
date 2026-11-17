// Erro de aplicação que vira uma resposta Problem Details (RFC 9457).
// Os serviços lançam HttpError; o middleware problem-details.ts monta a resposta.

export interface FieldError {
  field: string;
  message: string;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    public type: string, // identificador curto do problema, ex.: "horario-ocupado"
    public title: string,
    public detail?: string,
    public errors?: FieldError[],
  ) {
    super(detail || title);
  }
}

export const badRequest = (detail: string, errors?: FieldError[]) =>
  new HttpError(400, "requisicao-invalida", "Requisição inválida", detail, errors);

export const unauthorized = (detail: string) =>
  new HttpError(401, "nao-autenticado", "Não autenticado", detail);

export const forbidden = (detail: string) =>
  new HttpError(403, "acesso-negado", "Acesso negado", detail);

export const notFound = (detail: string) =>
  new HttpError(404, "nao-encontrado", "Recurso não encontrado", detail);

export const conflict = (type: string, title: string, detail: string) =>
  new HttpError(409, type, title, detail);

export const unprocessable = (type: string, title: string, detail: string, errors?: FieldError[]) =>
  new HttpError(422, type, title, detail, errors);
