import "reflect-metadata";
import express, { Application, ErrorRequestHandler } from "express";
import cors from "cors";
import { routes } from "./routes/index.js";


class App {
  public app: Application;

  constructor() {
    this.app = express();
    this.middlewares();
    this.routes();
    this.errorHandler();
  }

  private middlewares(): void {
    this.app.use(cors());
    this.app.use(express.json());
  }

  private routes(): void {
    this.app.use('/v1/api', routes);
  }

  private errorHandler(): void {
    const errorHandlerMiddleware: ErrorRequestHandler = (
      err,
      req,
      res,
      next,
    ) => {
      console.error(err.stack);

      res.status(500).json({
        status: "error",
        message: err.message || "Internal Server Error",
      });
    };
    
    this.app.use(errorHandlerMiddleware);
  }
}

export default new App().app;
