import { Router, Request, Response } from "express";

const authRoutes = Router();

authRoutes.get('/', (req: Request, res: Response) => {
    res.json({ message: 'Rota de autenticação funcionando!' });
});

export { authRoutes }