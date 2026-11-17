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
