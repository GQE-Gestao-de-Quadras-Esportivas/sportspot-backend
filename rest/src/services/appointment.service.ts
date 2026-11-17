import { DataSource, In, LessThan, MoreThan } from "typeorm";
import { Appointments } from "../entities/Appointments.js";
import { Courts } from "../entities/Courts.js";
import { AppointmentInput } from "../validation/appointment.validation.js";
import { conflict, forbidden, notFound, unprocessable } from "../errors/http-error.js";
import { APPOINTMENT_RULES } from "../domain/enums.js";
import { AuthUsers } from "../entities/AuthUsers.js";
import { publishEvent } from "../messaging/publisher.js";

export function toAppointmentDTO(a: Appointments) {
  return {
    id: a.id,
    court_id: a.court_id,
    customer_id: a.customer_id,
    start_time: a.start_time,
    end_time: a.end_time,
    price: a.price === null || a.price === undefined ? null : Number(a.price),
    status: a.status,
    cancelled_at: a.cancelled_at,
    created_at: a.created_At,
  };
}

export class AppointmentService {
  constructor(private dataSource: DataSource) {}

  private get repo() {
    return this.dataSource.getRepository(Appointments);
  }

  async listByCourt(courtId: string) {
    const court = await this.dataSource.getRepository(Courts).findOneBy({ id: courtId });
    if (!court) throw notFound(`A quadra ${courtId} não existe.`);
    const rows = await this.repo.find({ where: { court_id: courtId }, order: { start_time: "ASC" } });
    return rows.map(toAppointmentDTO);
  }

  // role = "landlord": reservas feitas nas MINHAS quadras (painel do proprietário)
  // role = "customer": reservas que EU fiz
  async listMine(userId: string, role: "landlord" | "customer") {
    if (role === "customer") {
      const rows = await this.repo.find({ where: { customer_id: userId }, order: { start_time: "ASC" } });
      return rows.map(toAppointmentDTO);
    }
    const courts = await this.dataSource.getRepository(Courts).find({ where: { landlord: { id: userId } } });
    if (courts.length === 0) return [];
    const rows = await this.repo.find({
      where: { court_id: In(courts.map((c) => c.id)) },
      order: { start_time: "ASC" },
    });
    return rows.map(toAppointmentDTO);
  }

  async get(id: string) {
    const a = await this.repo.findOneBy({ id });
    if (!a) throw notFound(`A reserva ${id} não existe.`);
    return toAppointmentDTO(a);
  }

  async create(courtId: string, input: AppointmentInput, customerId: string, requestId: string) {
    const { start_time, end_time } = input;
    const now = new Date();

    // Regra 1: não agendar no passado (422)
    if (start_time <= now) {
      throw unprocessable(
        "agendamento-no-passado",
        "Horário no passado",
        "Não é possível agendar um horário que já passou.",
      );
    }
    // Regra 2: o fim deve ser depois do início, com duração entre 30 min e 4 h (422)
    const minutos = (end_time.getTime() - start_time.getTime()) / 60000;
    if (minutos <= 0) {
      throw unprocessable(
        "intervalo-invalido",
        "Intervalo inválido",
        "O horário de término deve ser depois do horário de início.",
      );
    }
    if (minutos < APPOINTMENT_RULES.minMinutes || minutos > APPOINTMENT_RULES.maxMinutes) {
      throw unprocessable(
        "duracao-invalida",
        "Duração fora do permitido",
        `A reserva deve durar entre ${APPOINTMENT_RULES.minMinutes} minutos e ${APPOINTMENT_RULES.maxMinutes / 60} horas (pedido: ${minutos} min).`,
      );
    }

    // A verificação de conflito e a gravação acontecem na mesma transação
    const created = await this.dataSource.transaction(async (manager) => {
      // Trava a linha da quadra: duas reservas simultâneas na mesma quadra entram em fila
      const court = await manager.getRepository(Courts).findOne({
        where: { id: courtId },
        lock: { mode: "pessimistic_write" },
      });
      if (!court) throw notFound(`A quadra ${courtId} não existe.`);

      // Regra 3: horário já ocupado (409). Dois intervalos se sobrepõem quando
      // um começa antes do outro terminar E termina depois do outro começar.
      const conflito = await manager.getRepository(Appointments).findOne({
        where: { court_id: courtId, status: "confirmada", start_time: LessThan(end_time), end_time: MoreThan(start_time) },
      });
      if (conflito) {
        throw conflict(
          "horario-ocupado",
          "Horário já ocupado",
          `A quadra já tem uma reserva de ${conflito.start_time.toISOString()} a ${conflito.end_time.toISOString()}.`,
        );
      }

      const price = Math.round(Number(court.price) * (minutos / 60) * 100) / 100;
      const saved = await manager
        .getRepository(Appointments)
        .save(
          manager
            .getRepository(Appointments)
            .create({ court_id: courtId, customer_id: customerId, start_time, end_time, price }),
        );
      return toAppointmentDTO(saved);
    });

    // Só depois do commit: o evento nunca anuncia uma reserva que não foi gravada
    await this.publish("agendamento.criado", created, requestId);
    return created;
  }

