import { Router, Request, Response } from "express";
import { ensureAuthenticated } from "../middlewares/auth.middleware.js";
import { CourtController } from "../controller/court.controller.js";
import { CourtService } from "../services/court.service.js";
import { AppDataSource } from "../data-source.js";

const courtsRoutes = Router();

const courtService = new CourtService(AppDataSource);
const courtController = new CourtController(courtService);

courtsRoutes.get("/", ensureAuthenticated, (req, res) => courtController.list(req, res));
courtsRoutes.post("/register", ensureAuthenticated, (req, res) => courtController.register(req, res));

courtsRoutes.get("/appointments", ensureAuthenticated, (req, res) => courtController.listAppointments(req, res));
courtsRoutes.post("/:courtId/new/appointment", ensureAuthenticated, (req, res) => courtController.createAppointment(req, res));

export { courtsRoutes };
