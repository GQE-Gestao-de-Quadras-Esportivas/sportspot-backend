// Cena 4b: duplicidade.
// Publica DUAS VEZES a mesma mensagem (mesmo eventId), como aconteceria se o
// publicador reenviasse após perder a confirmação do broker.
// Os dois consumidores processam a primeira e ignoram a segunda:
// um só e-mail, e a receita no faturamento soma uma vez só.
//
// Uso: node testes/evento-duplicado.js   (com os dois consumidores rodando)

import { randomUUID } from "node:crypto";
import { publicarEventoDeTeste, esperar } from "./lib/rabbit.js";

const eventId = randomUUID();
const requestId = `duplicado-${Date.now()}`;

await publicarEventoDeTeste({}, { eventId, requestId });
await publicarEventoDeTeste({}, { eventId, requestId });

console.log(`Mesma mensagem publicada 2 vezes (eventId ${eventId}, X-Request-Id ${requestId}).`);
await esperar(1500);
console.log('Veja nos logs dos consumidores: a segunda entrega aparece como "já processado: ignorado".');
console.log("Confira também mensageria/dados/faturamento.json: a receita foi somada uma única vez.");
