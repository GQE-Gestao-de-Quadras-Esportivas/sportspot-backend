// Utilitários dos scripts que passam pelo gateway.
import { createInterface } from "node:readline/promises";

export const GATEWAY = process.env.GATEWAY_URL || "http://127.0.0.1:8080";
export const CHAVES = {
  jogador: "chave-app-jogador-123", // 10 requisições por minuto
  locador: "chave-painel-locador-456", // 120 requisições por minuto
};

export const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

export async function chamar(caminho, { metodo = "GET", chave = CHAVES.locador, token, corpo, requestId } = {}) {
  const headers = {};
  if (chave) headers["X-API-Key"] = chave;
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (requestId) headers["X-Request-Id"] = requestId;
  if (corpo !== undefined) headers["Content-Type"] = "application/json";
  const r = await fetch(GATEWAY + caminho, {
    method: metodo,
    headers,
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const texto = await r.text();
  let dados = null;
  try { dados = texto ? JSON.parse(texto) : null; } catch { dados = texto; }
  return { status: r.status, headers: r.headers, dados };
}

export function mostrar(titulo, r, extras = []) {
  const linhas = [`${titulo.padEnd(52)} → ${r.status}`];
  for (const h of ["x-request-id", "location", "retry-after", "ratelimit-remaining", ...extras]) {
    if (r.headers.get(h)) linhas.push(`      ${h}: ${r.headers.get(h)}`);
  }
  if (r.status >= 400 && r.dados?.title) linhas.push(`      ${r.dados.title}: ${r.dados.detail ?? ""}`);
  console.log(linhas.join("\n"));
}

// Cria um usuário novo e devolve o token (cada execução usa dados únicos)
export async function novoUsuarioComToken(chave = CHAVES.locador) {
  const s = Date.now().toString().slice(-8);
  const usuario = {
    name: "Usuário Gateway",
    document: `111${s}`,
    date_of_birth: "1990-01-01",
    phone_number: `2199${s}`,
    email: `gateway.${s}@exemplo.com`,
    password: "senha-ficticia-123",
    confirm_password: "senha-ficticia-123",
  };
  await chamar("/api/rest/auth/register", { metodo: "POST", chave, corpo: usuario });
  const login = await chamar("/api/rest/auth/login", {
    metodo: "POST",
    chave,
    corpo: { email: usuario.email, password: usuario.password },
  });
  if (login.status !== 200) throw new Error(`Login falhou (${login.status}). A API REST está no ar?`);
  return login.dados.accessToken;
}

export const QUADRA = {
  court_name: "Arena do Gateway",
  sport: "basquete",
  price: 90,
  ground_type: "parquet",
  cep: "20040002",
  address: "Rua da Assembleia",
  address_number: "10",
  neighborhood: "Centro",
  city: "Rio de Janeiro",
  state: "RJ",
  description: "Quadra coberta",
  resources: ["cobertura"],
};

export async function pausar(mensagem) {
  if (process.argv.includes("--sem-pausa")) return;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  await rl.question(`\n👉 ${mensagem} Depois, tecle Enter...`);
  rl.close();
}
