// Cena 4 (parte 2): idempotência. Publica DUAS VEZES a mesma mensagem
// agendamento.criado (mesmo messageId/eventId), como aconteceria se o produtor
// reenviasse depois de não receber a confirmação do broker. Os consumidores
// processam a primeira e reconhecem a segunda como duplicada: o e-mail não é
// reenviado e a receita do faturamento não é somada duas vezes.
// Uso: node testes/duplicidade.js   (RabbitMQ e consumidores no ar)
import amqp from 'amqplib';
import { randomUUID } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { config } from '../shared/config.js';
import { confere, titulo, esperar, dataDaquiA, amarelo } from './comum.js';

const ARQ_FATURAMENTO = new URL('../mensageria/dados/faturamento.json', import.meta.url);
const dia = dataDaquiA(40);
const chave = `q2|${dia}`;
const receita = () => {
  if (!existsSync(ARQ_FATURAMENTO)) return 0;
  return JSON.parse(readFileSync(ARQ_FATURAMENTO, 'utf8')).estado.porQuadraDia[chave]?.receitaPrevista ?? 0;
};

const eventId = randomUUID();
const requestId = `teste-duplicidade-${eventId.slice(0, 8)}`;
const evento = {
  eventId,
  tipo: 'agendamento.criado',
  versao: 1,
  ocorridoEm: new Date().toISOString(),
  requestId,
  dados: {
    agendamento: { id: `ag-dup-${eventId.slice(0, 4)}`, quadraId: 'q2', atletaId: 'a3', inicio: `${dia}T10:00:00-03:00`, fim: `${dia}T11:00:00-03:00`, duracaoMinutos: 60, valorTotal: 150, status: 'CONFIRMADO' },
    quadra: { id: 'q2', nome: 'Quadra Coberta Poliesportiva', esporte: 'futsal', proprietarioId: 'p1' },
    atleta: { id: 'a3', nome: 'Juliana Prado', email: 'juliana.prado@email-exemplo.test' },
  },
};

titulo('Receita prevista da quadra q2 no dia ' + dia + ' (antes)');
const antes = receita();
console.log(`   R$ ${antes}`);

const conexao = await amqp.connect(config.rabbit.url);
const canal = await conexao.createConfirmChannel();
await canal.assertExchange(config.rabbit.exchange, 'topic', { durable: true });
for (const vez of [1, 2]) {
  canal.publish(config.rabbit.exchange, evento.tipo, Buffer.from(JSON.stringify(evento)), {
    persistent: true, contentType: 'application/json', messageId: eventId, correlationId: requestId,
    type: evento.tipo, headers: { 'x-request-id': requestId },
  });
  await canal.waitForConfirms();
  console.log(`   publicação ${vez}: messageId ${eventId}`);
}
await conexao.close();

console.log(amarelo('\nAguardando 3 s para os consumidores processarem...'));
await esperar(3000);

titulo('Receita prevista (depois)');
const depois = receita();
console.log(`   R$ ${depois}`);
confere(depois === antes + 150, 'a receita subiu R$ 150 só UMA vez (a segunda mensagem foi ignorada)');
console.log(`\nNos logs dos consumidores aparece "mensagem duplicada ignorada" com req=${requestId}.`);
