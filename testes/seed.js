// Cria os usuários de teste fixos (fictícios) e duas quadras para o proprietário.
// Pode rodar várias vezes: o que já existe é reaproveitado.
// No fim, imprime um token de cada usuário (válido por 15 min), útil no Apollo Sandbox.
//
// Uso: npm run seed   (API REST e gateway no ar)

import { chamar, CHAVES } from "./lib/gateway.js";

const SENHA = "senha-demo-123";
const usuarios = [
  { name: "Luísa Proprietária", document: "90000000001", phone_number: "16990000001", email: "locador@sportspot.dev" },
  { name: "Cleiton Jogador", document: "90000000002", phone_number: "16990000002", email: "jogador@sportspot.dev" },
];

const tokens = {};
for (const u of usuarios) {
  const cadastro = await chamar("/api/rest/auth/register", {
    metodo: "POST",
    corpo: { ...u, date_of_birth: "1990-05-20", password: SENHA, confirm_password: SENHA },
  });
  if (cadastro.status !== 201 && cadastro.status !== 409) {
    console.error(`Cadastro de ${u.email} falhou (${cadastro.status}):`, cadastro.dados);
    process.exit(1);
  }
  const login = await chamar("/api/rest/auth/login", { metodo: "POST", corpo: { email: u.email, password: SENHA } });
  tokens[u.email] = login.dados.accessToken;
  console.log(`${cadastro.status === 201 ? "criado " : "já existia"}  ${u.email} / ${SENHA}`);
}

const tokenLocador = tokens["locador@sportspot.dev"];
const minhas = await chamar("/api/rest/courts?owner=me", { token: tokenLocador });
if (minhas.dados.pagination.total === 0) {
  const base = { cep: "14801000", address: "Rua Voluntários da Pátria", neighborhood: "Centro", city: "Araraquara", state: "SP" };
  await chamar("/api/rest/courts", {
    metodo: "POST",
    token: tokenLocador,
    corpo: { ...base, court_name: "Quadra Society Centro", sport: "futebol", price: 150, ground_type: "grama_sintetica", address_number: "100", description: "Society coberta com vestiário", resources: ["cobertura", "vestiario", "iluminacao"] },
  });
  await chamar("/api/rest/courts", {
    metodo: "POST",
    token: tokenLocador,
    corpo: { ...base, court_name: "Ginásio Poliesportivo", sport: "basquete", price: 90, ground_type: "parquet", address_number: "250", description: "Ginásio com arquibancada", resources: ["cobertura", "iluminacao"] },
  });
  console.log("2 quadras criadas para locador@sportspot.dev");
} else {
  console.log(`locador@sportspot.dev já tem ${minhas.dados.pagination.total} quadra(s)`);
}

console.log(`\nChaves de API: app-jogador = ${CHAVES.jogador} | painel-locador = ${CHAVES.locador}`);
console.log("\nTokens (15 min), para o cabeçalho Authorization: Bearer <token>:");
for (const [email, t] of Object.entries(tokens)) console.log(`\n${email}:\n${t}`);
