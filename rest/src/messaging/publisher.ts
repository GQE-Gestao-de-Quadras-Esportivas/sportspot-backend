import amqp, { ChannelModel, ConfirmChannel } from "amqplib";
import { randomUUID } from "node:crypto";
import { config } from "../config.js";

// Exchange do tipo topic: os consumidores escolhem o que recebem pelas chaves de roteamento.
//   agendamento.criado     → reserva feita
//   agendamento.cancelado  → reserva cancelada
export const EXCHANGE = "sportspot.eventos";

export interface EventEnvelope<T> {
  eventId: string; // identificador único: é a chave da idempotência nos consumidores
  type: string; // igual à chave de roteamento
  occurredAt: string;
  requestId: string; // X-Request-Id da requisição HTTP que originou o evento
  data: T;
}

let connection: ChannelModel | null = null;
let channel: ConfirmChannel | null = null;
let connecting: Promise<ConfirmChannel> | null = null;

async function getChannel(): Promise<ConfirmChannel> {
  if (channel) return channel;
  if (connecting) return connecting;

  connecting = (async () => {
    connection = await amqp.connect(config.rabbitUrl);
    // Se a conexão cair, a próxima publicação abre outra
    connection.on("close", () => {
      connection = null;
      channel = null;
    });
    connection.on("error", (err) => console.error("[rest] [rabbitmq] erro na conexão:", err.message));

    // Confirm channel: o broker confirma que recebeu e gravou cada mensagem
    const ch = await connection.createConfirmChannel();
    await ch.assertExchange(EXCHANGE, "topic", { durable: true });
    channel = ch;
    console.log(`[rest] [rabbitmq] conectado; exchange "${EXCHANGE}" pronta`);
    return ch;
  })();

  try {
    return await connecting;
  } finally {
    connecting = null;
  }
}

/**
 * Publica um evento de negócio. É chamado DEPOIS de a alteração ser gravada no banco,
 * e a API NÃO espera por ele: a resposta HTTP sai na hora, e os consumidores processam depois.
 *
 * Se o RabbitMQ estiver fora do ar, a reserva continua salva e o erro só vai para o log.
 * Esse é o risco "publicação fora da transação": o evento pode se perder.
 * Em produção, o padrão Outbox resolve isso.
 */
export function publishEvent<T>(routingKey: string, data: T, requestId: string): void {
  const event: EventEnvelope<T> = {
    eventId: randomUUID(),
    type: routingKey,
    occurredAt: new Date().toISOString(),
    requestId,
    data,
  };

  getChannel()
    .then(
      (ch) =>
        new Promise<void>((resolve, reject) => {
          ch.publish(EXCHANGE, routingKey, Buffer.from(JSON.stringify(event)), {
            persistent: true, // a mensagem sobrevive a um reinício do broker
            contentType: "application/json",
            messageId: event.eventId,
            correlationId: requestId,
            headers: { "x-request-id": requestId },
            timestamp: Math.floor(Date.now() / 1000),
          }, (err) => (err ? reject(err) : resolve()));
        }),
    )
    .then(() => console.log(`[rest] [${requestId}] evento publicado: ${routingKey} (eventId ${event.eventId})`))
    .catch((err) =>
      console.error(`[rest] [${requestId}] FALHA ao publicar ${routingKey}: ${err.message} (a alteração já foi gravada)`),
    );
}

export async function closePublisher() {
  await channel?.close().catch(() => {});
  await connection?.close().catch(() => {});
}
