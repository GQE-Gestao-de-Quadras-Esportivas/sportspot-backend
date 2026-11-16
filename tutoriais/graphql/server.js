// Servidor GraphQL (Apollo Server 5, standalone) em 127.0.0.1:3002.
// Só o gateway o chama (prefixo público /api/graphql -> caminho interno /).
import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { randomUUID } from 'node:crypto';
import { typeDefs } from './schema.js';
import { resolvers } from './resolvers.js';
import { RestCliente } from './rest-cliente.js';
import { criarCarregadores } from './carregadores.js';
import { criarLogger } from '../shared/logger.js';
import { config } from '../shared/config.js';
import { ehPrincipal } from '../shared/principal.js';

// Plugin: registra cada operação no log (com o X-Request-Id) e devolve, em
// "extensions.chamadasRest", quantas chamadas REST a consulta fez e quantas o
// cliente teria de fazer sem o GraphQL.
const pluginMetricas = (logger) => ({
  async requestDidStart() {
    return {
      async willSendResponse({ response, contextValue, operationName }) {
        const { metricas, requestId } = contextValue;
        if (response.body.kind === 'single') {
          response.body.singleResult.extensions = {
            ...response.body.singleResult.extensions,
            requestId,
            chamadasRest: { realizadas: metricas.chamadasHttp, semGraphQL: metricas.semGraphQL, caminhos: metricas.caminhos },
          };
        }
        const erros = response.body.kind === 'single' ? response.body.singleResult.errors?.length ?? 0 : 0;
        logger.info(`operação ${operationName ?? '(anônima)'}: ${metricas.chamadasHttp} chamada(s) REST, evitou ${Math.max(0, metricas.semGraphQL - metricas.chamadasHttp)}; erros: ${erros}`, { requestId });
      },
    };
  },
});

export function criarServidorGraphQL(logger) {
  return new ApolloServer({
    typeDefs,
    resolvers,
    introspection: true,
    includeStacktraceInErrorResponses: false,
    plugins: [pluginMetricas(logger)],
  });
}

export function criarContexto(logger, restUrl = config.rest.url) {
  return async ({ req }) => {
    const h = req.headers;
    const requestId = typeof h['x-request-id'] === 'string' ? h['x-request-id'] : randomUUID();
    // Cabeçalhos repassados à API REST (identidade definida pelo gateway)
    const cabecalhos = { 'x-request-id': requestId };
    for (const nome of ['x-cliente-id', 'x-usuario-id', 'x-usuario-papel']) if (h[nome]) cabecalhos[nome] = h[nome];
    const metricas = { chamadasHttp: 0, semGraphQL: 0, caminhos: [] };
    const rest = new RestCliente({ baseUrl: restUrl, cabecalhos, logger, metricas });
    return { requestId, metricas, rest, carregadores: criarCarregadores(rest, metricas) };
  };
}

if (ehPrincipal(import.meta.url)) {
  const logger = criarLogger('graphql');
  const servidor = criarServidorGraphQL(logger);
  try {
    const { url } = await startStandaloneServer(servidor, {
      listen: { port: config.graphql.porta, host: config.graphql.host },
      context: criarContexto(logger),
    });
    logger.info(`GraphQL ouvindo em ${url} (somente rede interna; dados vêm de ${config.rest.url})`);
  } catch (e) {
    logger.erro(`não foi possível iniciar o GraphQL: ${e.code ?? e.message}`);
    process.exit(1);
  }
}
