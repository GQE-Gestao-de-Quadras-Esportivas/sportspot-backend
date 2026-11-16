// Cena 7: rota agregada /api/painel/quadras/:id (tela "Painel da quadra").
// Junta os dados da quadra (API REST) com a agenda do dia e os atletas
// (GraphQL). Com o GraphQL desligado, responde só com a parte disponível
// (degradação graciosa) e avisa o que faltou.
// Uso: node testes/painel.js
import { chamar, confere, titulo, pausa, dataDaquiA } from './comum.js';

const caminho = `/api/painel/quadras/q1?data=${dataDaquiA(1)}`;

titulo('Resposta completa (API REST + GraphQL no ar)');
const completa = await chamar('GET', caminho, { resumir: 2000 });
confere(completa.status === 200 && completa.json.parcial === false, 'parcial: false, as duas fontes responderam');

if (process.argv.includes('--sem-pausa') || !process.stdin.isTTY) {
  console.log('\n(--sem-pausa: pulei a parte que exige desligar o GraphQL)');
  process.exit();
}
await pausa('Agora DESLIGUE o GraphQL (Ctrl+C no terminal do "npm run graphql")');
titulo('Resposta parcial (GraphQL fora do ar)');
const parcial = await chamar('GET', caminho, { resumir: 2000 });
confere(parcial.status === 200 && parcial.json.parcial === true && parcial.json.quadra !== null, 'parcial: true; a quadra veio da API REST e a agenda ficou null');
console.log('\n   Religue o GraphQL (npm run graphql) antes da próxima cena.');
