import { Router } from "express";
import { ensureAuthenticated } from "../middlewares/auth.middleware.js";
import { CourtController } from "../controller/court.controller.js";
import { AppointmentController } from "../controller/appointment.controller.js";
import { CourtService } from "../services/court.service.js";
import { AppointmentService } from "../services/appointment.service.js";
import { AppDataSource } from "../data-source.js";

const courtsRoutes = Router();
const courts = new CourtController(new CourtService(AppDataSource));
const appointments = new AppointmentController(new AppointmentService(AppDataSource));

courtsRoutes.use(ensureAuthenticated);

// Recurso: quadras (CRUD completo)
courtsRoutes.get("/", courts.list);
courtsRoutes.post("/", courts.create);
courtsRoutes.get("/:id", courts.get);
courtsRoutes.put("/:id", courts.replace);
courtsRoutes.patch("/:id", courts.patch);
courtsRoutes.delete("/:id", courts.remove);

// Sub-recurso: reservas de uma quadra
courtsRoutes.get("/:id/appointments", appointments.listByCourt);
courtsRoutes.post("/:id/appointments", appointments.create);

export { courtsRoutes };
