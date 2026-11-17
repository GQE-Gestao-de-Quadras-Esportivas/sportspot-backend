import { DataSource, FindOptionsWhere, ILike, MoreThan, Between, MoreThanOrEqual, LessThanOrEqual } from "typeorm";
import { Courts } from "../entities/Courts.js";
import { Appointments } from "../entities/Appointments.js";
import { CourtInput, CourtListQuery, SORT_FIELDS } from "../validation/court.validation.js";
import { conflict, forbidden, notFound } from "../errors/http-error.js";
import { GROUND_LABELS, GroundType } from "../domain/enums.js";

// Formato público de uma quadra (o decimal do Postgres chega como string)
export function toCourtDTO(c: Courts) {
  return {
    id: c.id,
    court_name: c.court_name,
    sport: c.sport,
    price: Number(c.price),
    ground_type: c.ground_type,
    ground_type_label: GROUND_LABELS[c.ground_type as GroundType] ?? c.ground_type,
    cep: c.cep,
    address: c.address,
    address_number: c.address_number,
    neighborhood: c.neighborhood,
    city: c.city,
    state: c.state,
    description: c.description,
    resources: c.resources ?? [],
    landlord_id: (c as any).landlord?.id ?? (c as any).landlord_id,
    created_at: c.created_At,
  };
}

export class CourtService {
  constructor(private dataSource: DataSource) {}

  private get repo() {
    return this.dataSource.getRepository(Courts);
  }

  async list(q: CourtListQuery, userId: string) {
    const where: FindOptionsWhere<Courts> = {};
    if (q.sport) where.sport = q.sport;
    if (q.groundType) where.ground_type = q.groundType;
    if (q.city) where.city = ILike(`%${q.city}%`);
    if (q.state) where.state = q.state;
    if (q.minPrice !== undefined && q.maxPrice !== undefined) where.price = Between(q.minPrice, q.maxPrice);
    else if (q.minPrice !== undefined) where.price = MoreThanOrEqual(q.minPrice);
    else if (q.maxPrice !== undefined) where.price = LessThanOrEqual(q.maxPrice);
    if (q.owner === "me") where.landlord = { id: userId };

    const [rows, total] = await this.repo.findAndCount({
      where,
      relations: { landlord: true },
      order: { [SORT_FIELDS[q.sort]]: q.order },
      skip: (q.page - 1) * q.limit,
      take: q.limit,
    });

    return {
      data: rows.map(toCourtDTO),
      pagination: { page: q.page, limit: q.limit, total, totalPages: Math.ceil(total / q.limit) },
    };
  }

  async findById(id: string) {
    const court = await this.repo.findOne({ where: { id }, relations: { landlord: true } });
    if (!court) throw notFound(`A quadra ${id} não existe.`);
    return court;
  }

  async get(id: string) {
    return toCourtDTO(await this.findById(id));
  }

  async create(data: CourtInput, landlordId: string) {
    const saved = await this.repo.save(this.repo.create({ ...data, landlord: { id: landlordId } }));
    return this.get(saved.id);
  }

  // Só o dono da quadra pode alterá-la ou removê-la
  private async findOwned(id: string, userId: string) {
    const court = await this.findById(id);
    if (court.landlord?.id !== userId) throw forbidden("Só o proprietário pode alterar esta quadra.");
    return court;
  }

  // PUT (substitui tudo) e PATCH (só os campos enviados) usam o mesmo método;
  // a diferença está na validação, que no PUT exige todos os campos.
  async update(id: string, data: Partial<CourtInput>, userId: string) {
    const court = await this.findOwned(id, userId);
    this.repo.merge(court, data);
    await this.repo.save(court);
    return this.get(id);
  }

  // Regra de negócio: não remove quadra com reservas futuras (409)
  async remove(id: string, userId: string) {
    await this.findOwned(id, userId);
    const futuras = await this.dataSource.getRepository(Appointments).count({
      where: { court_id: id, start_time: MoreThan(new Date()) },
    });
    if (futuras > 0) {
      throw conflict(
        "quadra-com-reservas",
        "Quadra com reservas futuras",
        `A quadra tem ${futuras} reserva(s) futura(s). Cancele-as antes de removê-la.`,
      );
    }
    await this.repo.delete(id);
  }
}
