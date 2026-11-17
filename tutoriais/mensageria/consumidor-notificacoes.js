// Consumidor 1: NOTIFICAÇÕES
// Recebe só os eventos de agendamento (padrão "agendamento.*") e envia
// (simula o envio de) e-mails ao atleta. Se o e-mail do atleta for inválido, o
// envio falha: a mensagem é tentada de novo e, esgotadas as tentativas, vai
// para a DLQ sportspot.notificacoes.dlq.
// Os e-mails "enviados" são gravados em mensageria/saida/emails.log.
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { iniciarConsumidor, ErroDeProcessamento } from './consumidor-base.js';
import { ehPrincipal } from '../shared/principal.js';

const SAIDA = join(dirname(fileURLToPath(import.meta.url)), 'saida');
const RE_EMAIL = /^[^\s@#]+@[^\s@]+\.[^\s@]+$/;

const formatar = (iso) => iso.slice(0, 16).replace('T', ' às ');

async function processar(evento, { estado, logger, requestId }) {
  const { agendamento, quadra, atleta } = evento.dados;
  if (!RE_EMAIL.test(atleta.email)) {
    throw new ErroDeProcessamento(`e-mail inválido do atleta ${atleta.id}: "${atleta.email}"`);
  }
  const assunto =
    evento.tipo === 'agendamento.criado'
      ? `Reserva confirmada: ${quadra.nome} em ${formatar(agendamento.inicio)}`
      : `Reserva cancelada: ${quadra.nome} em ${formatar(agendamento.inicio)}`;

  mkdirSync(SAIDA, { recursive: true });
  appendFileSync(join(SAIDA, 'emails.log'), JSON.stringify({ para: atleta.email, assunto, requestId, eventId: evento.eventId, enviadoEm: new Date().toISOString() }) + '\n');
  estado.enviados = (estado.enviados ?? 0) + 1;
  logger.info(`e-mail enviado para ${atleta.email}: "${assunto}"`, { requestId });
}

export const consumidorNotificacoes = () =>
  iniciarConsumidor({
    nome: 'notificacoes',
    ligacoes: ['agendamento.*'], // só parte dos eventos: ignora quadra.*
    processar,
    estadoInicial: { enviados: 0 },
  });

if (ehPrincipal(import.meta.url)) consumidorNotificacoes();
