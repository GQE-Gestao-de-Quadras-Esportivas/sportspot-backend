// Base comum dos consumidores do SportSpot (Parte 2).
//
// Para cada consumidor <nome> é declarada esta topologia no RabbitMQ:
//
//   sportspot.eventos (topic) --[padrões de ligação]--> sportspot.<nome>        (fila principal)
//   sportspot.<nome>  --nack sem requeue--> sportspot.dlx (direct) --> sportspot.<nome>.dlq
//   sportspot.<nome>.retry (TTL) --expira--> volta para sportspot.<nome>          (nova tentativa)
//
// - filas durable, mensagens persistent, ack manual e prefetch;
// - falha: nova tentativa limitada (maxTentativas), com espera via fila de retry;
//   esgotadas as tentativas, a mensagem vai para a DLQ;
// - idempotência: o eventId (messageId) de cada mensagem processada é gravado
//   em disco, junto com o estado do consumidor; uma mensagem repetida é
//   reconhecida e confirmada (ack) sem repetir o efeito;
// - o X-Request-Id que veio no evento aparece em todas as linhas de log.
import amqp from 'amqplib';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../shared/config.js';
import { criarLogger } from '../shared/logger.js';

const PASTA_DADOS = join(dirname(fileURLToPath(import.meta.url)), 'dados');
const MAX_IDS_GUARDADOS = 10_000;

/** Estado persistido do consumidor: ids já processados + estado do negócio. */
export function criarArmazem(nome, estadoInicial = {}) {
  const arquivo = join(PASTA_DADOS, `${nome}.json`);
  mkdirSync(PASTA_DADOS, { recursive: true });
  let dados = { processadas: [], estado: estadoInicial };
  if (existsSync(arquivo)) dados = JSON.parse(readFileSync(arquivo, 'utf8'));
  const ids = new Set(dados.processadas);
  return {
    arquivo,
    estado: dados.estado,
    jaProcessada: (id) => ids.has(id),
    /** Grava o id e o estado novo de uma vez (escrita atômica: arquivo temporário + rename). */
    confirmar(id) {
      ids.add(id);
      const lista = [...ids].slice(-MAX_IDS_GUARDADOS);
      const tmp = `${arquivo}.tmp`;
      writeFileSync(tmp, JSON.stringify({ processadas: lista, estado: dados.estado }, null, 2));
      renameSync(tmp, arquivo);
    },
  };
}

