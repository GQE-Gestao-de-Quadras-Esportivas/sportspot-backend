import { DataSource, In } from "typeorm";
import { Courts } from "../entities/Courts.js";
import { Appointments } from "../entities/Appointments.js";

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

export interface CreateAppointmentDTO {
  court_id: string;
  start_time: string;
  end_time: string;
}

export class CourtService {
  constructor(private dataSource: DataSource) {}

  async listCourts(userID: string) {
    try {
      const courts = await this.dataSource.manager.find(Courts, {
        where: { landlord: { id: userID } },
      });

      const groundTextMap: Record<string, string> = {
        grama_natural: "Grama natural",
        grama_sintetica: "Grama sintética",
        parquet: "Madeira / Parquet",
        cimento: "Cimento polido",
        areia: "Areia",
      };

      const modifiedCourts = courts.map(({ ground_type, ...rest }) => ({
        ...rest,
        ground_type: groundTextMap[ground_type], // Substitua pelo valor desejado
      }));

      return modifiedCourts;
    } catch (err) {
      throw new Error("Erro ao listar as quadras do usuário.");
    }
  }

  async listAppointments(userID: string) {
    try {
      const courts = await this.dataSource.manager.find(Courts, {
        where: { landlord: { id: userID } },
      });
      if (!courts || courts.length === 0) return [];

      const courtIds = courts.map((court) => court.id);
      const appointments = await this.dataSource.manager.find(Appointments, {
        where: {
          court_id: In(courtIds),
        },
      });

      return { courts, appointments };
    } catch (err) {
      console.error(err);
      throw new Error("Erro ao listar os agendamentos.");
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

  async createAppointment(data: CreateAppointmentDTO) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      const newAppointment = await queryRunner.manager.create(Appointments, {
        start_time: data.start_time,
        end_time: data.end_time,
        court: { id: data.court_id},
      });
      const savedAppointment = await queryRunner.manager.save(
        Appointments,
        newAppointment,
      );

      return { id: savedAppointment.id };
    } catch (error: any) {
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
