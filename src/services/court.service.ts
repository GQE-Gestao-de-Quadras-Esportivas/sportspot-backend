import { DataSource } from "typeorm";
import { Courts } from "../entities/Courts.js";

export interface CreateCourtDTO {
  court_name: string;
  sport: string;
  price: number;
  ground_type: string;
  cep: string;
  address: string;
  address_number: string;
  neighborhood: string;
  city: string;
  state: string;
  descricao: string;
  resources: string[];
  landlord_id: string;
}

export class CourtService {
  constructor(private dataSource: DataSource) {}

  async listCourts(userID: string) {
    try {
      const courts = await this.dataSource.manager.find(Courts, {
        where: { landlord: { id: userID } },
      });

      return courts;
    } catch (err) {
      throw new Error("Erro ao listar as quadras do usuário.");
    }
  }

  async registerCourt(data: CreateCourtDTO) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      const newCourt = await queryRunner.manager.create(Courts, {
        court_name: data.court_name,
        sport: data.sport,
        price: data.price,
        ground_type: data.ground_type,
        cep: data.cep,
        address: data.address,
        address_number: data.address_number,
        neighborhood: data.neighborhood,
        city: data.city,
        state: data.state,
        description: data.descricao,
        resources: data.resources,
        landlord: { id: data.landlord_id },
      });
      const savedCourt = await queryRunner.manager.save(Courts, newCourt);

      return { id: savedCourt.id };
    } catch (error: any) {
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
