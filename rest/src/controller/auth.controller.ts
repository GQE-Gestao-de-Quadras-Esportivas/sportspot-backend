import { Request, Response } from "express";
import { AuthService } from "../services/auth.service.js";
import { badRequest, conflict, FieldError, unauthorized, unprocessable } from "../errors/http-error.js";

const required = (body: any, fields: string[]): FieldError[] =>
  fields.filter((f) => !body?.[f]).map((field) => ({ field, message: "obrigatório" }));

export class AuthController {
  constructor(private authService: AuthService) {}

  // POST /auth/login → 200
  login = async (req: Request, res: Response) => {
    const missing = required(req.body, ["email", "password"]);
    if (missing.length) throw badRequest("E-mail ou senha não informados.", missing);

    try {
      const { accessToken, refreshToken, user } = await this.authService.loginUser({
        email: req.body.email,
        password: req.body.password,
      });

      res.cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      return res.status(200).json({ message: "Usuário autenticado com sucesso!", accessToken, user });
    } catch (error: any) {
      // Mesma mensagem para e-mail inexistente e senha errada: não revela quais e-mails existem
      if (error.message === "USER_DONT_EXISTS" || error.message === "WRONG_PASSWORD") {
        throw unauthorized("E-mail ou senha incorretos.");
      }
      throw error;
    }
  };

  // POST /auth/register → 201
  register = async (req: Request, res: Response) => {
    const missing = required(req.body, [
      "name", "document", "date_of_birth", "phone_number", "email", "password", "confirm_password",
    ]);
    if (missing.length) throw badRequest("Há campos obrigatórios ausentes.", missing);

    const { name, document, date_of_birth, phone_number, email, password, confirm_password } = req.body;
    if (password !== confirm_password) {
      throw unprocessable("senhas-diferentes", "Senhas diferentes", "A senha e a confirmação não coincidem.");
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw unprocessable("email-invalido", "E-mail inválido", "Informe um e-mail no formato nome@dominio.com.");
    }
    if (isNaN(Date.parse(date_of_birth))) {
      throw unprocessable("data-invalida", "Data inválida", "date_of_birth deve estar no formato AAAA-MM-DD.");
    }

    try {
      const newUser = await this.authService.registerUser({
        name, document, date_of_birth, phone_number, email, password_plain: password,
      });
      return res.status(201).json({ message: "Usuário cadastrado com sucesso!", user: newUser });
    } catch (error: any) {
      if (error.message === "EMAIL_ALREADY_EXISTS") {
        throw conflict("email-em-uso", "E-mail já cadastrado", "Este e-mail já está em uso.");
      }
      if (error.code === "23505") {
        throw conflict("dados-duplicados", "Dados já cadastrados", "Documento ou telefone já pertencem a outro usuário.");
      }
      throw error;
    }
  };

  // POST /auth/refresh → 200
  refresh = async (req: Request, res: Response) => {
    try {
      const { accessToken } = await this.authService.refreshSession(req.cookies?.refreshToken);
      return res.status(200).json({ accessToken });
    } catch {
      throw unauthorized("Sessão expirada. Faça login novamente.");
    }
  };
}
