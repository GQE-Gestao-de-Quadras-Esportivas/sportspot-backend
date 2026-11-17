// Evidência da Parte 1: cria, lê, altera e remove uma quadra, cria uma reserva
// e provoca de propósito os erros 400, 401, 404, 409 e 422.
//
// Uso:  node testes/cliente.js             (direto na API, só na própria máquina)
//       node testes/cliente.js --gateway   (pelo gateway, como um cliente de verdade)

// node testes/cliente.js --gateway  → passa pelo gateway (porta 8080) com a chave do painel-locador
const VIA_GATEWAY = process.argv.includes("--gateway");
const BASE_URL = process.env.BASE_URL || (VIA_GATEWAY ? "http://127.0.0.1:8080/api/rest" : "http://127.0.0.1:3000/v1/api");
const REQUEST_ID = `cliente-${Date.now()}`;
let token = "";

async function chamar(titulo, metodo, caminho, corpo, { semToken = false } = {}) {
  const headers = { "X-Request-Id": REQUEST_ID };
  if (VIA_GATEWAY) headers["X-API-Key"] = "chave-painel-locador-456";
  if (corpo !== undefined) headers["Content-Type"] = "application/json";
  if (token && !semToken) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(BASE_URL + caminho, {
    method: metodo,
    headers,
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const texto = await res.text();
  const dados = texto ? JSON.parse(texto) : null;

  console.log(`\n=== ${titulo}`);
  console.log(`${metodo} ${caminho} -> ${res.status} ${res.headers.get("content-type") ?? ""}`);
  if (res.headers.get("location")) console.log(`Location: ${res.headers.get("location")}`);
  if (dados) console.log(JSON.stringify(dados, null, 2).split("\n").slice(0, 14).join("\n"));
  return { status: res.status, dados };
}

// Datas relativas a hoje, para o script funcionar em qualquer dia
const daquiA = (dias, hora) => {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  d.setHours(hora, 0, 0, 0);
  return d.toISOString();
};

const sufixo = Date.now().toString().slice(-8);
const usuario = {
  name: "Locador de Teste",
  document: `000${sufixo}`,
  date_of_birth: "1995-04-10",
  phone_number: `1199${sufixo}`,
  email: `locador.${sufixo}@exemplo.com`,
  password: "senha-ficticia-123",
  confirm_password: "senha-ficticia-123",
};

const quadra = {
  court_name: "Arena Central",
  sport: "futebol",
  price: 120,
  ground_type: "grama_sintetica",
  cep: "01310-100",
  address: "Av. Paulista",
  address_number: "1000",
  neighborhood: "Bela Vista",
  city: "São Paulo",
  state: "SP",
  description: "Quadra society coberta",
  resources: ["cobertura", "iluminacao"],
};

// ---------- autenticação ----------
await chamar("Cadastro de usuário", "POST", "/auth/register", usuario);
const login = await chamar("Login", "POST", "/auth/login", { email: usuario.email, password: usuario.password });
token = login.dados.accessToken;

await chamar("ERRO 401: sem token", "GET", "/courts", undefined, { semToken: true });

// ---------- CRUD de quadras ----------
const criada = await chamar("Criar quadra (201 + Location)", "POST", "/courts", quadra);
const id = criada.dados.id;

await chamar("Ler a quadra", "GET", `/courts/${id}`);
await chamar(
  "Listar com filtro, ordenação e paginação",
  "GET",
  "/courts?sport=futebol&city=paulo&sort=price&order=asc&page=1&limit=100",
);
await chamar("PATCH: alterar só o preço", "PATCH", `/courts/${id}`, { price: 150 });
await chamar("PUT: substituir a quadra", "PUT", `/courts/${id}`, { ...quadra, court_name: "Arena Central Reformada" });

await chamar("ERRO 400: campos ausentes", "POST", "/courts", { court_name: "Sem dados" });
await chamar("ERRO 422: esporte e piso fora do enum", "POST", "/courts", { ...quadra, sport: "xadrez", ground_type: "lama" });
await chamar("ERRO 404: quadra inexistente", "GET", "/courts/00000000-0000-0000-0000-000000000000");

// ---------- reservas e regras de negócio ----------
const reserva = await chamar("Reservar das 19h às 21h daqui a 3 dias (201)", "POST", `/courts/${id}/appointments`, {
  start_time: daquiA(3, 19),
  end_time: daquiA(3, 21),
});
await chamar("REGRA 409: horário já ocupado (20h às 22h)", "POST", `/courts/${id}/appointments`, {
  start_time: daquiA(3, 20),
  end_time: daquiA(3, 22),
});
await chamar("REGRA 422: agendar no passado", "POST", `/courts/${id}/appointments`, {
  start_time: daquiA(-1, 19),
  end_time: daquiA(-1, 20),
});
await chamar("REGRA 422: término antes do início", "POST", `/courts/${id}/appointments`, {
  start_time: daquiA(4, 21),
  end_time: daquiA(4, 19),
});
await chamar("REGRA 409: remover quadra com histórico de reservas", "DELETE", `/courts/${id}`);

// Reserva para amanhã cedo: menos de 24 h → não pode cancelar
const amanha = await chamar("Reservar para daqui a poucas horas", "POST", `/courts/${id}/appointments`, {
  start_time: new Date(Date.now() + 2 * 3600_000).toISOString(),
  end_time: new Date(Date.now() + 3 * 3600_000).toISOString(),
});
await chamar("REGRA 422: cancelar com menos de 24 h", "DELETE", `/appointments/${amanha.dados.id}`);

await chamar("Cancelar a reserva de daqui a 3 dias (204)", "DELETE", `/appointments/${reserva.dados.id}`);
await chamar("A reserva cancelada continua no histórico (sem hard delete)", "GET", `/appointments/${reserva.dados.id}`);
await chamar("REGRA 409: cancelar de novo", "DELETE", `/appointments/${reserva.dados.id}`);

// ---------- remoção ----------
const temporaria = await chamar("Criar uma segunda quadra, sem reservas", "POST", "/courts", {
  ...quadra,
  court_name: "Quadra Temporária",
  sport: "volei",
  ground_type: "areia",
});
await chamar("Remover a quadra (204)", "DELETE", `/courts/${temporaria.dados.id}`);
await chamar("Ler a quadra removida (404)", "GET", `/courts/${temporaria.dados.id}`);

console.log(`\nTodas as chamadas usaram X-Request-Id: ${REQUEST_ID} (procure no log da API).`);
