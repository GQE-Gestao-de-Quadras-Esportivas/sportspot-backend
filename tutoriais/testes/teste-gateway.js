// Cena 6: proteções do gateway. Mostra 200, 401, 403, 429, 504, 502 e 503
// (disjuntor) e a recuperação. Na parte do 502/503 o script pede para você
// desligar a API REST (Ctrl+C no terminal dela) e depois religá-la.
// Uso: node testes/teste-gateway.js
//      node testes/teste-gateway.js --sem-pausa   (só a parte automática)
import { chamar, confere, titulo, pausa, esperar, CHAVES, GATEWAY, amarelo } from './comum.js';

titulo('200: chamada autenticada');
const ok = await chamar('GET', '/api/quadras?tamanho=1', { resumir: 160 });
confere(ok.status === 200, '200 com a chave do painel');

titulo('401: sem chave e com chave inválida');
const semChave = await chamar('GET', '/api/quadras', { chave: null });
confere(semChave.status === 401 && semChave.headers.get('content-type').includes('problem+json'), '401 em Problem Details');
const chaveErrada = await chamar('GET', '/api/quadras', { chave: 'chave-que-nao-existe' });
confere(chaveErrada.status === 401, '401 com chave inválida');

titulo('403: o parceiro (só leitura do catálogo) tenta ver as reservas');
const negado = await chamar('GET', '/api/agendamentos', { chave: CHAVES.parceiro });
confere(negado.status === 403, '403: autorização por rota');

titulo('JWT: login fictício da atleta Ana e chamada com Bearer');
const login = await fetch(`${GATEWAY}/api/auth/token`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'ana.souza@email-exemplo.test', senha: 'senha-demo-atleta' }),
}).then((r) => r.json());
const comJwt = await fetch(`${GATEWAY}/api/atletas/a1`, { headers: { authorization: `Bearer ${login.access_token}` } });
console.log(`GET /api/atletas/a1 com Bearer -> ${comJwt.status}`);
confere(comJwt.status === 200, '200 com token JWT');

titulo('429: app-atleta tem plano de 10 requisições por minuto');
let ultimo;
for (let i = 1; i <= 12; i++) {
  ultimo = await chamar('GET', '/api/quadras?tamanho=1', { chave: CHAVES.atleta, mostrar: false });
  console.log(`   requisição ${String(i).padStart(2)}: ${ultimo.status}  (restantes: ${ultimo.headers.get('ratelimit-remaining')})`);
  if (ultimo.status === 429) break;
}
console.log(`   Retry-After: ${ultimo.headers.get('retry-after')} s`);
confere(ultimo.status === 429 && ultimo.headers.get('retry-after'), '429 com Retry-After');
const outroCliente = await chamar('GET', '/api/quadras?tamanho=1', { mostrar: false });
confere(outroCliente.status === 200, 'o limite é por cliente: o painel continua com 200');

titulo('504: a API REST demora mais que o timeout do gateway (2,5 s)');
const lento = await chamar('GET', '/api/diagnostico/lento?ms=5000');
confere(lento.status === 504, '504 Gateway Timeout em Problem Details');

if (process.argv.includes('--sem-pausa') || !process.stdin.isTTY) {
  console.log(amarelo('\n(--sem-pausa: pulei a parte que exige desligar a API REST)'));
  process.exit();
}

await pausa('Agora DESLIGUE a API REST (Ctrl+C no terminal do "npm run rest")');
titulo('502 e depois 503: serviço fora do ar e disjuntor aberto');
for (let i = 1; i <= 4; i++) {
  const r = await chamar('GET', '/api/quadras?tamanho=1');
  if (r.status === 503) {
    confere(true, `503 na chamada ${i}: o disjuntor abriu e o gateway nem tenta chamar a API (Retry-After ${r.headers.get('retry-after')} s)`);
    break;
  }
  confere(r.status === 502, `chamada ${i}: 502 (o gateway tentou de novo com espera crescente antes de desistir)`);
}

await pausa('Agora RELIGUE a API REST (npm run rest) e espere ela subir');
titulo('Recuperação: quando o tempo do disjuntor acaba, uma chamada de teste fecha o circuito');
for (let i = 0; i < 20; i++) {
  const r = await chamar('GET', '/api/quadras?tamanho=1', { mostrar: false });
  if (r.status === 200) {
    confere(true, '200 de novo: disjuntor FECHADO');
    break;
  }
  console.log(`   ${r.status} (aguardando o disjuntor; Retry-After ${r.headers.get('retry-after') ?? '-'})`);
  await esperar(2000);
}
const saude = await fetch(`${GATEWAY}/health`).then((r) => r.json());
console.log('   /health:', JSON.stringify(saude.disjuntores));