  // Monta o corpo do evento com o que os consumidores precisam (sem obrigá-los a chamar a API)
  private async publish(routingKey: string, a: ReturnType<typeof toAppointmentDTO>, requestId: string) {
    try {
      const court = await this.dataSource.getRepository(Courts).findOne({
        where: { id: a.court_id },
        relations: { landlord: true },
      });
      const users = this.dataSource.getRepository(AuthUsers);
      const landlord = court?.landlord ? await users.findOneBy({ id: court.landlord.id }) : null;
      const customer = a.customer_id ? await users.findOneBy({ id: a.customer_id }) : null;

      publishEvent(
        routingKey,
        {
          appointmentId: a.id,
          courtId: a.court_id,
          courtName: court?.court_name,
          sport: court?.sport,
          landlordId: landlord?.id ?? null,
          landlordEmail: landlord?.email ?? null,
          customerId: a.customer_id,
          customerEmail: customer?.email ?? null,
          startTime: a.start_time,
          endTime: a.end_time,
          price: a.price,
        },
        requestId,
      );
    } catch (err: any) {
      // A reserva já foi gravada: uma falha aqui não pode virar erro 500 para o cliente
      console.error(`[rest] [${requestId}] falha ao montar o evento ${routingKey}: ${err.message}`);
    }
  }

  // Cancelar: quem reservou ou o dono da quadra; só com 24 h de antecedência.
  // DELETE /appointments/:id tira a reserva de uso, mas não apaga o registro
  // (a RFC 9110 permite que o DELETE arquive em vez de excluir).
  async cancel(id: string, userId: string, requestId: string) {
    const a = await this.repo.findOne({ where: { id }, relations: { court: { landlord: true } } });
    if (!a) throw notFound(`A reserva ${id} não existe.`);

    const isCustomer = a.customer_id === userId;
    const isLandlord = a.court?.landlord?.id === userId;
    if (!isCustomer && !isLandlord) throw forbidden("Só quem reservou ou o dono da quadra pode cancelar.");
    if (a.status === "cancelada") {
      throw conflict("reserva-ja-cancelada", "Reserva já cancelada", `A reserva ${id} já foi cancelada.`);
    }

    // Regra 4: cancelamento com no mínimo 24 h de antecedência (422)
    const horasAteInicio = (a.start_time.getTime() - Date.now()) / 3_600_000;
    if (horasAteInicio < APPOINTMENT_RULES.cancelAdvanceHours) {
      throw unprocessable(
        "cancelamento-fora-do-prazo",
        "Cancelamento fora do prazo",
        `Reservas só podem ser canceladas com ${APPOINTMENT_RULES.cancelAdvanceHours} h de antecedência (faltam ${horasAteInicio.toFixed(1)} h).`,
      );
    }
    // Cancelamento lógico: a linha continua no banco, com status e data do cancelamento
    a.status = "cancelada";
    a.cancelled_at = new Date();
    await this.repo.save(a);
    await this.publish("agendamento.cancelado", toAppointmentDTO(a), requestId);
  }
}
