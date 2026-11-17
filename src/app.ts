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
    this.app.use(config.basePath, routes);
  }

  private errorHandlers(): void {
    this.app.use(notFoundHandler); // rota inexistente → 404 em Problem Details
    this.app.use(errorHandler); // qualquer erro → Problem Details
  }
}

export default new App().app;
