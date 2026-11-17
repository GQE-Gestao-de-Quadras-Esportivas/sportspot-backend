// Cena 5: GraphQL pelo gateway (/api/graphql).
// A tela "Agenda do proprietário" (a tela de agendamentos do painel Angular)
// mostra, para um dia, cada quadra do proprietário com as reservas e o atleta de
// cada uma. Sem GraphQL, o painel faria várias chamadas REST; aqui é UMA consulta.
// Uso: node testes/graphql.js
import { GATEWAY, CHAVES, confere, titulo, dataDaquiA, horarioLivre, verde, amarelo } from './comum.js';

async function gql(query, variables, chave = CHAVES.painel) {
  const r = await fetch(`${GATEWAY}/api/graphql`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': chave },
    body: JSON.stringify({ query, variables }),
  });
  return { status: r.status, requestId: r.headers.get('x-request-id'), ...(await r.json()) };
}

const AGENDA_DO_PROPRIETARIO = /* GraphQL */ `
  query AgendaDoProprietario($id: ID!, $data: String!) {
    proprietario(id: $id) {
      nome
      empresa
      quadras {
        id
        nome
        esporte
        agendamentos(data: $data, status: CONFIRMADO) {
          inicio
          fim
          valorTotal
          atleta { nome telefone }
        }
      }
    }
  }`;

const amanha = dataDaquiA(1);
titulo(`1. Tela "Agenda do proprietário" (p1, ${amanha}) - aninhamento proprietario > quadras > agendamentos > atleta`);
const agenda = await gql(AGENDA_DO_PROPRIETARIO, { id: 'p1', data: amanha });
console.log(JSON.stringify(agenda.data, null, 2));
const m = agenda.extensions.chamadasRest;
console.log(verde(`\n   Chamadas REST feitas pelo GraphQL (com DataLoader): ${m.realizadas}`));
for (const c of m.caminhos) console.log(`     - ${c}`);
console.log(verde(`   Chamadas REST que o painel faria sozinho (1 por recurso): ${m.semGraphQL}`));
console.log(verde(`   O cliente fez 1 chamada em vez de ${m.semGraphQL}.`));
confere(!agenda.errors && m.semGraphQL >= 3, 'uma consulta substitui 3 ou mais chamadas REST');

titulo('2. Consulta com argumentos (filtro): quadras de futebol com iluminação, mais caras primeiro');
const filtro = await gql(`{ quadras(filtro: { esporte: FUTEBOL, recurso: ILUMINACAO }, ordenar: "-precoHora") { total itens { nome precoHora piso recursos proprietario { nome } } } }`);
console.log(JSON.stringify(filtro.data, null, 2));
confere(filtro.data.quadras.itens.every((q) => q.recursos.includes('ILUMINACAO')), 'filtro aplicado');

titulo('3. Mutation com input: agendarQuadra');
const inicio = await horarioLivre('q2', 60);
const MUTACAO = `mutation Agendar($input: NovoAgendamentoInput!) { agendarQuadra(input: $input) { id inicio fim valorTotal status quadra { nome } atleta { nome } } }`;
const ok = await gql(MUTACAO, { input: { quadraId: 'q2', atletaId: 'a3', inicio, duracaoMinutos: 60 } });
console.log(JSON.stringify(ok.data, null, 2));
confere(ok.data?.agendarQuadra?.status === 'CONFIRMADO', 'reserva criada pela mutation (dados gravados pela API REST)');

titulo('4. Erros tratados com GraphQLError e code');
const conflito = await gql(MUTACAO, { input: { quadraId: 'q2', atletaId: 'a1', inicio, duracaoMinutos: 60 } });
console.log(amarelo(JSON.stringify(conflito.errors[0], null, 2)));
confere(conflito.errors[0].extensions.code === 'CONFLICT', 'code CONFLICT (409 na API REST, regra RN02)');
const invalida = await gql(MUTACAO, { input: { quadraId: 'q2', atletaId: 'a1', inicio, duracaoMinutos: 0 } });
confere(invalida.errors[0].extensions.code === 'BAD_USER_INPUT', 'code BAD_USER_INPUT (validado no resolver)');
const naoExiste = await gql(`{ quadra(id: "q999") { nome } }`);
confere(naoExiste.data.quadra === null, 'quadra inexistente devolve null');
