import { Router } from "express";
import { ensureAuthenticated } from "../middlewares/auth.middleware.js";
import { AppointmentController } from "../controller/appointment.controller.js";
import { AppointmentService } from "../services/appointment.service.js";
import { AppDataSource } from "../data-source.js";

const appointmentsRoutes = Router();
const appointments = new AppointmentController(new AppointmentService(AppDataSource));

appointmentsRoutes.use(ensureAuthenticated);

appointmentsRoutes.get("/", appointments.listMine);
appointmentsRoutes.get("/:id", appointments.get);
appointmentsRoutes.delete("/:id", appointments.cancel);

export { appointmentsRoutes };
