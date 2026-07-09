import app from "./app.js";
import { AppDataSource } from "./data-source.js";


const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    await AppDataSource.initialize();
    console.log("📦 Banco de dados conectado com sucesso!");

    app.listen(PORT, () => {
      console.log(`🚀 Servidor rodando em: http://localhost:${PORT}`);
      console.log(`🔒 Rota de teste: http://localhost:${PORT}/api/auth`);
      console.log(`&& Rota de quadras: http://localhost:${PORT}/api/courts`);
    });
  } catch (error) {
    console.error("❌ Falha ao iniciar o servidor:", error);
    process.exit(1); // Fecha a aplicação com código de erro se o banco falhar
  }
}

startServer();
