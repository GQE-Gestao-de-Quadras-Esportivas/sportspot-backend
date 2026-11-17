// Cena 4a: falha provocada.
// Publica um "agendamento.criado" com e-mail inválido. O consumidor de notificações
// falha, tenta de novo até 3 vezes e manda a mensagem para notificacoes.dlq.
// O consumidor de faturamento não depende de e-mail e processa normalmente:
// a falha de um consumidor não afeta o outro.
//
// Uso: node testes/evento-falha.js   (com os dois consumidores rodando)

import { publicarEventoDeTeste, contarFilas, esperar } from "./lib/rabbit.js";

const antes = await contarFilas(["notificacoes.dlq"]);
const { eventId, requestId } = await publicarEventoDeTeste({ customerEmail: "email-sem-arroba" });

console.log(`Evento publicado com e-mail inválido (eventId ${eventId}, X-Request-Id ${requestId}).`);
console.log("Aguardando as tentativas (3 × 2 s)...");
await esperar(8000);

const depois = await contarFilas(["notificacoes.dlq"]);
console.log(`\nMensagens em notificacoes.dlq: antes ${antes["notificacoes.dlq"]} → depois ${depois["notificacoes.dlq"]}`);
console.log("Painel: http://localhost:15672/#/queues  (usuário guest, senha guest)");
