import { Request, Response } from "express";
import { CourtService } from "../services/court.service.js";

export class CourtController {
  constructor(private courtService: CourtService) {}

  list = async (req: Request, res: Response): Promise<Response> => {
    const userID = req.user.id;
    if (!userID)
      return res.status(404).json({ message: "Usuário não encontrado." });

    try {
      const courts = await this.courtService.listCourts(userID);
      return res.status(200).json(courts);
    } catch (error: any) {
      console.error(error);
      return res
        .status(500)
        .json({ message: "Erro interno ao processar os dados." });
    }
  };

  register = async (req: Request, res: Response): Promise<Response> => {
    const {
      court_name,
      sport,
      price,
      ground_type,
      cep,
      address,
      address_number,
      neighborhood,
      city,
      state,
      descricao,
      temCobertura,
      temIluminacao,
      temVestiario,
    } = req.body;

    if (
      !court_name ||
      !sport ||
      !price ||
      !ground_type ||
      !cep ||
      !address ||
      !address_number ||
      !neighborhood ||
      !city ||
      !state
    ) {
      return res
        .status(400)
        .json({ message: "Todos os campos são obrigatórios." });
    }

    const userID = req.user.id;
    if (!userID)
      return res.status(404).json({ message: "Usuário não encontrado." });

    const resources = [temCobertura, temIluminacao, temVestiario]
    try {
      const newCourt = await this.courtService.registerCourt({
        landlord_id: userID,
        court_name,
        sport,
        price,
        ground_type,
        cep,
        address,
        address_number,
        neighborhood,
        city,
        state,
        descricao,
        resources
      });

      return res.status(201).json({
        message: "Quadra cadastrada com sucesso!",
        court: newCourt,
      });
    } catch (error: any) {
      console.error(error);
      return res
        .status(500)
        .json({ message: "Erro interno ao processar o cadastro." });
    }
  };
}
