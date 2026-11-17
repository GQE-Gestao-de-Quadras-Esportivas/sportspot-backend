// Consumidor 1: NOTIFICAÇÕES
// Recebe TODOS os eventos de agendamento (agendamento.*) e avisa por e-mail
// o jogador que reservou e o dono da quadra.
// O envio é simulado: o "e-mail" vai para o log e para dados/emails-enviados.log.
//
// Falha provocada: e-mail inválido no evento → 3 tentativas → notificacoes.dlq

import { appendFileSync } from "node:fs";
import { iniciarConsumidor } from "./lib/consumidor.js";
import { caminhoDados } from "./lib/idempotencia.js";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const caixaDeSaida = caminhoDados("emails-enviados.log");

const formatar = (iso) =>
  new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });

function enviarEmail(para, assunto, requestId) {
  if (!para || !EMAIL.test(para)) {
    throw new Error(`e-mail inválido: "${para}"`);
  }
  const linha = `${new Date().toISOString()} [${requestId}] para=${para} assunto="${assunto}"`;
  appendFileSync(caixaDeSaida, linha + "\n");
  return linha;
}

await iniciarConsumidor({
  nome: "notificacoes",
  ligacoes: ["agendamento.*"], // criado E cancelado
  async processar(evento, { log }) {
    const d = evento.data;
    const quando = `${formatar(d.startTime)} até ${formatar(d.endTime)}`;

    const assunto =
      evento.type === "agendamento.criado"
        ? `Reserva confirmada: ${d.courtName}, ${quando}`
        : `Reserva cancelada: ${d.courtName}, ${quando}`;

    // Valida os dois destinatários antes de enviar, para não mandar só metade
    for (const email of [d.customerEmail, d.landlordEmail]) {
      if (!email || !EMAIL.test(email)) throw new Error(`e-mail inválido: "${email}"`);
    }
    enviarEmail(d.customerEmail, assunto, evento.requestId);
    enviarEmail(d.landlordEmail, `[Proprietário] ${assunto}`, evento.requestId);
    log(`📧 e-mails enviados para ${d.customerEmail} e ${d.landlordEmail}: "${assunto}"`);
  },
});
