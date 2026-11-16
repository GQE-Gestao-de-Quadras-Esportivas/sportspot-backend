// Cena 8: o mesmo X-Request-Id no gateway, na API REST e nos consumidores.
// Sem argumento: faz uma reserva pelo gateway, espera os consumidores e procura
// o X-Request-Id da resposta em todos os arquivos de log (pasta logs/).
// Com argumento: procura o id informado.  Ex.: node testes/rastreio.js 1b2c...
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { chamar, titulo, horarioLivre, esperar, ciano, confere } from './comum.js';
import { PASTA_LOGS } from '../shared/logger.js';

let requestId = process.argv[2];
if (!requestId) {
  titulo('Reserva pelo gateway');
  const r = await chamar('POST', '/api/agendamentos', { corpo: { quadraId: 'q4', atletaId: 'a2', inicio: await horarioLivre('q4', 60), duracaoMinutos: 60 } });
  requestId = r.requestId;
  console.log('\nAguardando 2 s para os consumidores...');
  await esperar(2000);
}

titulo(`Linhas de log com X-Request-Id ${requestId}`);
if (!existsSync(PASTA_LOGS)) {
  console.log('A pasta logs/ ainda não existe: suba os serviços primeiro.');
  process.exit(1);
}
const componentes = new Set();
for (const arquivo of readdirSync(PASTA_LOGS).filter((a) => a.endsWith('.log')).sort()) {
  const linhas = readFileSync(join(PASTA_LOGS, arquivo), 'utf8').split('\n').filter((l) => l.includes(requestId));
  if (!linhas.length) continue;
  console.log('\n' + ciano(`[${arquivo}]`));
  for (const l of linhas) {
    const j = JSON.parse(l);
    componentes.add(j.servico);
    console.log(`  ${j.instante}  ${j.nivel}  ${j.mensagem}`);
  }
}
console.log(`\nComponentes que registraram este X-Request-Id: ${[...componentes].join(', ')}`);
confere(componentes.size >= 3, 'o mesmo id aparece em 3 ou mais componentes (gateway, API REST e consumidores)');
