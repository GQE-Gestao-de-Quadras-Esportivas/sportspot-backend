import {
  Column,
  CreateDateColumn,
  Entity,
  ForeignKey,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { Courts } from "./Courts.js";

@Entity("appointments")
export class Appointments {
  @PrimaryGeneratedColumn("uuid")
  id!: string; 

  @Column("decimal", { precision: 10, scale: 2, nullable: true })
  price!: number;

  @Column({ name: "start_time", type: "timestamp", nullable: false })
  start_time!: Date;
  
  @Column({ name: "end_time", type: "timestamp", nullable: false })
  end_time!: Date;

  @ManyToOne(() => Courts, (court) => court.id, { onDelete: "CASCADE" })
  @JoinColumn({ name: "court_id" })
  court_id!: Courts;

  @CreateDateColumn({ name: "created_at", type: "timestamp" })
  created_At!: Date;
}
