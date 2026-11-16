// Funções de data/hora no fuso de Brasília (UTC-3, fixo).
// Internamente os instantes são guardados em milissegundos (UTC); para o
// cliente, são devolvidos em ISO 8601 com o deslocamento -03:00.
import { config } from '../shared/config.js';

const FUSO_MS = config.fusoMinutos * 60_000;
const pad = (n) => String(n).padStart(2, '0');

/** Instante (ms) -> "2026-11-16T19:00:00-03:00" */
export function paraIsoLocal(ms) {
  const local = new Date(ms + FUSO_MS);
  const sinal = config.fusoMinutos <= 0 ? '-' : '+';
  const abs = Math.abs(config.fusoMinutos);
  return (
    `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}` +
    `T${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}:00${sinal}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  );
}

/** Instante (ms) -> "2026-11-16" (data no fuso local) */
export function dataLocal(ms) {
  return new Date(ms + FUSO_MS).toISOString().slice(0, 10);
}

/** Instante (ms) -> minutos desde a meia-noite local */
export function minutosDoDia(ms) {
  const local = new Date(ms + FUSO_MS);
  return local.getUTCHours() * 60 + local.getUTCMinutes();
}

/** "HH:MM" -> minutos */
export function horaParaMinutos(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** Data local (YYYY-MM-DD) somada de N dias a partir de hoje */
export function dataDaquiA(dias, agora = Date.now()) {
  return dataLocal(agora + dias * 86_400_000);
}

/** ("2026-11-16", "19:00") -> instante em ms */
export function instanteLocal(data, hhmm) {
  return Date.parse(`${data}T${hhmm}:00${config.fusoMinutos <= 0 ? '-' : '+'}${pad(Math.abs(config.fusoMinutos) / 60)}:00`);
}

export const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;
export const RE_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
// ISO 8601 com data, hora e fuso obrigatório (Z ou ±HH:MM)
export const RE_ISO_COM_FUSO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;
