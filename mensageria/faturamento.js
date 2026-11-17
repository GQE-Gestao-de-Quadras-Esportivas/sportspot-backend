// Consumidor 2: FATURAMENTO
// Recebe SÓ as reservas criadas (agendamento.criado), ou seja, parte dos eventos,
// e soma a receita prevista de cada quadra em dados/faturamento.json.
//
// É aqui que a idempotência faz diferença: sem ela, a mesma mensagem entregue
// duas vezes somaria a receita em dobro.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { iniciarConsumidor } from "./lib/consumidor.js";
import { caminhoDados } from "./lib/idempotencia.js";

const arquivo = caminhoDados("faturamento.json");
const ler = () => (existsSync(arquivo) ? JSON.parse(readFileSync(arquivo, "utf8")) : { totalGeral: 0, quadras: {} });

await iniciarConsumidor({
  nome: "faturamento",
  ligacoes: ["agendamento.criado"], // não recebe agendamento.cancelado
  async processar(evento, { log }) {
    const d = evento.data;
    const fat = ler();
    const q = (fat.quadras[d.courtId] ??= { nome: d.courtName, reservas: 0, receita: 0 });

    q.reservas += 1;
    q.receita = Math.round((q.receita + Number(d.price || 0)) * 100) / 100;
    fat.totalGeral = Math.round((fat.totalGeral + Number(d.price || 0)) * 100) / 100;
    writeFileSync(arquivo, JSON.stringify(fat, null, 2));

    log(`💰 +R$ ${Number(d.price).toFixed(2)} em "${d.courtName}" | quadra: R$ ${q.receita.toFixed(2)} | total geral: R$ ${fat.totalGeral.toFixed(2)}`);
  },
});

// ---- Consulta HTTP da receita (usada pela rota agregada do gateway) ----
// Escuta só em 127.0.0.1: é chamada pelo gateway, nunca direto de fora.
import { createServer } from "node:http";

const PORTA_HTTP = Number(process.env.FATURAMENTO_PORT || 3100);
createServer((req, res) => {
  const requestId = req.headers["x-request-id"] ?? "-";
  const m = req.url.match(/^\/quadras\/([^/?]+)/);
  if (req.method !== "GET" || !m) {
    res.writeHead(404, { "Content-Type": "application/problem+json" });
    return res.end(JSON.stringify({ type: "/problemas/rota-inexistente", title: "Rota não encontrada", status: 404 }));
  }
  const q = ler().quadras[decodeURIComponent(m[1])] ?? { reservas: 0, receita: 0 };
  console.log(`[faturamento] [${requestId}] consulta HTTP da receita da quadra ${m[1]}`);
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ courtId: m[1], reservas: q.reservas, receita: q.receita }));
}).listen(PORTA_HTTP, "127.0.0.1", () => {
  console.log(`[faturamento] consulta HTTP em http://127.0.0.1:${PORTA_HTTP}/quadras/:id`);
});
