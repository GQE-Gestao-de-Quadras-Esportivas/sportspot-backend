import { Request, Response } from "express";
import { CourtService } from "../services/court.service.js";
import { parseCourtListQuery, validateCourt, CourtInput } from "../validation/court.validation.js";
import { config } from "../config.js";

// No Express 5, um erro lançado em handler async vai direto ao errorHandler,
// então os controllers não precisam de try/catch.
export class CourtController {
  constructor(private courtService: CourtService) {}

  // GET /courts?sport=&groundType=&city=&state=&minPrice=&maxPrice=&owner=me&sort=&order=&page=&limit=
  list = async (req: Request, res: Response) => {
    const query = parseCourtListQuery(req.query as Record<string, unknown>);
    const result = await this.courtService.list(query, req.user.id);
    res.setHeader("X-Total-Count", String(result.pagination.total));
    res.status(200).json(result);
  };

  // GET /courts/:id
  get = async (req: Request, res: Response) => {
    res.status(200).json(await this.courtService.get(String(req.params.id)));
  };

  // POST /courts → 201 + Location
  create = async (req: Request, res: Response) => {
    const data = validateCourt(req.body, false) as CourtInput;
    const court = await this.courtService.create(data, req.user.id);
    res.location(`${config.basePath}/courts/${court.id}`).status(201).json(court);
  };

  // PUT /courts/:id → substitui todos os campos
  replace = async (req: Request, res: Response) => {
    const data = validateCourt(req.body, false);
    res.status(200).json(await this.courtService.update(String(req.params.id), data, req.user.id));
  };

  // PATCH /courts/:id → altera só os campos enviados
  patch = async (req: Request, res: Response) => {
    const data = validateCourt(req.body, true);
    res.status(200).json(await this.courtService.update(String(req.params.id), data, req.user.id));
  };

  // DELETE /courts/:id → 204
  remove = async (req: Request, res: Response) => {
    await this.courtService.remove(String(req.params.id), req.user.id);
    res.status(204).end();
  };
}
