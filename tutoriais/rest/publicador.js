// Publicador da outbox: lê os eventos pendentes e publica no RabbitMQ.
//
// - exchange topic "sportspot.eventos" (durable)
// - chave de roteamento = tipo do evento (ex.: agendamento.criado)
// - mensagem persistent, com messageId = eventId (base da idempotência) e o
//   X-Request-Id no cabeçalho x-request-id e no correlationId
// - canal com confirmação do broker (publisher confirms): o evento só é marcado
//   como publicado depois que o RabbitMQ confirma o recebimento.
// Se o broker estiver fora do ar, a API continua funcionando; os eventos ficam
// pendentes na outbox e são publicados quando a conexão voltar.
import amqp from 'amqplib';
import { config } from '../shared/config.js';

export function iniciarPublicador({ banco, logger }) {
  const { url, exchange } = config.rabbit;
  let conexao = null;
  let canal = null;
  let ocupado = false;
  let avisouFalha = false;
  let agendado = null;

  async function conectar() {
    conexao = await amqp.connect(url);
    conexao.on('error', (e) => logger.warn('erro na conexão com o RabbitMQ', { erro: e.message }));
    conexao.on('close', () => {
      canal = null;
      conexao = null;
      logger.warn('conexão com o RabbitMQ encerrada; eventos novos ficam na outbox');
    });
    canal = await conexao.createConfirmChannel();
    canal.on('error', () => {});
    await canal.assertExchange(exchange, 'topic', { durable: true });
    avisouFalha = false;
    logger.info(`conectado ao RabbitMQ; publicando na exchange "${exchange}"`);
  }

  async function ciclo() {
    if (ocupado) return;
    ocupado = true;
    try {
      const pendentes = banco.outboxPendentes();
      if (!pendentes.length) return;
      if (!canal) await conectar();
      for (const item of pendentes) {
        const { evento } = item;
        item.tentativas++;
        canal.publish(exchange, evento.tipo, Buffer.from(JSON.stringify(evento)), {
          persistent: true,
          contentType: 'application/json',
          messageId: evento.eventId,
          correlationId: evento.requestId,
          type: evento.tipo,
          appId: 'sportspot-api-rest',
          timestamp: Math.floor(Date.now() / 1000),
          headers: { 'x-request-id': evento.requestId },
        });
        await canal.waitForConfirms();
        banco.marcarPublicado(evento.eventId);
        logger.info(`evento publicado: ${evento.tipo}`, { requestId: evento.requestId, eventId: evento.eventId });
      }
    } catch (e) {
      canal = null;
      if (!avisouFalha) {
        logger.warn('RabbitMQ indisponível; eventos ficam pendentes na outbox e serão publicados depois', {
          erro: e.code ?? e.message,
          pendentes: banco.outboxPendentes().length,
        });
        avisouFalha = true;
      }
    } finally {
      ocupado = false;
    }
  }

  // Publica logo após cada gravação e, além disso, verifica a outbox a cada 2 s.
  banco.eventos.on('novo-evento', () => {
    clearTimeout(agendado);
    agendado = setTimeout(ciclo, 10);
  });
  const intervalo = setInterval(ciclo, 2000);
  ciclo();

  return {
    async encerrar() {
      clearInterval(intervalo);
      try {
        await conexao?.close();
      } catch {
        /* já fechada */
      }
    },
  };
}
