// Configuração do gateway: serviços internos, clientes e planos de uso.
// As chaves são FICTÍCIAS, só para a demonstração.

export const config = {
  host: process.env.GATEWAY_HOST || "0.0.0.0", // única porta acessível de fora
  port: Number(process.env.GATEWAY_PORT || 8080),
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:4200",
};

// Serviços atrás do gateway. Todos escutam só em 127.0.0.1.
export const servicos = {
  rest: {
    nome: "api-rest",
    url: process.env.REST_URL || "http://127.0.0.1:3000",
    // Caderno de restrições (EARS): "se a busca por quadras exceder 4 segundos,
    // o sistema deve abortar a conexão e retornar falha padronizada" → 504 em Problem Details
    timeoutMs: Number(process.env.REST_TIMEOUT_MS || 4000),
  },
  graphql: {
    nome: "graphql",
    url: process.env.GRAPHQL_URL || "http://127.0.0.1:4000",
    timeoutMs: Number(process.env.GRAPHQL_TIMEOUT_MS || 5000),
  },
  faturamento: {
    nome: "faturamento",
    url: process.env.FATURAMENTO_URL || "http://127.0.0.1:3100",
    timeoutMs: Number(process.env.FATURAMENTO_TIMEOUT_MS || 2000),
  },
};

// Rotas expostas: prefixo público → serviço + caminho interno
export const rotas = [
  { prefixo: "/api/rest", servico: "rest", caminhoInterno: "/v1/api" },
  // O Apollo standalone atende em qualquer caminho; usamos "/"
  { prefixo: "/api/graphql", servico: "graphql", caminhoInterno: "/" },
];

// Clientes do SportSpot, identificados pela chave de API (cabeçalho X-API-Key)
export const clientes = {
  "chave-app-jogador-123": {
    id: "app-jogador",
    descricao: "Aplicativo do jogador (busca quadras e reserva horários)",
    limitePorMinuto: 10,
  },
  "chave-painel-locador-456": {
    id: "painel-locador",
    descricao: "Painel web do proprietário (gerencia quadras e reservas)",
    limitePorMinuto: 120,
  },
};

// Disjuntor: abre após N falhas seguidas e fica aberto por um tempo
export const disjuntorConfig = {
  limiteFalhas: Number(process.env.DISJUNTOR_FALHAS || 3),
  tempoAbertoMs: Number(process.env.DISJUNTOR_ABERTO_MS || 15000),
};

// Cabeçalhos repassados (lista de permissão): todo o resto é descartado
export const cabecalhosRequisicao = ["content-type", "accept", "authorization", "cookie"];
export const cabecalhosResposta = [
  "content-type",
  "location",
  "x-total-count",
  "retry-after",
  "set-cookie",
  "cache-control",
];
