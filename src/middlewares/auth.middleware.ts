import { Request, Response, NextFunction } from "express";
import jwt from 'jsonwebtoken';
const { verify } = jwt;

interface ITokenPayload {
    iat: number;
    exp: number;
    sub: string;
}

export function ensureAuthenticated(req: Request, res: Response, next: NextFunction): Response | void {
    const authHeader = req.headers.authorization;

    if (!authHeader) return res.status(401).json({ message: "Token JWT não fornecido." });

    const [, token] = authHeader.split(' ');

    try {
        const secret = process.env.JWT_SECRET || 'sportspot-jwt-fallback';
        const decoded = verify(token, secret);

        const { sub } = decoded as ITokenPayload;

        req.user = {
            id: sub,
        };

        return next();
    } catch (err) {
        return res.status(401).json({ message: "Token JWT inválido ou expirado." });
    }
}