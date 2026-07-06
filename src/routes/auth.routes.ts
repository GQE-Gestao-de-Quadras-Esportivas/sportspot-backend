import { Router, Request, Response } from "express";
import { AuthController } from "../controller/auth.controller.js";
import { AppDataSource } from "../data-source.js";
import { AuthService } from "../services/auth.service.js";

const authRoutes = Router();

const authService = new AuthService(AppDataSource)
const authController = new AuthController(authService);

authRoutes.get('/', (req: Request, res: Response) => {
    res.json({ message: 'Rota de autenticação funcionando!' });
});

authRoutes.post('/login', (req, res) => authController.login(req, res));

authRoutes.post('/register', (req, res) => authController.register(req, res));

export { authRoutes }