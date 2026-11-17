import "reflect-metadata";
import { DataSource } from "typeorm";
import { config } from "./config.js";

export const AppDataSource = new DataSource({
  type: "postgres",
  url: config.dbUrl,
  synchronize: true, // cria/atualiza as tabelas a partir das entidades (aceitável em protótipo)
  logging: process.env.DB_LOGGING === "true", // SQL no console só quando pedido
  entities: ["src/entities/**/*.ts"],
  migrations: ["src/database/migrations/**/*.ts"],
  // Bancos hospedados (Render) exigem SSL; o Postgres local não
  ssl: config.dbSsl ? { rejectUnauthorized: false } : false,
});
