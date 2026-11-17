import { Router } from "express";
import { authRoutes } from "./auth.routes.js";
import { courtsRoutes } from "./courts.routes.js";
import { appointmentsRoutes } from "./appointments.routes.js";
import { ensureAuthenticated } from "../middlewares/auth.middleware.js";
import { me } from "../controller/user.controller.js";

const routes = Router();

routes.use("/auth", authRoutes);
routes.use("/courts", courtsRoutes);
routes.use("/appointments", appointmentsRoutes);
routes.get("/users/me", ensureAuthenticated, me);

export { routes };
