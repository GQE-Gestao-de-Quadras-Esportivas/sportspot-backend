import { Entity, Column, PrimaryColumn, OneToOne, JoinColumn } from "typeorm";
import { AuthUsers } from "./AuthUsers.js";

@Entity("users_details")
export class UserDetails {
  @PrimaryColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 254, nullable: false })
  name!: string;

  @Column({ type: "varchar", length: 254, nullable: false, unique: true })
  document!: string;

  @Column({
    type: "varchar",
    length: 20,
    unique: true,
    nullable: false,
  })
  phone_number!: string;

  @Column({
    type: "date",
    nullable: false,
  })
  date_of_birth!: Date;

  @OneToOne(() => AuthUsers, (user) => user.details, { onDelete: "CASCADE" })
  @JoinColumn({ name: "id" })
  user!: AuthUsers;
}
