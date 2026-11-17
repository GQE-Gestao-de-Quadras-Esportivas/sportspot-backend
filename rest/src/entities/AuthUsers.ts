import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
} from "typeorm";
import { UserDetails } from "./UserDetails.js";

export enum UserType {
  ADMIN = "admin",
  OWNER = "landowner",
  CLIENT = "client",
}

@Entity("auth_users")
export class AuthUsers {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 254, nullable: false, unique: true })
  email!: string;

  @Column({ type: "varchar", length: 254, nullable: false })
  password_hash!: string;

  @Column({
    type: "enum",
    enum: UserType,
    default: UserType.OWNER,
    nullable: false,
  })
  user_type!: UserType;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updated_at!: Date;

  @OneToOne(() => UserDetails, (detail) => detail.user)
  details!: UserDetails;
}
