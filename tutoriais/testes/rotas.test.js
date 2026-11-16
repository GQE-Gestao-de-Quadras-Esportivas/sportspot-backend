// Testes automatizados das rotas (node --test), sem depender do RabbitMQ:
// a API REST e o gateway sobem dentro do próprio processo, em portas livres.
// Uso: npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { criarApp } from '../rest/app.js';
import { criarBanco } from '../rest/dados.js';
import { criarGateway } from '../gateway/app.js';
import { config } from '../shared/config.js';
import { criarLogger } from '../shared/logger.js';

const silencioso = criarLogger('testes', { arquivo: false, silencioso: true });
const PAINEL = { 'x-api-key': 'chave-painel-proprietario-456' };
const ATLETA = { 'x-api-key': 'chave-app-atleta-123' };
let banco, rest, gateway, GW;

const ouvir = (app) => new Promise((ok) => { const s = app.listen(0, '127.0.0.1', () => ok(s)); });
const amanha = () => new Date(Date.now() - 3 * 3_600_000 + 2 * 86_400_000).toISOString().slice(0, 10);

before(async () => {
  banco = criarBanco();
  rest = await ouvir(criarApp({ banco, logger: silencioso }));
  const cfg = {
    ...config,
    rest: { ...config.rest, url: `http://127.0.0.1:${rest.address().port}` },
    graphql: { ...config.graphql, url: 'http://127.0.0.1:1' }, // porta sem serviço: força o 502
    gateway: { ...config.gateway, timeoutMs: 1000, novasTentativas: 0, disjuntor: { limiteFalhas: 2, tempoAbertoMs: 60_000 } },
  };
  gateway = await ouvir(criarGateway({ config: cfg, logger: silencioso }));
  GW = `http://127.0.0.1:${gateway.address().port}`;
});

after(() => {
  rest.close();
  gateway.close();
});

const quadraValida = {
  nome: 'Quadra de Teste', esporte: 'basquete', piso: 'parquet', precoHora: 100, proprietarioId: 'p1',
  endereco: { cep: '14800000', logradouro: 'Rua A', numero: '1', bairro: 'Centro', cidade: 'Araraquara', uf: 'SP' },
};
const json = (corpo, h = PAINEL) => ({ headers: { ...h, 'content-type': 'application/json' }, body: JSON.stringify(corpo) });

test('CRUD de quadra: 201 com Location reescrito, 200, 204 e 404', async () => {
  const criada = await fetch(`${GW}/api/quadras`, { method: 'POST', ...json(quadraValida) });
  assert.equal(criada.status, 201);
  const local = criada.headers.get('location');
  assert.match(local, /^\/api\/quadras\/q\d+$/);
  assert.equal((await fetch(GW + local, { headers: PAINEL })).status, 200);
  const patch = await fetch(GW + local, { method: 'PATCH', ...json({ precoHora: 120 }) });
  assert.equal((await patch.json()).precoHora, 120);
  assert.equal((await fetch(GW + local, { method: 'DELETE', headers: PAINEL })).status, 204);
  assert.equal((await fetch(GW + local, { headers: PAINEL })).status, 404);
});

test('validação: 422 com errors, 400 para JSON malformado, 415 sem Content-Type', async () => {
  const r = await fetch(`${GW}/api/quadras`, { method: 'POST', ...json({ nome: 'x' }) });
  assert.equal(r.status, 422);
  assert.equal(r.headers.get('content-type'), 'application/problem+json; charset=utf-8');
  assert.ok((await r.json()).errors.length > 3);
  const malformado = await fetch(`${GW}/api/quadras`, { method: 'POST', headers: { ...PAINEL, 'content-type': 'application/json' }, body: '{' });
  assert.equal(malformado.status, 400);
  const semTipo = await fetch(`${GW}/api/quadras`, { method: 'POST', headers: { ...PAINEL, 'content-type': 'text/plain' }, body: 'x' });
  assert.equal(semTipo.status, 415);
});

