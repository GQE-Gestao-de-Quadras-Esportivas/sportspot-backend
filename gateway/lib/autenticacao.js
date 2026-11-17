import { clientes } from "../config.js";
import { enviarProblema } from "./problema.js";

// Identifica QUAL APLICATIVO está chamando, pela chave de API.
// Quem é o USUÁRIO continua sendo verificado pela API REST, com o JWT.
export function autenticarCliente(req, res, next) {
  const chave = req.get("X-API-Key");
  if (!chave) {
    return enviarProblema(req, res, 401, "chave-ausente", "Chave de API ausente",
      "Envie a chave do seu aplicativo no cabeçalho X-API-Key.");
  }
  const cliente = clientes[chave];
  if (!cliente) {
    return enviarProblema(req, res, 401, "chave-invalida", "Chave de API inválida",
      "A chave informada não pertence a nenhum cliente cadastrado.");
  }
  req.cliente = cliente;
  next();
}
