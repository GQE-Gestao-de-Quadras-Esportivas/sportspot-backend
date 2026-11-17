// Cena 1: ambiente no ar.
// Mostra quais processos estão ouvindo e prova que SÓ o gateway é acessível de fora:
// cada porta é testada em 127.0.0.1 (a própria máquina) e no IP da rede (como outro computador veria).
//
// Uso: npm run status

import net from "node:net";
import os from "node:os";

const servicos = [
  { nome: "RabbitMQ (AMQP)", porta: 5672, publica: false },
  { nome: "RabbitMQ (painel)", porta: 15672, publica: false },
  { nome: "PostgreSQL", porta: 5432, publica: null, obs: "banco da API REST" },
  { nome: "API REST", porta: 3000, publica: false },
  { nome: "Faturamento (receita)", porta: 3100, publica: false },
  { nome: "GraphQL", porta: 4000, publica: false },
  { nome: "Gateway", porta: 8080, publica: true, obs: "ÚNICO ponto de entrada" },
];

const ipDaRede = Object.values(os.networkInterfaces())
  .flat()
  .find((i) => i && i.family === "IPv4" && !i.internal)?.address;

function aberta(host, porta) {
  return new Promise((resolve) => {
    const s = net.connect({ host, port: porta, timeout: 800 });
    s.once("connect", () => { s.destroy(); resolve(true); });
    s.once("timeout", () => { s.destroy(); resolve(false); });
    s.once("error", () => resolve(false));
  });
}

console.log(`IP desta máquina na rede: ${ipDaRede ?? "(não encontrado)"}\n`);
console.log(`${"Processo".padEnd(24)}${"Porta".padEnd(8)}${"No ar".padEnd(8)}${"Acessível de fora".padEnd(20)}Observação`);
console.log("─".repeat(90));

for (const s of servicos) {
  const local = await aberta("127.0.0.1", s.porta);
  const externo = ipDaRede ? await aberta(ipDaRede, s.porta) : false;
  let marca = "";
  if (local && s.publica === false) marca = externo ? "⚠ DEVERIA ESTAR FECHADA" : "✓ só em 127.0.0.1";
  if (local && s.nome === "Gateway") marca = externo ? "✓ porta pública" : "⚠ não acessível pela rede";
  console.log(
    `${s.nome.padEnd(24)}${String(s.porta).padEnd(8)}${(local ? "sim" : "NÃO").padEnd(8)}${(local ? (externo ? "sim" : "não") : "-").padEnd(20)}${marca || s.obs || ""}`,
  );
}
