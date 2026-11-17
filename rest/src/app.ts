import "reflect-metadata";
import express, { Application } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { routes } from "./routes/index.js";
import { config } from "./config.js";
import { requestId } from "./middlewares/request-id.js";
import { errorHandler, notFoundHandler } from "./middlewares/problem-details.js";

class App {
  public app: Application;

  constructor() {
    this.app = express();
    this.middlewares();
    this.routes();
    this.errorHandlers();
  }

  private middlewares(): void {
    this.app.use(requestId); // primeiro: todo log e todo erro já têm o X-Request-Id
    this.app.use(
      cors({
        origin: config.corsOrigin,
        credentials: true,
        methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization", "X-Request-Id"],
        exposedHeaders: ["Location", "X-Request-Id", "X-Total-Count"],
      }),
    );
    this.app.use(cookieParser());
    this.app.use(express.json());
  }

  private routes(): void {
    this.app.get("/health", (_req, res) => {
      res.json({ status: "ok" });
    });
    // Rota lenta, só para demonstrar o timeout (504) do gateway. Não existe em produção.
    if (process.env.NODE_ENV !== "production") {
      this.app.get(`${config.basePath}/diagnostico/lento`, async (req, res) => {
        const ms = Math.min(Number(req.query.ms) || 5000, 30000);
        await new Promise((r) => setTimeout(r, ms));
        res.json({ esperou: ms });
      });
    }
    this.app.use(config.basePath, routes);
  }

  private errorHandlers(): void {
    this.app.use(notFoundHandler); // rota inexistente → 404 em Problem Details
    this.app.use(errorHandler); // qualquer erro → Problem Details
  }
}

export default new App().app;
