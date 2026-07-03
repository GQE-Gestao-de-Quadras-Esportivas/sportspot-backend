import { Entity, PrimaryGeneratedColumn, Column } from "typeorm"

@Entity()
export class User {

    @PrimaryGeneratedColumn({ type: 'uuid', nullable: false })
    id!: string;

    @Column({ type: "varchar", length: 254, nullable: false })
    email!: string;

    @Column({ type: "varchar", length: 254, nullable: false })
    password_hash!: string;

    @Column({ type: "varchar", length: 12, nullable: false })
    user_type!: string;

}
