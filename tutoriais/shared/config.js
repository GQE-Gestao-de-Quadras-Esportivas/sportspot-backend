// Configuração central do protótipo SportSpot.
// Todos os valores têm um padrão de desenvolvimento e podem ser trocados por
// variáveis de ambiente (veja .env.example). Nenhum valor aqui é segredo real.

const env = process.env;
const num = (valor, padrao) => (valor === undefined || valor === '' ? padrao : Number(valor));

export const config = {
  // Serviços internos: ouvem apenas em 127.0.0.1 (rede interna).
  rest: {
    host: env.REST_HOST ?? '127.0.0.1',
    porta: num(env.REST_PORTA, 3001),
    url: env.REST_URL ?? 'http://127.0.0.1:3001',
  },
  graphql: {
    host: env.GRAPHQL_HOST ?? '127.0.0.1',
    porta: num(env.GRAPHQL_PORTA, 3002),
    url: env.GRAPHQL_URL ?? 'http://127.0.0.1:3002',
  },
  // Único ponto de entrada público.
  gateway: {
    host: env.GATEWAY_HOST ?? '0.0.0.0',
    porta: num(env.GATEWAY_PORTA, 3000),
    timeoutMs: num(env.GATEWAY_TIMEOUT_MS, 2500),
    disjuntor: {
      limiteFalhas: num(env.DISJUNTOR_LIMITE_FALHAS, 3),
      tempoAbertoMs: num(env.DISJUNTOR_TEMPO_ABERTO_MS, 15000),
    },
    novasTentativas: num(env.GATEWAY_NOVAS_TENTATIVAS, 2),
    janelaLimiteMs: num(env.GATEWAY_JANELA_LIMITE_MS, 60000),
    jwtSegredo: env.JWT_SEGREDO ?? 'segredo-de-desenvolvimento-sportspot-nao-usar-em-producao',
  },
  rabbit: {
    url: env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672',
    painelUrl: env.RABBITMQ_PAINEL_URL ?? 'http://localhost:15672',
    painelUsuario: env.RABBITMQ_PAINEL_USUARIO ?? 'guest',
    painelSenha: env.RABBITMQ_PAINEL_SENHA ?? 'guest',
    exchange: 'sportspot.eventos',
    exchangeMortas: 'sportspot.dlx',
    prefetch: num(env.CONSUMIDOR_PREFETCH, 5),
    maxTentativas: num(env.CONSUMIDOR_MAX_TENTATIVAS, 3),
    esperaNovaTentativaMs: num(env.CONSUMIDOR_ESPERA_MS, 2000),
  },
  // Fuso de Brasília (UTC-3, sem horário de verão desde 2019).
  fusoMinutos: -180,
  // Permite a rota /diagnostico/lento (usada para demonstrar o 504).
  simulacoes: (env.SIMULACOES ?? 'on') !== 'off',
};
