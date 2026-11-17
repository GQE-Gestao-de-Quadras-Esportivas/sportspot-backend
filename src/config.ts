import { configDotenv } from "dotenv";

configDotenv();

// Um único lugar para ler variáveis de ambiente.
// Antes, quem assinava o JWT e quem verificava usavam segredos padrão diferentes.
export const config = {
  host: process.env.HOST || "127.0.0.1", // só aceita conexões locais: o gateway é a porta pública
  port: Number(process.env.PORT || 3000),
  dbUrl: process.env.DB_URL || "postgres://postgres:postgres@127.0.0.1:5432/sportspot",
  dbSsl: process.env.DB_SSL === "true", // true só para bancos hospedados (ex.: Render)
  jwtSecret: process.env.JWT_SECRET || "dev-jwt-secret-troque-em-producao",
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || "dev-refresh-secret-troque-em-producao",
  rabbitUrl: process.env.RABBITMQ_URL || "amqp://guest:guest@localhost:5672",
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:4200",
  basePath: "/v1/api",
};