test('RN01: esporte incompatível com o piso -> 422', async () => {
  const r = await fetch(`${GW}/api/quadras`, { method: 'POST', ...json({ ...quadraValida, esporte: 'futebol' }) });
  assert.equal(r.status, 422);
  assert.equal((await r.json()).regra, 'RN01');
});

test('paginação com teto de 50 e filtro', async () => {
  const r = await (await fetch(`${GW}/api/quadras?tamanho=999&esporte=futebol`, { headers: PAINEL })).json();
  assert.equal(r.paginacao.tamanho, 50);
  assert.ok(r.dados.every((q) => q.esporte === 'futebol'));
});

test('agendamento: 201 grava o evento na outbox; repetir o horário dá 409 (RN02)', async () => {
  const corpo = { quadraId: 'q1', atletaId: 'a1', inicio: `${amanha()}T10:00:00-03:00`, duracaoMinutos: 60 };
  const antes = banco.outbox.length;
  const r = await fetch(`${GW}/api/agendamentos`, { method: 'POST', ...json(corpo, ATLETA) });
  assert.equal(r.status, 201);
  assert.equal(banco.outbox.length, antes + 1);
  const evento = banco.outbox.at(-1).evento;
  assert.equal(evento.tipo, 'agendamento.criado');
  assert.equal(evento.requestId, r.headers.get('x-request-id'), 'o evento carrega o X-Request-Id gerado no gateway');
  const repetido = await fetch(`${GW}/api/agendamentos`, { method: 'POST', ...json(corpo, ATLETA) });
  assert.equal(repetido.status, 409);
});

test('RN03 e RN06: passado e quadra sem iluminação -> 422', async () => {
  const passado = await fetch(`${GW}/api/agendamentos`, { method: 'POST', ...json({ quadraId: 'q1', atletaId: 'a1', inicio: '2020-01-01T10:00:00-03:00', duracaoMinutos: 60 }) });
  assert.equal((await passado.json()).regra, 'RN03');
  const noite = await fetch(`${GW}/api/agendamentos`, { method: 'POST', ...json({ quadraId: 'q3', atletaId: 'a1', inicio: `${amanha()}T18:00:00-03:00`, duracaoMinutos: 60 }) });
  assert.equal((await noite.json()).regra, 'RN06');
});

test('gateway: 401 sem chave, 403 fora do plano, 429 ao passar do limite', async () => {
  assert.equal((await fetch(`${GW}/api/quadras`)).status, 401);
  assert.equal((await fetch(`${GW}/api/agendamentos`, { headers: { 'x-api-key': 'chave-parceiro-789' } })).status, 403);
  let ultimo;
  for (let i = 0; i < 12; i++) ultimo = await fetch(`${GW}/api/quadras`, { headers: ATLETA });
  assert.equal(ultimo.status, 429);
  assert.ok(Number(ultimo.headers.get('retry-after')) > 0);
});

test('gateway: serviço fora do ar dá 502 e, depois de 2 falhas, o disjuntor responde 503', async () => {
  const q = JSON.stringify({ query: '{ __typename }' });
  const h = { ...PAINEL, 'content-type': 'application/json' };
  assert.equal((await fetch(`${GW}/api/graphql`, { method: 'POST', headers: h, body: q })).status, 502);
  assert.equal((await fetch(`${GW}/api/graphql`, { method: 'POST', headers: h, body: q })).status, 502);
  const aberto = await fetch(`${GW}/api/graphql`, { method: 'POST', headers: h, body: q });
  assert.equal(aberto.status, 503);
  assert.ok(aberto.headers.get('retry-after'));
});

test('rota agregada com degradação graciosa: GraphQL fora -> resposta parcial', async () => {
  const r = await (await fetch(`${GW}/api/painel/quadras/q1`, { headers: PAINEL })).json();
  assert.equal(r.parcial, true);
  assert.equal(r.quadra.id, 'q1');
  assert.equal(r.agendaDoDia, null);
});
