import { Router, Request, Response } from "express";
import { AuthController } from "../controller/AuthController.js";
import { AppDataSource } from "../data-source.js";
import { AuthService } from "../services/AuthService.js";

const authRoutes = Router();

const authService = new AuthService(AppDataSource)
const authController = new AuthController(authService);

authRoutes.get('/', (req: Request, res: Response) => {
    res.json({ message: 'Rota de autenticação funcionando!' });
});

authRoutes.post('/register', (req, res) => authController.register(req, res));

export { authRoutes }