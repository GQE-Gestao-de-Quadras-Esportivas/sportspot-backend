// Cena 5: GraphQL.
// 1. A tela do painel do proprietário em UMA consulta (eu → quadras → reservas)
// 2. Consulta com argumentos (filtro, ordenação, paginação)
// 3. Mutation com input, e os erros de regra de negócio como GraphQLError com code
// 4. DataLoader: N reservas → 1 chamada REST para buscar as quadras
//
// Uso: node testes/teste-graphql.js   (API REST, GraphQL e gateway no ar)

import { chamar, novoUsuarioComToken, QUADRA } from "./lib/gateway.js";

const token = await novoUsuarioComToken();
const gql = async (query, variables) => {
  const r = await chamar("/api/graphql", { metodo: "POST", token, corpo: { query, variables } });
  return r.dados;
};
const titulo = (t) => console.log(`\n${"═".repeat(70)}\n${t}\n${"═".repeat(70)}`);
const emDias = (dias, hora) => {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  d.setHours(hora, 0, 0, 0);
  return d.toISOString();
};

// ---- dados de exemplo: 3 quadras, 2 reservas em cada ----
const quadras = [];
for (const [nome, sport, price] of [["Ginásio Norte", "basquete", 80], ["Arena Sul", "futebol", 150], ["Areia Leste", "volei", 60]]) {
  const r = await chamar("/api/rest/courts", { metodo: "POST", token, corpo: { ...QUADRA, court_name: nome, sport, price, ground_type: sport === "volei" ? "areia" : "parquet" } });
  quadras.push(r.dados);
}
for (const [i, q] of quadras.entries()) {
  for (const dia of [2 + i, 6 + i]) {
    await chamar(`/api/rest/courts/${q.id}/appointments`, { metodo: "POST", token, corpo: { start_time: emDias(dia, 19), end_time: emDias(dia, 21) } });
  }
}

// ─────────────────────────────────────────────────────────────────────
titulo("1. Tela do painel do proprietário: uma consulta, dois níveis de aninhamento");
const PAINEL = /* GraphQL */ `
  query PainelDoProprietario {
    eu {
      nome
      email
      quadras {
        nome
        esporte
        precoPorHora
        reservas(apenasFuturas: true) { inicio fim preco }
      }
    }
  }`;
console.log(PAINEL);
const painel = await gql(PAINEL);
console.log(JSON.stringify(painel.data, null, 2).split("\n").slice(0, 28).join("\n") + "\n  ...");
const n = painel.data.eu.quadras.length;
console.log(`\n➜ O cliente fez 1 requisição. Sem GraphQL, faria ${2 + n} chamadas REST:`);
for (const c of painel.extensions.chamadasRest.detalhes) console.log(`     ${c}`);

// ─────────────────────────────────────────────────────────────────────
titulo("2. Consulta com argumentos: filtro, ordenação e paginação");
const busca = await gql(
  /* GraphQL */ `
  query BuscarQuadras($filtro: FiltroQuadras) {
    quadras(filtro: $filtro, ordenarPor: MENOR_PRECO, limite: 5) {
      total
      itens { nome esporte precoPorHora piso endereco { cidade estado } }
    }
  }`,
  { filtro: { cidade: "Rio", precoMaximo: 100, apenasMinhas: true } },
);
console.log(`filtro: cidade contém "Rio", preço até 100, só as minhas, do mais barato ao mais caro`);
console.log(JSON.stringify(busca.data.quadras, null, 2));

// ─────────────────────────────────────────────────────────────────────
titulo("3. Mutation com input, e erros de regra de negócio");
const CRIAR = /* GraphQL */ `
  mutation Reservar($input: NovaReservaInput!) {
    criarReserva(input: $input) { id inicio fim preco quadra { nome } }
  }`;
const ok = await gql(CRIAR, { input: { quadraId: quadras[0].id, inicio: emDias(10, 8), fim: emDias(10, 10) } });
console.log("Reserva nova:", JSON.stringify(ok.data?.criarReserva ?? ok.errors));

for (const [descricao, input] of [
  ["Mesmo horário de novo", { quadraId: quadras[0].id, inicio: emDias(10, 9), fim: emDias(10, 11) }],
  ["Horário no passado", { quadraId: quadras[0].id, inicio: emDias(-1, 9), fim: emDias(-1, 10) }],
  ["Reserva de 6 horas", { quadraId: quadras[0].id, inicio: emDias(12, 8), fim: emDias(12, 14) }],
  ["Data em formato errado", { quadraId: quadras[0].id, inicio: "amanhã", fim: "depois" }],
]) {
  const r = await gql(CRIAR, { input });
  const e = r.errors?.[0];
  console.log(`\n${descricao}:\n   code: ${e?.extensions?.code}  (HTTP ${e?.extensions?.status} na API)\n   message: ${e?.message}`);
}

// ─────────────────────────────────────────────────────────────────────
titulo("4. DataLoader: cada reserva pede a sua quadra, mas sai UMA chamada REST");
const reservas = await gql(/* GraphQL */ `
  query MinhasReservas {
    minhasReservas(papel: CLIENTE) { inicio preco quadra { nome esporte } }
  }`);
const total = reservas.data.minhasReservas.length;
console.log(`${total} reservas, cada uma com a sua quadra.`);
console.log(`Chamadas REST feitas: ${reservas.extensions.chamadasRest.total} (sem DataLoader seriam ${1 + total})`);
for (const c of reservas.extensions.chamadasRest.detalhes) console.log(`     ${c.length > 110 ? c.slice(0, 110) + "..." : c}`);
