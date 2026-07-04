import { Request, Response } from "express";
import { AuthService } from "../services/AuthService.js";

export class AuthController {
  constructor(private authService: AuthService) {}

  register = async (req: Request, res: Response): Promise<Response> => {
    const {
      name,
      document,
      date_of_birth,
      phone_number,
      email,
      password,
      confirm_password,
    } = req.body;

    if (
      !name ||
      !email ||
      !password ||
      !confirm_password ||
      !phone_number ||
      !date_of_birth
    ) {
      return res
        .status(400)
        .json({ message: "Todos os campos são obrigatórios." });
    }

    if (password !== confirm_password) {
      return res.status(400).json({ message: "As senhas não coincidem." });
    }

    try {
      const newUser = await this.authService.registerUser({
        name,
        document,
        date_of_birth,
        phone_number,
        email,
        password_plain: password,
      });

      return res.status(201).json({
        message: "Usuário cadastrado com sucesso!",
        user: newUser,
      });
    } catch (error: any) {
      if (error.message === "EMAIL_ALREADY_EXISTS") {
        return res.status(400).json({ message: "Este e-mail já está em uso." });
      }

      console.error(error);
      return res
        .status(500)
        .json({ message: "Erro interno ao processar o cadastro." });
    }
  };
}
