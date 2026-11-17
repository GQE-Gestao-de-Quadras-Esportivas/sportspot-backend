import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { unauthorized } from "../errors/http-error.js";

interface ITokenPayload {
  sub: string;
  role?: string;
}

// O gateway identifica o APLICATIVO (chave de API).
// Este middleware identifica o USUÁRIO (JWT), para a API conferir quem é dono de cada dado.
export function ensureAuthenticated(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader) throw unauthorized("Token JWT não fornecido no cabeçalho Authorization.");

  const [scheme, token] = authHeader.split(" ");
  if (scheme !== "Bearer" || !token) throw unauthorized("Use o formato: Authorization: Bearer <token>.");

  try {
    const { sub, role } = jwt.verify(token, config.jwtSecret) as ITokenPayload;
    req.user = { id: sub, role };
    return next();
  } catch {
    throw unauthorized("Token JWT inválido ou expirado.");
  }
}
