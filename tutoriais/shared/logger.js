// Logger simples e estruturado.
// - No terminal: uma linha legível, sempre com o X-Request-Id (req=...).
// - Em arquivo (logs/<servico>.log): uma linha JSON por evento, usada pelo
//   script testes/rastreio.js para seguir o mesmo X-Request-Id entre os componentes.
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
export const PASTA_LOGS = process.env.PASTA_LOGS ?? join(raiz, 'logs');

const CORES = { INFO: '\x1b[36m', WARN: '\x1b[33m', ERRO: '\x1b[31m' };
const RESET = '\x1b[0m';

export function criarLogger(servico, { arquivo = true, silencioso = false } = {}) {
  const caminho = join(PASTA_LOGS, `${servico}.log`);
  if (arquivo) mkdirSync(dirname(caminho), { recursive: true });

  function registrar(nivel, mensagem, extra = {}) {
    const instante = new Date().toISOString();
    const { requestId, ...todos } = extra;
    const resto = Object.fromEntries(Object.entries(todos).filter(([, v]) => v !== undefined));
    if (arquivo) {
      try {
        appendFileSync(caminho, JSON.stringify({ instante, servico, nivel, requestId, mensagem, ...resto }) + '\n');
      } catch {
        /* log em arquivo é melhor esforço */
      }
    }
    if (silencioso) return;
    const detalhes = Object.keys(resto).length ? ' ' + JSON.stringify(resto) : '';
    const req = requestId ? ` req=${requestId}` : '';
    const cor = process.stdout.isTTY ? CORES[nivel] ?? '' : '';
    const fim = cor ? RESET : '';
    console.log(`${instante.slice(11, 23)} ${cor}${nivel.padEnd(4)}${fim} [${servico}]${req} ${mensagem}${detalhes}`);
  }

  return {
    info: (msg, extra) => registrar('INFO', msg, extra),
    warn: (msg, extra) => registrar('WARN', msg, extra),
    erro: (msg, extra) => registrar('ERRO', msg, extra),
  };
}
