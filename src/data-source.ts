import { configDotenv } from "dotenv";
import "reflect-metadata";
import { DataSource } from "typeorm";

configDotenv();

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DB_URL,
  synchronize: true,
  logging: true,
  entities: ["src/entities/**/*.ts"],
  migrations: ["src/database/migrations/**/*.ts"],
  ssl: {
    rejectUnauthorized: false, // OBRIGATÓRIO PARA O RENDER: Permite conexão SSL segura sem certificados locais
  },
});
