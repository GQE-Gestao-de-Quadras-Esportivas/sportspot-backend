import { Request, Response } from "express";
import { AppDataSource } from "../data-source.js";
import { UserDetails } from "../entities/UserDetails.js";
import { AuthUsers } from "../entities/AuthUsers.js";
import { notFound } from "../errors/http-error.js";

// GET /users/me → dados do usuário logado (usado pelo GraphQL na Parte 3)
export async function me(req: Request, res: Response) {
  const details = await AppDataSource.getRepository(UserDetails).findOneBy({ id: req.user.id });
  const auth = await AppDataSource.getRepository(AuthUsers).findOneBy({ id: req.user.id });
  if (!details || !auth) throw notFound("Usuário não encontrado.");
  res.status(200).json({
    id: details.id,
    name: details.name,
    email: auth.email,
    phone_number: details.phone_number,
    user_type: auth.user_type,
  });
}
