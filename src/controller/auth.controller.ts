import { Request, Response } from "express";
import { AuthService } from "../services/auth.service.js";

export class AuthController {
  constructor(private authService: AuthService) {}

  login = async (req: Request, res: Response): Promise<Response> => {
    const { email, password } = req.body;

    if (!email || !password)
      return res
        .status(400)
        .json({ message: "Email ou senha não informados!" });

    try {
      const { accessToken, refreshToken, user } =
        await this.authService.loginUser({
          email,
          password,
        });

      res.cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      return res.status(201).json({
        message: "Usuário autenticado com sucesso!",
        accessToken,
        user,
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

  refresh = async (req: Request, res: Response): Promise<Response> => {
    try {
      const refreshToken = req.cookies.refreshToken;

      const { accessToken } =
        await this.authService.refreshSession(refreshToken);

      return res.status(200).json({ accessToken });
    } catch (error: any) {
      if (
        error.message === "REFRESH_TOKEN_NOT_PROVIDED" ||
        error.message === "INVALID_REFRESH_TOKEN"
      ) {
        return res
          .status(401)
          .json({ message: "Sessão expirada. Faça login novamente." });
      }

      return res
        .status(500)
        .json({ message: "Erro interno ao atualizar sessão." });
    }
  };
}
