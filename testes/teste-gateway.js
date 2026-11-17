// Cena 6: proteções do gateway.
// Mostra 200, 401, 429, 504, 502 e 503 (disjuntor), e a recuperação.
//
// Uso: node testes/teste-gateway.js
// Precisa de: API REST e gateway no ar. No meio do roteiro, o script pede para
// desligar e religar a API REST.

import { chamar, mostrar, esperar, pausar, novoUsuarioComToken, CHAVES, QUADRA, GATEWAY } from "./lib/gateway.js";

console.log(`Gateway: ${GATEWAY}\n`);
const token = await novoUsuarioComToken();

console.log("── 200 e reescrita de Location ──────────────────────────────");
mostrar("GET /api/rest/courts (painel-locador)", await chamar("/api/rest/courts?limit=5", { token }));
const criada = await chamar("/api/rest/courts", { metodo: "POST", token, corpo: QUADRA });
mostrar("POST /api/rest/courts (Location reescrito)", criada);

console.log("\n── 401: sem chave ou chave inválida ─────────────────────────");
mostrar("GET sem X-API-Key", await chamar("/api/rest/courts", { chave: null, token }));
mostrar("GET com X-API-Key inválida", await chamar("/api/rest/courts", { chave: "chave-que-nao-existe", token }));

console.log("\n── 429: app-jogador tem limite de 10 por minuto ─────────────");
const statusJogador = [];
let ultima;
for (let i = 1; i <= 12; i++) {
  ultima = await chamar("/api/rest/courts?limit=1", { chave: CHAVES.jogador, token });
  statusJogador.push(ultima.status);
}
console.log(`12 chamadas seguidas: ${statusJogador.join(" ")}`);
mostrar("Última chamada do app-jogador", ultima);
mostrar("painel-locador no mesmo minuto (120/min)", await chamar("/api/rest/courts?limit=1", { token }));

console.log("\n── 504: serviço lento (timeout do gateway: 4 s, como no caderno de restrições) ─────────────");
mostrar("GET /api/rest/diagnostico/lento?ms=6000", await chamar("/api/rest/diagnostico/lento?ms=6000"));
mostrar("Chamada normal logo depois (zera as falhas)", await chamar("/api/rest/courts?limit=1", { token }));

await pausar("Agora DESLIGUE a API REST (Ctrl+C no terminal dela).");

console.log("\n── 502 e 503: API REST desligada ────────────────────────────");
for (let i = 1; i <= 5; i++) {
  mostrar(`Chamada ${i} com a API fora do ar`, await chamar("/api/rest/courts?limit=1", { token }));
}
const status = await chamar("/gateway/status", { chave: null });
console.log(`Estado do disjuntor: ${JSON.stringify(status.dados.disjuntores)}`);

await pausar("Agora RELIGUE a API REST (npm start) e espere aparecer a mensagem de que ela está no ar.");

console.log("\n── Recuperação ──────────────────────────────────────────────");
let r = await chamar("/api/rest/courts?limit=1", { token });
mostrar("Logo após religar (disjuntor ainda aberto)", r);
if (r.status === 503) {
  const espera = Number(r.headers.get("retry-after") || 15);
  console.log(`Aguardando ${espera} s até o disjuntor deixar passar uma chamada de teste...`);
  await esperar(espera * 1000 + 500);
  r = await chamar("/api/rest/courts?limit=1", { token });
  mostrar("Chamada de teste (meio-aberto)", r);
}
const final = await chamar("/gateway/status", { chave: null });
console.log(`Estado do disjuntor: ${JSON.stringify(final.dados.disjuntores)}`);
