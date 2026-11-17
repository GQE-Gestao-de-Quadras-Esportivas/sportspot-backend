// Funções compartilhadas pelos scripts de demonstração.
// Todas as chamadas passam pelo gateway (único ponto de entrada).
import { createInterface } from 'node:readline/promises';

export const GATEWAY = process.env.GATEWAY_URL ?? 'http://localhost:3000';
export const CHAVES = {
  atleta: 'chave-app-atleta-123', // app-atleta: 10 req/min
  painel: 'chave-painel-proprietario-456', // painel-proprietario: 60 req/min
  parceiro: 'chave-parceiro-789', // parceiro-marketplace: 30 req/min, só leitura do catálogo
};

const cor = (codigo) => (texto) => (process.stdout.isTTY ? `\x1b[${codigo}m${texto}\x1b[0m` : texto);
export const verde = cor(32);
export const vermelho = cor(31);
export const amarelo = cor(33);
export const ciano = cor(36);
export const negrito = cor(1);

export function titulo(texto) {
  console.log('\n' + negrito(ciano(`=== ${texto} ===`)));
}

/**
 * Faz uma chamada ao gateway e imprime: método, caminho, status, cabeçalhos
 * relevantes e o corpo (resumido).
 */
export async function chamar(metodo, caminho, { chave = CHAVES.painel, corpo, cabecalhos = {}, corpoBruto, mostrar = true, resumir = 600 } = {}) {
  const headers = { ...cabecalhos };
  if (chave) headers['x-api-key'] = chave;
  if (corpo !== undefined || corpoBruto !== undefined) headers['content-type'] ??= 'application/json';
  const inicio = performance.now();
  const r = await fetch(GATEWAY + caminho, { method: metodo, headers, body: corpoBruto ?? (corpo !== undefined ? JSON.stringify(corpo) : undefined) });
  const ms = Math.round(performance.now() - inicio);
  const texto = await r.text();
  let json = null;
  try {
    json = texto ? JSON.parse(texto) : null;
  } catch {
    /* corpo não JSON */
  }
  if (mostrar) {
    const pintar = r.status < 300 ? verde : r.status < 500 ? amarelo : vermelho;
    console.log(`${negrito(metodo)} ${caminho}  ->  ${pintar(`${r.status} ${r.statusText}`)}  (${ms} ms)`);
    for (const h of ['location', 'retry-after', 'ratelimit-remaining', 'x-total-count', 'x-request-id']) {
      const v = r.headers.get(h);
      if (v) console.log(`   ${h}: ${v}`);
    }
    if (texto) console.log('   ' + (texto.length > resumir ? texto.slice(0, resumir) + ' ...' : texto));
  }
  return { status: r.status, headers: r.headers, json, texto, requestId: r.headers.get('x-request-id') };
}

export function confere(condicao, mensagem) {
  console.log(condicao ? verde(`   [ok] ${mensagem}`) : vermelho(`   [FALHOU] ${mensagem}`));
  if (!condicao) process.exitCode = 1;
}

export async function pausa(mensagem) {
  if (process.argv.includes('--sem-pausa') || !process.stdin.isTTY) return;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  await rl.question(amarelo(`\n>>> ${mensagem} [Enter para continuar] `));
  rl.close();
}

export const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/** Data local (Brasília) daqui a N dias, no formato AAAA-MM-DD. */
export function dataDaquiA(dias) {
  return new Date(Date.now() - 3 * 3_600_000 + dias * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Procura o próximo horário livre de uma quadra (a partir de depois de amanhã,
 * entre 09:00 e 16:00), para que os scripts possam ser executados várias vezes
 * sem esbarrar na regra "horário já ocupado".
 */
export async function horarioLivre(quadraId = 'q1', duracaoMinutos = 60, chave = CHAVES.painel) {
  const ocupados = [];
  for (let pagina = 1; ; pagina++) {
    const r = await fetch(`${GATEWAY}/api/agendamentos?quadraId=${quadraId}&status=CONFIRMADO&tamanho=50&pagina=${pagina}`, { headers: { 'x-api-key': chave } });
    if (!r.ok) throw new Error(`não consegui consultar a agenda (${r.status}). O gateway e a API REST estão no ar?`);
    const j = await r.json();
    ocupados.push(...j.dados.map((a) => [Date.parse(a.inicio), Date.parse(a.fim)]));
    if (pagina >= j.paginacao.totalPaginas) break;
  }
  for (let dia = 2; dia < 55; dia++) {
    for (let minuto = 9 * 60; minuto + duracaoMinutos <= 16 * 60; minuto += 30) {
      const hhmm = `${String(Math.floor(minuto / 60)).padStart(2, '0')}:${String(minuto % 60).padStart(2, '0')}`;
      const iso = `${dataDaquiA(dia)}T${hhmm}:00-03:00`;
      const ini = Date.parse(iso);
      const fim = ini + duracaoMinutos * 60_000;
      if (!ocupados.some(([a, b]) => a < fim && ini < b)) return iso;
    }
  }
  throw new Error('nenhum horário livre encontrado');
}
