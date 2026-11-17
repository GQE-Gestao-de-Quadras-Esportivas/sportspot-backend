// Servidor GraphQL do SportSpot (Apollo Server 5).
// Escuta só em 127.0.0.1: de fora, é alcançado pelo gateway em /api/graphql.

import { ApolloServer } from "@apollo/server";
import { startStandaloneServer } from "@apollo/server/standalone";
import DataLoader from "dataloader";
import { randomUUID } from "node:crypto";
import { typeDefs } from "./schema.js";
import { resolvers, quadraDaApi } from "./resolvers.js";
import { RestClient } from "./rest-client.js";

const HOST = process.env.GRAPHQL_HOST || "127.0.0.1";
const PORT = Number(process.env.GRAPHQL_PORT || 4000);

// Plugin: registra no log e devolve em "extensions" quantas chamadas REST
// cada operação fez. É a evidência de quantas chamadas uma consulta substitui.
const contarChamadasRest = {
  async requestDidStart() {
    return {
      async willSendResponse({ response, contextValue, operationName }) {
        const { rest } = contextValue;
        if (response.body.kind === "single") {
          response.body.singleResult.extensions = {
            ...response.body.singleResult.extensions,
            chamadasRest: { total: rest.chamadas.length, detalhes: rest.chamadas },
          };
        }
        if (operationName !== "IntrospectionQuery") {
          console.log(
            `[graphql] [${rest.requestId}] ${operationName ?? "(sem nome)"} → ${rest.chamadas.length} chamada(s) REST`,
          );
        }
      },
    };
  },
};

const server = new ApolloServer({
  typeDefs,
  resolvers,
  plugins: [contarChamadasRest],
  introspection: true, // permite o Apollo Sandbox listar o schema
  includeStacktraceInErrorResponses: false, // não expõe caminhos de arquivos do servidor ao cliente
});

const { url } = await startStandaloneServer(server, {
  listen: { host: HOST, port: PORT },
  // A função context roda a cada requisição: lê os cabeçalhos que o gateway repassou
  // e cria, POR REQUISIÇÃO, o cliente REST e o DataLoader (o cache não vaza entre usuários).
  context: async ({ req }) => {
    const rest = new RestClient({
      requestId: req.headers["x-request-id"] || randomUUID(),
      authorization: req.headers.authorization,
      clienteId: req.headers["x-cliente-id"],
    });

    const loaders = {
      // Recebe vários ids de uma vez e faz UMA chamada: GET /courts?ids=a,b,c
      quadra: new DataLoader(
        async (ids) => {
          const resposta = await rest.get(`/courts?ids=${ids.map(encodeURIComponent).join(",")}&limit=50`);
          const porId = new Map(resposta.data.map((c) => [c.id, quadraDaApi(c)]));
          return ids.map((id) => porId.get(id) ?? null); // mesma ordem dos ids pedidos
        },
        { maxBatchSize: 50 }, // teto de página da API
      ),
    };

    return { rest, loaders };
  },
});

console.log(`🔷 GraphQL em ${url} (pelo gateway: http://localhost:8080/api/graphql)`);
