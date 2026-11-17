// Registro dos eventIds já processados por um consumidor.
// Fica em um arquivo JSON para sobreviver a um reinício do consumidor.
// Em produção, isso seria uma tabela com chave única (event_id) no banco do consumidor.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PASTA = join(dirname(fileURLToPath(import.meta.url)), "..", "dados");

export class Idempotencia {
  constructor(consumidor) {
    mkdirSync(PASTA, { recursive: true });
    this.arquivo = join(PASTA, `processados-${consumidor}.json`);
    this.ids = new Set(existsSync(this.arquivo) ? JSON.parse(readFileSync(this.arquivo, "utf8")) : []);
  }

  jaProcessado(eventId) {
    return this.ids.has(eventId);
  }

  registrar(eventId) {
    this.ids.add(eventId);
    writeFileSync(this.arquivo, JSON.stringify([...this.ids], null, 2));
  }
}

export function caminhoDados(nomeArquivo) {
  mkdirSync(PASTA, { recursive: true });
  return join(PASTA, nomeArquivo);
}
