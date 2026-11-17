import { DataSource } from "typeorm";
import { AuthUsers } from "../entities/AuthUsers.js";
import bcrypt from "bcrypt";
import { UserDetails } from "../entities/UserDetails.js";
import jwt from "jsonwebtoken";
import { config } from "../config.js";

export interface LoginUserDTO {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    name: string;
    email: string;
    user_type: string;
  };
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

  async loginUser(data: LoginUserDTO): Promise<LoginResponse> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      const userData = await queryRunner.manager.findOne(AuthUsers, {
        where: { email: data.email },
      });
      if (!userData) throw new Error("USER_DONT_EXISTS");

      const isMatchPassword = await bcrypt.compare(
        data.password,
        userData.password_hash,
      );
      if (!isMatchPassword) throw new Error("WRONG_PASSWORD");

      const userDetails = await queryRunner.manager.findOne(UserDetails, {
        where: { id: userData.id }
      })
      if (!userDetails) throw new Error("DATA_CONFLICT");

      const secret = config.jwtSecret;
      const refreshSecret =
        config.jwtRefreshSecret;

      const accessToken = jwt.sign({ name: userDetails.name, role: userData.user_type }, secret, {
        subject: String(userData.id),
        expiresIn: "15m",
      });

      const refreshToken = jwt.sign({
        role: userData.user_type
      }, refreshSecret, {
        subject: String(userData.id),
        expiresIn: "7d",
      });

      return {
        accessToken,
        refreshToken,
        user: {
          id: userData.id,
          name: userDetails.name,
          email: userData.email,
          user_type: userData.user_type,
        },
      };
    } catch (error) {
      throw error;
    } finally {
      await queryRunner.release();
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
        name: data.name,
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

  async refreshSession(refreshToken: string): Promise<{ accessToken: string }> {
    if (!refreshToken) throw new Error("REFRESH_TOKEN_NOT_PROVIDED");

    try {
      const refreshSecret =
        config.jwtRefreshSecret;

      const decoded = jwt.verify(refreshToken, refreshSecret);
      const userId = (decoded as any).sub;
      const userRole = (decoded as any).role;

      const secret = config.jwtSecret;
      const accessToken = jwt.sign({ role: userRole }, secret, {
        subject: String(userId),
        expiresIn: "15m",
      });

      return { accessToken };
    } catch (error) {
      throw new Error("INVALID_REFRESH_TOKEN");
    }
  }
}
