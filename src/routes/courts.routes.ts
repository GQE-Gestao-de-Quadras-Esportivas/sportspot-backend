import { Router, Request, Response } from "express";

const courtsRoutes = Router();

courtsRoutes.get('/', (req: Request, res: Response) => {
    res.json({
        message: 'Rota de quadras funcionando!'
    });
});

export { courtsRoutes }