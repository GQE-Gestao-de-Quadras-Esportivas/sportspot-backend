import { Column, CreateDateColumn, Entity, ForeignKey, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { UserDetails } from "./UserDetails.js";

@Entity("courts")
export class Courts {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 255, nullable: false })
  court_name!: string;

  @Column({ type: "text", nullable: false })
  address!: string;

  @Column("decimal", { precision: 10, scale: 2, nullable: false })
  price!: number;

  @ManyToOne(() => UserDetails, (user) => user.courts, { onDelete: "CASCADE" })
  @JoinColumn({ name: "landlord_id" })
  landlord!: UserDetails
  
  @CreateDateColumn({ name: "created_at", type: "timestamp" })
  created_At!: Date;
}
