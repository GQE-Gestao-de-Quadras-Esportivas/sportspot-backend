// Cena 7: rota agregada com degradação graciosa.
// GET /api/painel/quadras/:id junta, em UMA chamada:
//   quadra (API REST) + reservas (API REST) + receita (serviço de faturamento)
//
// Uso: node testes/teste-painel.js
// Precisa de: API REST, consumidor de faturamento e gateway no ar.

import { chamar, pausar, novoUsuarioComToken, QUADRA, esperar } from "./lib/gateway.js";

const token = await novoUsuarioComToken();
const { dados: quadra } = await chamar("/api/rest/courts", { metodo: "POST", token, corpo: QUADRA });

// Uma reserva para daqui a 2 dias, para o painel ter reservas e receita
const inicio = new Date(Date.now() + 2 * 86400_000);
inicio.setMinutes(0, 0, 0);
await chamar(`/api/rest/courts/${quadra.id}/appointments`, {
  metodo: "POST",
  token,
  corpo: { start_time: inicio.toISOString(), end_time: new Date(+inicio + 2 * 3600_000).toISOString() },
});
await esperar(1000); // o faturamento processa o evento de forma assíncrona

const painel = () => chamar(`/api/painel/quadras/${quadra.id}`, { token, requestId: `painel-${Date.now()}` });

const completo = await painel();
console.log(`\n── Resposta completa (${completo.status}) ──`);
console.log(JSON.stringify(resumo(completo.dados), null, 2));

await pausar("Agora DESLIGUE o consumidor de faturamento (Ctrl+C no terminal dele).");

const parcial = await painel();
console.log(`\n── Resposta parcial, com o faturamento fora do ar (${parcial.status}) ──`);
console.log(JSON.stringify(resumo(parcial.dados), null, 2));

function resumo(d) {
  if (!d?.quadra) return d;
  return {
    quadra: { id: d.quadra.id, court_name: d.quadra.court_name, price: d.quadra.price },
    proximasReservas: d.proximasReservas?.map((r) => ({ start_time: r.start_time, price: r.price })) ?? null,
    receita: d.receita,
    parcial: d.parcial,
    ...(d.avisos ? { avisos: d.avisos } : {}),
  };
}
