// Cliente HTTP que o servidor GraphQL usa para buscar os dados na API REST.
// O GraphQL NÃO tem cópia própria dos dados: tudo vem destas chamadas.
// Cada chamada repassa o X-Request-Id (e a identidade do cliente) recebidos do
// gateway, e é contada para mostrar quantas chamadas REST uma consulta evitou.
import { GraphQLError } from 'graphql';

const CODIGOS = {
  400: 'BAD_USER_INPUT',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  415: 'BAD_REQUEST',
  422: 'BUSINESS_RULE_VIOLATION',
};

export class RestCliente {
  constructor({ baseUrl, cabecalhos, logger, metricas }) {
    this.baseUrl = baseUrl;
    this.cabecalhos = cabecalhos;
    this.logger = logger;
    this.metricas = metricas;
  }

  async requisitar(metodo, caminho, corpo) {
    this.metricas.chamadasHttp++;
    this.metricas.caminhos.push(`${metodo} ${caminho}`);
    let resposta;
    try {
      resposta = await fetch(this.baseUrl + caminho, {
        method: metodo,
        headers: { accept: 'application/json', ...(corpo ? { 'content-type': 'application/json' } : {}), ...this.cabecalhos },
        body: corpo ? JSON.stringify(corpo) : undefined,
        signal: AbortSignal.timeout(2000),
      });
    } catch (e) {
      this.logger.warn(`API REST indisponível em ${metodo} ${caminho}: ${e.cause?.code ?? e.name}`, { requestId: this.cabecalhos['x-request-id'] });
      throw new GraphQLError('A API REST está indisponível no momento.', {
        extensions: { code: 'REST_UNAVAILABLE' },
      });
    }
    const texto = await resposta.text();
    const json = texto ? JSON.parse(texto) : null;
    if (resposta.ok) return json;

    if (resposta.status >= 500 || resposta.status === 429) {
      throw new GraphQLError('A API REST está indisponível no momento.', { extensions: { code: 'REST_UNAVAILABLE', status: resposta.status } });
    }
    // Erros 4xx da API REST (Problem Details) viram GraphQLError com code
    throw new GraphQLError(json?.detail ?? `Erro ${resposta.status} na API REST`, {
      extensions: {
        code: CODIGOS[resposta.status] ?? 'BAD_REQUEST',
        status: resposta.status,
        regra: json?.regra,
        errors: json?.errors,
        problema: json?.type,
      },
    });
  }

  get(caminho) {
    return this.requisitar('GET', caminho);
  }

  /** GET que devolve null quando o recurso não existe (404). */
  async getOuNulo(caminho) {
    try {
      return await this.get(caminho);
    } catch (e) {
      if (e.extensions?.code === 'NOT_FOUND') return null;
      throw e;
    }
  }

  /** Percorre todas as páginas de uma listagem (a API limita a 50 por página). */
  async listarTodos(caminho, params = {}) {
    const itens = [];
    let pagina = 1;
    for (;;) {
      const qs = new URLSearchParams({ ...params, pagina: String(pagina), tamanho: '50' });
      const resposta = await this.get(`${caminho}?${qs}`);
      itens.push(...resposta.dados);
      if (pagina >= resposta.paginacao.totalPaginas) return itens;
      pagina++;
    }
  }

  post(caminho, corpo) {
    return this.requisitar('POST', caminho, corpo ?? {});
  }
}
