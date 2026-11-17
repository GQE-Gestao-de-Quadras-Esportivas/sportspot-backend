// Base comum dos consumidores: topologia, ack manual, prefetch,
// nova tentativa limitada, DLQ e idempotência.
//
// Topologia criada para cada consumidor (ex.: fila "notificacoes"):
//
//   sportspot.eventos (topic) ──[padrões de ligação]──► notificacoes
//                                                         │  erro: republica em notificacoes.retry
//                                                         │  (espera RETRY_DELAY_MS e volta para notificacoes)
//                                                         │  erro na última tentativa: nack → DLX
//                                                         ▼
//                                 sportspot.dlx (direct) ──► notificacoes.dlq

import amqp from "amqplib";
import { Idempotencia } from "./idempotencia.js";

export const EXCHANGE = "sportspot.eventos";
export const DLX = "sportspot.dlx";

const RABBITMQ_URL = process.env.RABBITMQ_URL || "amqp://guest:guest@127.0.0.1:5672";
const MAX_TENTATIVAS = Number(process.env.MAX_TENTATIVAS || 3);
const RETRY_DELAY_MS = Number(process.env.RETRY_DELAY_MS || 2000);
const PREFETCH = Number(process.env.PREFETCH || 10);

/**
 * @param {object}   opcoes
 * @param {string}   opcoes.nome      nome do consumidor e da fila
 * @param {string[]} opcoes.ligacoes  padrões de ligação na exchange topic (ex.: "agendamento.*")
 * @param {(evento: object, ctx: {log: Function, tentativa: number}) => Promise<void>} opcoes.processar
 *        efeito do consumidor; lançar um erro aciona a nova tentativa
 */
export async function iniciarConsumidor(opcoes) {
  let atual = null; // { conexao, canal } da conexão ativa
  let encerrando = false;
  const processados = new Idempotencia(opcoes.nome);

  // Conecta e, se não der (RabbitMQ ainda subindo ou fora do ar), tenta de novo a cada 3 s.
  // Se a conexão cair depois, reconecta do mesmo jeito.
  const conectar = async () => {
    try {
      atual = await configurar(opcoes, processados);
      atual.conexao.on("close", () => {
        if (encerrando) return;
        console.error(`[${opcoes.nome}] conexão com o RabbitMQ perdida; reconectando em 3 s...`);
        setTimeout(conectar, 3000);
      });
      atual.conexao.on("error", () => {}); // o "close" que vem em seguida trata
    } catch (erro) {
      console.error(`[${opcoes.nome}] RabbitMQ indisponível (${erro.code ?? erro.message}); nova tentativa em 3 s...`);
      setTimeout(conectar, 3000);
    }
  };
  await conectar();

  const encerrar = async () => {
    encerrando = true;
    console.log(`[${opcoes.nome}] encerrando...`);
    await atual?.canal.close().catch(() => {});
    await atual?.conexao.close().catch(() => {});
    process.exit(0);
  };
  process.on("SIGINT", encerrar);
  process.on("SIGTERM", encerrar);
}

async function configurar({ nome, ligacoes, processar }, processados) {
  const fila = nome;
  const filaRetry = `${nome}.retry`;
  const filaDlq = `${nome}.dlq`;

  const conexao = await amqp.connect(RABBITMQ_URL);
  const canal = await conexao.createChannel();

  // ---- topologia (idempotente: pode rodar várias vezes) ----
  await canal.assertExchange(EXCHANGE, "topic", { durable: true });
  await canal.assertExchange(DLX, "direct", { durable: true });

  // Fila principal: o que for rejeitado (nack sem requeue) vai para a DLX
  await canal.assertQueue(fila, {
    durable: true,
    arguments: { "x-dead-letter-exchange": DLX, "x-dead-letter-routing-key": fila },
  });
  for (const padrao of ligacoes) await canal.bindQueue(fila, EXCHANGE, padrao);

  // Fila de espera: segura a mensagem por RETRY_DELAY_MS e a devolve à fila principal
  await canal.assertQueue(filaRetry, {
    durable: true,
    arguments: {
      "x-message-ttl": RETRY_DELAY_MS,
      "x-dead-letter-exchange": "", // exchange padrão: entrega direto na fila pelo nome
      "x-dead-letter-routing-key": fila,
    },
  });

  // DLQ: mensagens que esgotaram as tentativas, para análise manual
  await canal.assertQueue(filaDlq, { durable: true });
  await canal.bindQueue(filaDlq, DLX, fila);

  // No máximo PREFETCH mensagens sem ack por vez neste consumidor
  await canal.prefetch(PREFETCH);

  console.log(
    `[${nome}] aguardando eventos na fila "${fila}" | ligações: ${ligacoes.join(", ")} | ` +
      `tentativas: ${MAX_TENTATIVAS} | prefetch: ${PREFETCH}`,
  );

  await canal.consume(
    fila,
    async (msg) => {
      if (!msg) return; // fila removida ou consumidor cancelado pelo broker

      const headers = msg.properties.headers || {};
      const tentativa = Number(headers["x-tentativa"] || 1);
      let evento;
      try {
        evento = JSON.parse(msg.content.toString());
      } catch {
        console.error(`[${nome}] mensagem com JSON inválido: vai direto para a DLQ`);
        return canal.nack(msg, false, false);
      }

      const requestId = headers["x-request-id"] || evento.requestId || "sem-request-id";
      const eventId = evento.eventId || msg.properties.messageId;
      const log = (texto) => console.log(`[${nome}] [${requestId}] ${texto}`);

      // ---- idempotência: o mesmo eventId não produz efeito duas vezes ----
      if (processados.jaProcessado(eventId)) {
        log(`⏭  ${evento.type} (eventId ${eventId}) já processado: ignorado, sem repetir o efeito`);
        return canal.ack(msg);
      }

      try {
        log(`▶  ${evento.type} recebido (eventId ${eventId}, tentativa ${tentativa}/${MAX_TENTATIVAS})`);
        await processar(evento, { log, tentativa });
        processados.registrar(eventId); // registra antes do ack
        canal.ack(msg);
      } catch (erro) {
        if (tentativa < MAX_TENTATIVAS) {
          log(`⚠  falhou (${erro.message}); nova tentativa em ${RETRY_DELAY_MS} ms`);
          // Copia a mensagem para a fila de espera com o contador incrementado
          canal.sendToQueue(filaRetry, msg.content, {
            ...msg.properties,
            persistent: true,
            headers: { ...headers, "x-tentativa": tentativa + 1, "x-ultimo-erro": erro.message },
          });
          canal.ack(msg);
        } else {
          log(`✖  falhou na tentativa ${tentativa}/${MAX_TENTATIVAS} (${erro.message}); enviada para ${filaDlq}`);
          canal.nack(msg, false, false); // sem requeue: a DLX encaminha para a DLQ
        }
      }
    },
    { noAck: false }, // confirmação manual
  );

  return { conexao, canal };
}
