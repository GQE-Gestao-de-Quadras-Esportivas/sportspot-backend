// Cliente HTTP da API REST usado pelos resolvers.
// O GraphQL NÃO tem cópia dos dados: tudo vem da API REST, que continua sendo
// a dona das regras de negócio e da verificação de quem é dono de cada dado.

import { GraphQLError } from "graphql";

const REST_URL = process.env.REST_URL || "http://127.0.0.1:3000/v1/api";
const TIMEOUT_MS = Number(process.env.REST_TIMEOUT_MS || 4000);

// Códigos HTTP da API → códigos GraphQL (extensions.code)
const CODIGO_POR_STATUS = {
  400: "BAD_USER_INPUT",
  401: "UNAUTHENTICATED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "CONFLICT",
  422: "BUSINESS_RULE_VIOLATION",
};

export class RestClient {
  constructor({ requestId, authorization, clienteId }) {
    this.requestId = requestId;
    this.authorization = authorization;
    this.clienteId = clienteId;
    this.chamadas = []; // registro de cada chamada REST feita nesta operação GraphQL
  }

  async chamar(metodo, caminho, corpo) {
    const headers = { "X-Request-Id": this.requestId, Accept: "application/json" };
    if (this.authorization) headers.Authorization = this.authorization;
    if (this.clienteId) headers["X-Cliente-Id"] = this.clienteId;
    if (corpo !== undefined) headers["Content-Type"] = "application/json";

    this.chamadas.push(`${metodo} ${caminho}`);
    let resposta;
    try {
      resposta = await fetch(REST_URL + caminho, {
        method: metodo,
        headers,
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (erro) {
      throw new GraphQLError("A API REST não respondeu.", {
        extensions: { code: "SERVICO_INDISPONIVEL", motivo: erro.cause?.code ?? erro.name },
      });
    }

    if (resposta.status === 204) return null;
    const texto = await resposta.text();
    const dados = texto ? JSON.parse(texto) : null;
    if (resposta.ok) return dados;

    // Erro da API em Problem Details → GraphQLError com code.
    // Para regras de negócio, o code é o próprio tipo do problema: /problemas/horario-ocupado → HORARIO_OCUPADO
    const tipo = dados?.type?.split("/").pop();
    const code =
      resposta.status === 409 || resposta.status === 422
        ? tipo.replaceAll("-", "_").toUpperCase()
        : (CODIGO_POR_STATUS[resposta.status] ?? "ERRO_NA_API");
    throw new GraphQLError(dados?.detail ?? dados?.title ?? `HTTP ${resposta.status}`, {
      extensions: {
        code,
        status: resposta.status,
        problema: dados?.type,
        ...(dados?.errors ? { campos: dados.errors } : {}),
      },
    });
  }

  get(caminho) {
    return this.chamar("GET", caminho);
  }
}
