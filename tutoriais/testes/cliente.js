// Evidência da Parte 1 (e Cena 2): cria, lê, altera e remove uma quadra pelo
// gateway, usa filtro/ordenação/paginação e provoca erros de propósito.
// Uso: node testes/cliente.js
import { chamar, confere, titulo, CHAVES } from './comum.js';

const novaQuadra = {
  nome: 'Quadra de Vôlei de Areia 02',
  esporte: 'volei',
  piso: 'areia',
  precoHora: 70,
  endereco: { cep: '14801-000', logradouro: 'Rua das Palmeiras', numero: '88', bairro: 'Centro', cidade: 'Araraquara', uf: 'SP' },
  descricao: 'Rede oficial e bolas disponíveis.',
  recursos: ['iluminacao'],
  horarioAbertura: '08:00',
  horarioFechamento: '22:00',
  proprietarioId: 'p1',
};

titulo('1. Listar com filtro, ordenação e paginação (teto de 50 por página)');
const lista = await chamar('GET', '/api/quadras?cidade=araraquara&recurso=iluminacao&ordenar=-precoHora&tamanho=2', { resumir: 300 });
confere(lista.status === 200 && lista.json.dados.length <= 2, 'lista paginada com 2 itens por página');
const teto = await chamar('GET', '/api/quadras?tamanho=1000', { mostrar: false });
confere(teto.json.paginacao.tamanho === 50, `tamanho=1000 limitado ao teto (${teto.json.paginacao.tamanho})`);

titulo('2. Criar (POST) -> 201 + Location');
const criada = await chamar('POST', '/api/quadras', { corpo: novaQuadra });
confere(criada.status === 201 && criada.headers.get('location')?.startsWith('/api/quadras/'), 'status 201 com Location reescrito pelo gateway');
const local = criada.headers.get('location');

titulo('3. Ler o item (GET)');
const lida = await chamar('GET', local, { resumir: 200 });
confere(lida.status === 200, 'status 200');

titulo('4. Substituir (PUT) e alterar parcialmente (PATCH)');
const put = await chamar('PUT', local, { corpo: { ...novaQuadra, precoHora: 75, descricao: 'Reformada em 2026.' }, resumir: 200 });
confere(put.status === 200 && put.json.precoHora === 75, 'PUT 200 com preço 75');
const patch = await chamar('PATCH', local, { corpo: { precoHora: 80, recursos: ['iluminacao', 'vestiario'] }, resumir: 200 });
confere(patch.status === 200 && patch.json.precoHora === 80, 'PATCH 200 com preço 80');

titulo('5. Erros de propósito (Problem Details)');
const rn01 = await chamar('PATCH', local, { corpo: { esporte: 'futebol' } });
confere(rn01.status === 422 && rn01.json.regra === 'RN01', '422: futebol não pode ser em areia (RN01)');
const invalida = await chamar('POST', '/api/quadras', { corpo: { nome: 'Q', esporte: 'peteca', precoHora: -5 } });
confere(invalida.status === 422 && invalida.json.errors.length >= 3, '422: validação de campos com a lista "errors"');
const malformado = await chamar('POST', '/api/quadras', { corpoBruto: '{"nome": "sem fechar' });
confere(malformado.status === 400, '400: JSON malformado');
const semTipo = await chamar('POST', '/api/quadras', { corpoBruto: 'nome=x', cabecalhos: { 'content-type': 'text/plain' } });
confere(semTipo.status === 415, '415: corpo sem Content-Type: application/json');
const consulta = await chamar('GET', '/api/quadras?ordenar=altura');
confere(consulta.status === 400, '400: parâmetro de ordenação inválido');
const removerComReserva = await chamar('DELETE', '/api/quadras/q1');
confere(removerComReserva.status === 409 && removerComReserva.json.regra === 'RN08', '409: quadra com reservas futuras não pode ser removida (RN08)');
const parceiro = await chamar('POST', '/api/quadras', { chave: CHAVES.parceiro, corpo: novaQuadra });
confere(parceiro.status === 403, '403: o parceiro só pode ler o catálogo');

titulo('6. Remover (DELETE) -> 204 e confirmar 404');
const removida = await chamar('DELETE', local);
confere(removida.status === 204, 'status 204 sem corpo');
const depois = await chamar('GET', local);
confere(depois.status === 404, 'status 404 depois de remover');
