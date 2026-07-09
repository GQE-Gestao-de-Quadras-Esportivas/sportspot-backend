import { Router } from "express";
import { authRoutes } from "./auth.routes.js";
import { courtsRoutes } from "./courts.routes.js";

const routes = Router();

routes.use("/auth", authRoutes);
routes.use("/courts", courtsRoutes)

export { routes };
