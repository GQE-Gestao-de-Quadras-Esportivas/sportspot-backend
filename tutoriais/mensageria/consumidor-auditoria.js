// Consumidor 3: AUDITORIA
// Liga-se a todos os eventos (padrão "#"): quadra.cadastrada, quadra.atualizada,
// quadra.removida, agendamento.criado e agendamento.cancelado. Grava uma trilha
// de auditoria em mensageria/saida/auditoria.jsonl (uma linha por evento, sem
// repetir eventos duplicados).
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { iniciarConsumidor } from './consumidor-base.js';
import { ehPrincipal } from '../shared/principal.js';

const SAIDA = join(dirname(fileURLToPath(import.meta.url)), 'saida');

async function processar(evento, { estado, logger, requestId }) {
  mkdirSync(SAIDA, { recursive: true });
  const registro = {
    eventId: evento.eventId,
    tipo: evento.tipo,
    ocorridoEm: evento.ocorridoEm,
    requestId,
    resumo: resumir(evento),
  };
  appendFileSync(join(SAIDA, 'auditoria.jsonl'), JSON.stringify(registro) + '\n');
  estado.porTipo[evento.tipo] = (estado.porTipo[evento.tipo] ?? 0) + 1;
  logger.info(`auditado ${evento.tipo}: ${registro.resumo}`, { requestId });
}

function resumir({ tipo, dados }) {
  if (tipo.startsWith('agendamento.')) return `${dados.agendamento.id} na quadra ${dados.quadra.id} por ${dados.atleta.id}`;
  if (tipo === 'quadra.removida') return `quadra ${dados.quadraId} removida`;
  return `quadra ${dados.quadra.id} (${dados.quadra.nome})`;
}

export const consumidorAuditoria = () =>
  iniciarConsumidor({
    nome: 'auditoria',
    ligacoes: ['#'],
    processar,
    estadoInicial: { porTipo: {} },
  });

if (ehPrincipal(import.meta.url)) consumidorAuditoria();
