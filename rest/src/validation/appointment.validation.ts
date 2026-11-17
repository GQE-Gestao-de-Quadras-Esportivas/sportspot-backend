import { badRequest, FieldError } from "../errors/http-error.js";

export interface AppointmentInput {
  start_time: Date;
  end_time: Date;
}

// Aceita startTime/endTime (frontend atual) ou start_time/end_time.
// Aqui só checamos FORMATO (400). As regras de negócio (422/409) ficam no serviço.
export function validateAppointment(rawBody: unknown): AppointmentInput {
  if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
    throw badRequest("Envie um objeto JSON com o cabeçalho Content-Type: application/json.");
  }
  const body = rawBody as Record<string, unknown>;
  const start = body.start_time ?? body.startTime;
  const end = body.end_time ?? body.endTime;

  const errors: FieldError[] = [];
  const toDate = (v: unknown, field: string) => {
    if (v === undefined || v === null || v === "") { errors.push({ field, message: "obrigatório" }); return null; }
    if (typeof v !== "string" || isNaN(Date.parse(v))) {
      errors.push({ field, message: "use data e hora ISO 8601, ex.: 2026-12-01T19:00:00-03:00" });
      return null;
    }
    return new Date(v);
  };
  const start_time = toDate(start, "start_time");
  const end_time = toDate(end, "end_time");
  if (errors.length) throw badRequest("Há campos ausentes ou em formato errado.", errors);

  return { start_time: start_time!, end_time: end_time! };
}
