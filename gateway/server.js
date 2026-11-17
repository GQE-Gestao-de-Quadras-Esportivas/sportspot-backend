// API Gateway do SportSpot: o ÚNICO ponto de entrada do sistema.
//
//   cliente ──► gateway :8080 ──► /api/rest/*     → API REST   127.0.0.1:3000/v1/api/*
//                              ├► /api/graphql    → GraphQL    127.0.0.1:4000/
//                              └► /api/painel/... → agrega REST + faturamento (127.0.0.1:3100)
//
// Ordem dos middlewares: X-Request-Id → CORS → chave de API (401) → limite (429) → rota.

import express from "express";
import { config, rotas, clientes } from "./config.js";
import { requestId } from "./lib/request-id.js";
import { autenticarCliente } from "./lib/autenticacao.js";
import { limitarUso } from "./lib/limite.js";
import { criarProxy } from "./lib/proxy.js";
import { painelQuadra } from "./lib/painel.js";
import { disjuntores } from "./lib/disjuntor.js";
import { enviarProblema } from "./lib/problema.js";

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", false);

app.use(requestId);

// CORS para o frontend Angular (que também precisa mandar a X-API-Key)
app.use((req, res, next) => {
  const origem = req.get("origin");
  if (origem && origem === config.corsOrigin) {
    res.setHeader("Access-Control-Allow-Origin", origem);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Expose-Headers", "Location, X-Request-Id, X-Total-Count, Retry-After, RateLimit-Remaining");
    res.setHeader("Vary", "Origin");
  }
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-API-Key, X-Request-Id");
    return res.status(204).end();
  }
  next();
});

// Estado do gateway (sem chave): útil na demonstração para ver os disjuntores
app.get("/gateway/status", (_req, res) => {
  res.json({
    disjuntores: Object.fromEntries(
      Object.entries(disjuntores).map(([nome, d]) => [nome, { estado: d.estado, falhasSeguidas: d.falhasSeguidas }]),
    ),
    clientes: Object.values(clientes).map(({ id, limitePorMinuto }) => ({ id, limitePorMinuto })),
  });
});

// Daqui para baixo, tudo exige chave de API e respeita o limite do plano
app.use("/api", autenticarCliente, limitarUso);

// O corpo é repassado como veio (bytes), sem o gateway interpretar o JSON
const corpoBruto = express.raw({ type: () => true, limit: "1mb" });

app.get("/api/painel/quadras/:id", painelQuadra);
for (const rota of rotas) {
  app.use(rota.prefixo, corpoBruto, criarProxy(rota));
}

// Rota inexistente no gateway
app.use((req, res) => {
  enviarProblema(req, res, 404, "rota-inexistente", "Rota não encontrada",
    `O gateway não tem a rota ${req.method} ${req.path}. Rotas: /api/rest/*, /api/graphql, /api/painel/quadras/:id`);
});

// Erro inesperado no próprio gateway
app.use((err, req, res, _next) => {
  if (err.type === "entity.too.large") {
    return enviarProblema(req, res, 413, "corpo-muito-grande", "Corpo muito grande", "O limite é 1 MB.");
  }
  console.error(`[gateway] [${req.requestId}] erro inesperado:`, err);
  enviarProblema(req, res, 500, "erro-interno", "Erro interno no gateway", "Informe o requestId ao suporte.");
});

app.listen(config.port, config.host, () => {
  console.log(`🚪 Gateway em http://localhost:${config.port} (escutando em ${config.host})`);
  for (const r of rotas) console.log(`   ${r.prefixo}/* → ${r.servico}${r.caminhoInterno}`);
  console.log("   /api/painel/quadras/:id → agregação (api-rest + faturamento)");
});
