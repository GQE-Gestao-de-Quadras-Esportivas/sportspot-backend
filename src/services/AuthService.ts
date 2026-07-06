import { DataSource } from "typeorm";
import { AuthUsers } from "../entities/AuthUsers.js";
import bcrypt from "bcrypt";
import { UserDetails } from "../entities/UserDetails.js";

export interface LoginUserDTO {
  email: string;
  password: string;
}

export interface CreateUserDTO {
  name: string;
  document: string;
  date_of_birth: string;
  phone_number: string;
  email: string;
  password_plain: string;
}

export class AuthService {
  constructor(private dataSource: DataSource) {}

  async loginUser(data: LoginUserDTO) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      const userData = await queryRunner.manager.findOne(AuthUsers, {
        where: { email: data.email },
      });
      if (!userData) throw new Error("USER_DONT_EXISTS");

      const isMatchPassword = bcrypt.compare(
        data.password,
        userData.password_hash,
      );
      if (!isMatchPassword) throw new Error("WRONG_PASSWORD");

      return {
        id: userData.id,
        email: userData.email,
        user_type: userData.user_type,
      };
    } catch (error) {
      throw error;
    }
  }

  async registerUser(data: CreateUserDTO) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const existingUser = await queryRunner.manager.findOne(AuthUsers, {
        where: { email: data.email },
      });
      if (existingUser) {
        throw new Error("EMAIL_ALREADY_EXISTS");
      }

      const passwordHash = await bcrypt.hash(data.password_plain, 10);

      const newAuthUser = queryRunner.manager.create(AuthUsers, {
        email: data.email,
        password_hash: passwordHash,
      });
      const savedAuthUser = await queryRunner.manager.save(
        AuthUsers,
        newAuthUser,
      );

      const newUserDetail = queryRunner.manager.create(UserDetails, {
        id: savedAuthUser.id,
        document: data.document,
        phone_number: data.phone_number,
        date_of_birth: new Date(data.date_of_birth),
      });
      await queryRunner.manager.save(UserDetails, newUserDetail);
      await queryRunner.commitTransaction();

      return { id: savedAuthUser.id, email: savedAuthUser.email };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
