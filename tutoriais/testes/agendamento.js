// Cenas 2 e 3: reservar uma quadra pelo gateway (201 + Location), ler a
// reserva, provocar as regras de negócio (409/422) e cancelar. Cada criação ou
// cancelamento publica um evento no RabbitMQ: acompanhe os logs dos consumidores.
// Uso: node testes/agendamento.js
import { chamar, confere, titulo, horarioLivre, dataDaquiA, CHAVES, amarelo } from './comum.js';

titulo('1. Reservar a quadra q1 (Society) -> 201 + Location');
const inicio = await horarioLivre('q1', 90);
const criado = await chamar('POST', '/api/agendamentos', { chave: CHAVES.atleta, corpo: { quadraId: 'q1', atletaId: 'a2', inicio, duracaoMinutos: 90 } });
confere(criado.status === 201 && criado.headers.get('location')?.startsWith('/api/agendamentos/'), '201 com Location; valor calculado pelo servidor');
console.log(amarelo(`   -> evento agendamento.criado publicado (X-Request-Id ${criado.requestId}); veja os logs dos consumidores`));

titulo('2. Ler a reserva criada');
const lido = await chamar('GET', criado.headers.get('location'), { chave: CHAVES.atleta });
confere(lido.status === 200 && lido.json.status === 'CONFIRMADO', 'reserva CONFIRMADA');

titulo('3. Regras de negócio do SportSpot');
const ocupado = await chamar('POST', '/api/agendamentos', { corpo: { quadraId: 'q1', atletaId: 'a3', inicio, duracaoMinutos: 60 } });
confere(ocupado.status === 409 && ocupado.json.regra === 'RN02', '409: horário já ocupado (RN02)');
const passado = await chamar('POST', '/api/agendamentos', { corpo: { quadraId: 'q1', atletaId: 'a3', inicio: `${dataDaquiA(-1)}T10:00:00-03:00`, duracaoMinutos: 60 } });
confere(passado.status === 422 && passado.json.regra === 'RN03', '422: horário no passado (RN03)');
const quebrada = await chamar('POST', '/api/agendamentos', { corpo: { quadraId: 'q1', atletaId: 'a3', inicio: `${dataDaquiA(3)}T10:15:00-03:00`, duracaoMinutos: 45 } });
confere(quebrada.status === 422 && quebrada.json.regra === 'RN04', '422: duração/horário fora dos blocos de 30 min (RN04)');
const fechado = await chamar('POST', '/api/agendamentos', { corpo: { quadraId: 'q5', atletaId: 'a3', inicio: `${dataDaquiA(3)}T07:00:00-03:00`, duracaoMinutos: 60 } });
confere(fechado.status === 422 && fechado.json.regra === 'RN05', '422: fora do horário de funcionamento (RN05)');
const escuro = await chamar('POST', '/api/agendamentos', { corpo: { quadraId: 'q3', atletaId: 'a3', inicio: `${dataDaquiA(3)}T17:30:00-03:00`, duracaoMinutos: 60 } });
confere(escuro.status === 422 && escuro.json.regra === 'RN06', '422: quadra sem iluminação não aceita reserva depois das 18:00 (RN06)');

titulo('4. Cancelar a reserva -> 200 (publica agendamento.cancelado)');
const cancelado = await chamar('POST', `${criado.headers.get('location')}/cancelamento`, { chave: CHAVES.atleta, corpo: { motivo: 'Chuva forte prevista' } });
confere(cancelado.status === 200 && cancelado.json.status === 'CANCELADO', 'reserva CANCELADA');
const denovo = await chamar('POST', `${criado.headers.get('location')}/cancelamento`, { chave: CHAVES.atleta });
confere(denovo.status === 409, '409: não dá para cancelar duas vezes (RN07)');

titulo('5. Reserva que fica (para o painel e o faturamento)');
const fica = await chamar('POST', '/api/agendamentos', { corpo: { quadraId: 'q1', atletaId: 'a1', inicio: await horarioLivre('q1', 60), duracaoMinutos: 60 } });
confere(fica.status === 201, '201: reserva confirmada');
