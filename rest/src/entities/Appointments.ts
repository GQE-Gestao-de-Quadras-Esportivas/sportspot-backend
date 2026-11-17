import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { Courts } from "./Courts.js";
import { UserDetails } from "./UserDetails.js";

@Entity("appointments")
export class Appointments {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  // Preço total da reserva = preço/hora da quadra × duração (calculado pela API)
  @Column("decimal", { precision: 10, scale: 2, nullable: true })
  price!: number;

  @Column({ name: "start_time", type: "timestamp", nullable: false })
  start_time!: Date;

  @Column({ name: "end_time", type: "timestamp", nullable: false })
  end_time!: Date;

  @Column({ name: "court_id", type: "uuid" })
  court_id!: string;

  @ManyToOne(() => Courts, (court) => court.appointments, { onDelete: "CASCADE" })
  @JoinColumn({ name: "court_id" })
  court!: Courts;

  // Quem fez a reserva (novo; nullable para não quebrar registros antigos)
  @Column({ name: "customer_id", type: "uuid", nullable: true })
  customer_id!: string | null;

  @ManyToOne(() => UserDetails, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "customer_id" })
  customer!: UserDetails | null;

  // Cancelamento lógico: reservas nunca são apagadas do banco
  // (restrição do caderno EARS: proibido hard delete de reserva cancelada/finalizada)
  @Column({ type: "varchar", length: 16, default: "confirmada" })
  status!: "confirmada" | "cancelada";

  @Column({ name: "cancelled_at", type: "timestamp", nullable: true })
  cancelled_at!: Date | null;

  @CreateDateColumn({ name: "created_at", type: "timestamp" })
  created_At!: Date;
}
