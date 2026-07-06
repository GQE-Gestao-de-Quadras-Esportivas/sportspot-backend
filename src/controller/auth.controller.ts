import { Request, Response } from "express";
import { AuthService } from "../services/auth.service.js";
import jwt from "jsonwebtoken";

export class AuthController {
  constructor(private authService: AuthService) {}

  login = async (req: Request, res: Response): Promise<Response> => {
    const { email, password } = req.body;

    if (!email || !password)
      return res
        .status(400)
        .json({ message: "Email ou senha não informados!" });

    try {
      const user = await this.authService.loginUser({
        email,
        password,
      });

      const secret = process.env.JWT_SECRET || "sportspot-token";
      const refreshSecret =
        process.env.JWT_REFRESH_SECRET || "sportspot-refresh-token";

      const accessToken = jwt.sign({ role: user.user_type || "user" }, secret, {
        subject: String(user.id),
        expiresIn: "15m",
      });

      const refreshToken = jwt.sign({}, refreshSecret, {
        subject: String(user.id),
        expiresIn: "7d",
      });

      return res.status(201).json({
        message: "Usuário autenticado com sucesso!",
        accessToken,
        user: {
          id: user.id,
          email: user.email,
          user_type: user.user_type
        },
      });
    } catch (error: any) {
      if (error.message === "USER_DONT_EXISTS") {
        return res
          .status(400)
          .json({ message: "Não existe usuário cadastrado com este email." });
      }
      if (error.message === "WRONG_PASSWORD") {
        return res
          .status(400)
          .json({ message: "O email ou a senha estão errados." });
      }

      console.error(error);
      return res
        .status(500)
        .json({ message: "Erro interno ao processar o login." });
    }
  };

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
