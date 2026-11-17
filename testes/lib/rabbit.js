// Utilitários dos scripts de teste da mensageria.

import amqp from "amqplib";
import { randomUUID } from "node:crypto";

const RABBITMQ_URL = process.env.RABBITMQ_URL || "amqp://guest:guest@127.0.0.1:5672";
const EXCHANGE = "sportspot.eventos";

export const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// Publica um agendamento.criado fictício, no mesmo formato que a API publica
export async function publicarEventoDeTeste(dadosExtras = {}, { eventId = randomUUID(), requestId = `teste-${Date.now()}` } = {}) {
  const inicio = new Date(Date.now() + 5 * 86400_000);
  const evento = {
    eventId,
    type: "agendamento.criado",
    occurredAt: new Date().toISOString(),
    requestId,
    data: {
      appointmentId: randomUUID(),
      courtId: "00000000-0000-0000-0000-00000000test",
      courtName: "Quadra de Teste",
      sport: "futebol",
      landlordId: randomUUID(),
      landlordEmail: "dono@exemplo.com",
      customerId: randomUUID(),
      customerEmail: "jogador@exemplo.com",
      startTime: inicio.toISOString(),
      endTime: new Date(+inicio + 3600_000).toISOString(),
      price: 100,
      ...dadosExtras,
    },
  };

  const conexao = await amqp.connect(RABBITMQ_URL);
  const canal = await conexao.createConfirmChannel();
  await canal.assertExchange(EXCHANGE, "topic", { durable: true });
  canal.publish(EXCHANGE, evento.type, Buffer.from(JSON.stringify(evento)), {
    persistent: true,
    contentType: "application/json",
    messageId: eventId,
    correlationId: requestId,
    headers: { "x-request-id": requestId },
  });
  await canal.waitForConfirms();
  await conexao.close();
  return { eventId, requestId };
}

// Conta as mensagens prontas em cada fila, direto pelo protocolo AMQP
// (o painel web atualiza as contagens com alguns segundos de atraso)
export async function contarFilas(nomes) {
  const conexao = await amqp.connect(RABBITMQ_URL);
  const resultado = {};
  for (const nome of nomes) {
    const canal = await conexao.createChannel(); // checkQueue fecha o canal se a fila não existir
    try {
      resultado[nome] = (await canal.checkQueue(nome)).messageCount;
      await canal.close();
    } catch {
      resultado[nome] = 0;
    }
  }
  await conexao.close();
  return resultado;
}
