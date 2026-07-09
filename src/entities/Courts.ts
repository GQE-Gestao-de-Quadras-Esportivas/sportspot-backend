import { Column, CreateDateColumn, Entity, ForeignKey, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { UserDetails } from "./UserDetails.js";

@Entity("courts")
export class Courts {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 255, nullable: false })
  court_name!: string;

  @Column({ type: "varchar", length: 32, nullable: false })
  sport!: string;

  @Column("decimal", { precision: 10, scale: 2, nullable: false })
  price!: number;
  
  @Column({ type: "varchar", length: 16, nullable: false })
  ground_type!: string;
  
  @Column({ type: "varchar", length: 8, nullable: false })
  cep!: string;

  @Column({ type: "text", nullable: false })
  address!: string;
  
  @Column({ type: "varchar", length: 6, nullable: false })
  address_number!: string;
  
  @Column({ type: "text", nullable: false })
  neighborhood!: string;
  
  @Column({ type: "varchar", length: 255, nullable: false })
  city!: string;
  
  @Column({ type: "varchar", length: 2, nullable: false })
  state!: string;
  
  @Column({ type: "text", nullable: false })
  description!: string;
  
  @Column({ type: "text", array: true, nullable: true })
  resources?: string[];

  @ManyToOne(() => UserDetails, (user) => user.courts, { onDelete: "CASCADE" })
  @JoinColumn({ name: "landlord_id" })
  landlord!: UserDetails
  
  @CreateDateColumn({ name: "created_at", type: "timestamp" })
  created_At!: Date;
}
