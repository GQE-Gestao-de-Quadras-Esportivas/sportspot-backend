import app from "./app.js";
import { AppDataSource } from "./data-source.js";
import { config } from "./config.js";

async function startServer() {
  try {
    await AppDataSource.initialize();
    console.log("📦 Banco de dados conectado com sucesso!");

    // Escuta só em 127.0.0.1: de fora, a API só é alcançada através do gateway
    app.listen(config.port, config.host, () => {
      console.log(`🚀 API REST em http://${config.host}:${config.port}${config.basePath}`);
    });
  } catch (error) {
    console.error("❌ Falha ao iniciar o servidor:", error);
    process.exit(1);
  }
}

startServer();
