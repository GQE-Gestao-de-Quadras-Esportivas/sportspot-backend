// Cena 4 (parte 1): uma mensagem que falha, é tentada de novo e vai para a DLQ.
// O atleta a4 (Lucas) foi cadastrado com o e-mail digitado errado
// ("lucas.ferreira#email-exemplo.test"). Ao reservar em nome dele, o consumidor
// de notificações não consegue enviar o e-mail: tenta 3 vezes (com 2 s de
// espera) e manda a mensagem para sportspot.notificacoes.dlq. Os outros
// consumidores (faturamento e auditoria) processam o mesmo evento normalmente.
// Uso: node testes/falha-dlq.js   (RabbitMQ, API REST, gateway e consumidores no ar)
import { chamar, confere, titulo, horarioLivre, esperar, amarelo } from './comum.js';
import { config } from '../shared/config.js';

const { painelUrl, painelUsuario, painelSenha, maxTentativas, esperaNovaTentativaMs } = config.rabbit;
const auth = 'Basic ' + Buffer.from(`${painelUsuario}:${painelSenha}`).toString('base64');

async function fila(nome) {
  const r = await fetch(`${painelUrl}/api/queues/%2F/${encodeURIComponent(nome)}`, { headers: { authorization: auth } });
  if (!r.ok) return null;
  const j = await r.json();
  return j.messages ?? 0;
}

titulo('Situação da DLQ antes');
const antes = await fila('sportspot.notificacoes.dlq');
if (antes === null) {
  console.log(amarelo('Não consegui ler o painel do RabbitMQ (http://localhost:15672). O broker e os consumidores estão no ar?'));
  process.exit(1);
}
console.log(`   sportspot.notificacoes.dlq: ${antes} mensagem(ns)`);

titulo('Reserva em nome do atleta a4 (e-mail inválido)');
const r = await chamar('POST', '/api/agendamentos', { corpo: { quadraId: 'q1', atletaId: 'a4', inicio: await horarioLivre('q1', 60), duracaoMinutos: 60 } });
confere(r.status === 201, 'a API responde 201 na hora, sem esperar os consumidores');

const espera = maxTentativas * esperaNovaTentativaMs + 2000;
console.log(amarelo(`\nAguardando ${espera / 1000} s: ${maxTentativas} tentativas no consumidor de notificações (veja o terminal dos consumidores)...`));
await esperar(espera);

titulo('Situação da DLQ depois');
const depois = await fila('sportspot.notificacoes.dlq');
console.log(`   sportspot.notificacoes.dlq: ${depois} mensagem(ns)`);
confere(depois === antes + 1, 'a mensagem foi parar na DLQ depois das tentativas');
console.log(`\nAbra ${painelUrl}/#/queues (usuário/senha locais: guest/guest) e veja a fila sportspot.notificacoes.dlq.`);
console.log(`Procure nos logs pelo X-Request-Id ${r.requestId}: node testes/rastreio.js ${r.requestId}`);