export async function iniciarConsumidor({ nome, ligacoes, processar, estadoInicial }) {
  const logger = criarLogger(`consumidor-${nome}`);
  const armazem = criarArmazem(nome, estadoInicial);
  const { url, exchange, exchangeMortas, prefetch, maxTentativas, esperaNovaTentativaMs } = config.rabbit;
  const fila = `sportspot.${nome}`;
  const filaRetry = `${fila}.retry`;
  const dlq = `${fila}.dlq`;

  async function conectar() {
    const conexao = await amqp.connect(url);
    conexao.on('error', (e) => logger.warn('erro na conexão', { erro: e.message }));
    const canal = await conexao.createChannel();
    canal.on('error', (e) => logger.erro(`erro no canal: ${e.message}`));

    await canal.assertExchange(exchange, 'topic', { durable: true });
    await canal.assertExchange(exchangeMortas, 'direct', { durable: true });

    await canal.assertQueue(dlq, { durable: true });
    await canal.bindQueue(dlq, exchangeMortas, nome);

    await canal.assertQueue(filaRetry, {
      durable: true,
      arguments: {
        'x-message-ttl': esperaNovaTentativaMs,
        'x-dead-letter-exchange': '',
        'x-dead-letter-routing-key': fila,
      },
    });

    await canal.assertQueue(fila, {
      durable: true,
      arguments: { 'x-dead-letter-exchange': exchangeMortas, 'x-dead-letter-routing-key': nome },
    });
    for (const padrao of ligacoes) await canal.bindQueue(fila, exchange, padrao);

    await canal.prefetch(prefetch);
    logger.info(`aguardando eventos na fila "${fila}" (ligações: ${ligacoes.join(', ')}; prefetch ${prefetch}; até ${maxTentativas} tentativas; DLQ "${dlq}")`);

    await canal.consume(fila, (msg) => tratar(canal, msg), { noAck: false });

    conexao.on('close', () => {
      logger.warn('conexão com o RabbitMQ perdida; nova tentativa em 3 s');
      setTimeout(iniciar, 3000);
    });
  }

  async function tratar(canal, msg) {
    if (!msg) return;
    const props = msg.properties;
    const headers = props.headers ?? {};
    const requestId = headers['x-request-id'] ?? props.correlationId;
    const tentativa = Number(headers['x-tentativa'] ?? 1);
    const rotulo = msg.fields.routingKey;

    let evento;
    try {
      evento = JSON.parse(msg.content.toString('utf8'));
    } catch {
      logger.erro(`mensagem ilegível (não é JSON); enviada direto para a DLQ`, { requestId, routingKey: rotulo });
      return canal.nack(msg, false, false);
    }
    const idMensagem = props.messageId ?? evento.eventId;

    // Idempotência: a mesma mensagem recebida de novo não repete o efeito
    if (armazem.jaProcessada(idMensagem)) {
      logger.warn(`mensagem duplicada ignorada (${rotulo}); efeito já aplicado antes`, { requestId, eventId: idMensagem });
      return canal.ack(msg);
    }

    try {
      logger.info(`recebido ${rotulo} (tentativa ${tentativa}/${maxTentativas})`, { requestId, eventId: idMensagem });
      await processar(evento, { estado: armazem.estado, logger, requestId, tentativa });
      armazem.confirmar(idMensagem); // grava efeito + id processado juntos
      canal.ack(msg);
    } catch (erro) {
      if (tentativa < maxTentativas) {
        logger.warn(`falha ao processar ${rotulo}: ${erro.message}; nova tentativa em ${esperaNovaTentativaMs} ms`, { requestId, eventId: idMensagem, tentativa });
        // Os cabeçalhos x-death/x-first-death/x-last-death são do broker: não são copiados para a nova mensagem.
        const cabecalhosDoNegocio = Object.fromEntries(Object.entries(headers).filter(([k]) => !/^x-(first-|last-)?death/.test(k)));
        canal.sendToQueue(filaRetry, msg.content, {
          persistent: true,
          contentType: props.contentType,
          messageId: props.messageId,
          correlationId: props.correlationId,
          type: props.type,
          appId: props.appId,
          timestamp: props.timestamp,
          headers: { ...cabecalhosDoNegocio, 'x-tentativa': tentativa + 1, 'x-ultimo-erro': erro.message },
        });
        canal.ack(msg);
      } else {
        logger.erro(`falhou ${tentativa} vezes (${erro.message}); mensagem enviada para a DLQ "${dlq}"`, { requestId, eventId: idMensagem });
        canal.nack(msg, false, false); // sem requeue: dead-letter para a DLQ
      }
    }
  }

  async function iniciar() {
    try {
      await conectar();
    } catch (e) {
      if (String(e.message).includes('PRECONDITION_FAILED')) {
        logger.erro(`a fila já existe com outros argumentos (${e.message}). Apague as filas sportspot.* no painel http://localhost:15672 e rode de novo.`);
        process.exit(1);
      }
      logger.warn(`RabbitMQ indisponível (${e.code ?? e.message}); nova tentativa em 3 s. O Docker Desktop está aberto e o "docker compose up -d" foi executado?`);
      setTimeout(iniciar, 3000);
    }
  }

  await iniciar();
  return { logger, armazem };
}

/** Erro de negócio usado para simular falhas reais (ex.: e-mail inválido). */
export class ErroDeProcessamento extends Error {}
