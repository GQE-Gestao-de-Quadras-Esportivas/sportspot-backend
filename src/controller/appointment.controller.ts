import { Request, Response } from "express";
import { AppointmentService } from "../services/appointment.service.js";
import { validateAppointment } from "../validation/appointment.validation.js";
import { badRequest } from "../errors/http-error.js";
import { config } from "../config.js";

export class AppointmentController {
  constructor(private appointmentService: AppointmentService) {}

  // GET /courts/:id/appointments
  listByCourt = async (req: Request, res: Response) => {
    res.status(200).json(await this.appointmentService.listByCourt(String(req.params.id)));
  };

  // POST /courts/:id/appointments → 201 + Location
  create = async (req: Request, res: Response) => {
    const input = validateAppointment(req.body);
    const appointment = await this.appointmentService.create(String(req.params.id), input, req.user.id);
    res.location(`${config.basePath}/appointments/${appointment.id}`).status(201).json(appointment);
  };

  // GET /appointments?role=landlord|customer
  listMine = async (req: Request, res: Response) => {
    const role = (req.query.role as string) ?? "landlord";
    if (role !== "landlord" && role !== "customer") {
      throw badRequest("Parâmetros de consulta inválidos.", [{ field: "role", message: "use landlord ou customer" }]);
    }
    res.status(200).json(await this.appointmentService.listMine(req.user.id, role));
  };

  // GET /appointments/:id
  get = async (req: Request, res: Response) => {
    res.status(200).json(await this.appointmentService.get(String(req.params.id)));
  };

  // DELETE /appointments/:id → 204 (cancela a reserva)
  cancel = async (req: Request, res: Response) => {
    await this.appointmentService.cancel(String(req.params.id), req.user.id);
    res.status(204).end();
  };
}
