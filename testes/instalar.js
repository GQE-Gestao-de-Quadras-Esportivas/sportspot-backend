// Instala as dependências de todas as partes com um comando: npm run instalar
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const pastas = [".", "rest", "mensageria", "graphql", "gateway"];

for (const pasta of pastas) {
  console.log(`\n📦 npm install em ${pasta === "." ? "(raiz: scripts de teste)" : pasta}/`);
  const r = spawnSync("npm", ["install", "--no-audit", "--no-fund"], {
    cwd: join(raiz, pasta),
    stdio: "inherit",
    shell: true, // no Windows, o npm é um .cmd
  });
  if (r.status !== 0) {
    console.error(`\n❌ Falhou em ${pasta}/. Corrija o erro acima e rode de novo.`);
    process.exit(1);
  }
}
console.log("\n✅ Tudo instalado.");
