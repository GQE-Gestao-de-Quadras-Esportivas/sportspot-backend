import { cabecalhosRequisicao, cabecalhosResposta, servicos } from "../config.js";
import { chamarServico, FalhaServico } from "./chamar-servico.js";
import { enviarProblema } from "./problema.js";

// Cria o handler que encaminha /<prefixo>/... para <serviço><caminhoInterno>/...
export function criarProxy({ prefixo, servico, caminhoInterno }) {
  const urlServico = servicos[servico].url;
  const base = caminhoInterno === "/" ? "" : caminhoInterno;

  return async (req, res) => {
    // ---- reescrita de caminho: /api/rest/courts?x=1 → /v1/api/courts?x=1 ----
    // (dentro de app.use(prefixo), req.url já vem sem o prefixo)
    const destino = (base + req.url).replace(/^\/?\?/, "/?") || "/";
    res.locals.destino = `${servicos[servico].nome}${destino.split("?")[0]}`;

    // ---- cabeçalhos: só os da lista de permissão, mais os do gateway ----
    const headers = {};
    for (const nome of cabecalhosRequisicao) {
      const valor = req.get(nome);
      if (valor) headers[nome] = valor;
    }
    headers["x-request-id"] = req.requestId;
    headers["x-cliente-id"] = req.cliente.id; // o serviço sabe qual aplicativo chamou
    headers["x-forwarded-for"] = req.ip;

    const temCorpo = !["GET", "HEAD"].includes(req.method) && Buffer.isBuffer(req.body) && req.body.length > 0;

    try {
      const resposta = await chamarServico(servico, destino, {
        method: req.method,
        headers,
        body: temCorpo ? req.body : undefined,
      });

      res.status(resposta.status);
      for (const nome of cabecalhosResposta) {
        if (nome === "set-cookie") {
          const cookies = resposta.headers.getSetCookie();
          if (cookies.length) res.setHeader("set-cookie", cookies);
          continue;
        }
        const valor = resposta.headers.get(nome);
        if (valor) res.setHeader(nome, valor);
      }

      // ---- Location reescrito: /v1/api/courts/1 → /api/rest/courts/1 ----
      const location = resposta.headers.get("location");
      if (location) {
        const caminho = location.startsWith(urlServico) ? location.slice(urlServico.length) : location;
        if (base && caminho.startsWith(base)) res.setHeader("location", prefixo + caminho.slice(base.length));
      }

      let corpo = Buffer.from(await resposta.arrayBuffer());

      // Problem Details do serviço: o "instance" também traz o caminho público, não o interno
      if (base && (resposta.headers.get("content-type") ?? "").includes("problem+json") && corpo.length) {
        try {
          const problema = JSON.parse(corpo.toString("utf8"));
          if (typeof problema.instance === "string" && problema.instance.startsWith(base)) {
            problema.instance = prefixo + problema.instance.slice(base.length);
            corpo = Buffer.from(JSON.stringify(problema));
          }
        } catch {
          // corpo não é JSON válido: repassa como veio
        }
      }
      return corpo.length ? res.send(corpo) : res.end();
    } catch (erro) {
      if (erro instanceof FalhaServico) {
        if (erro.retryAfter) res.setHeader("Retry-After", erro.retryAfter);
        return enviarProblema(req, res, erro.status, erro.tipo, erro.titulo, erro.detalhe);
      }
      throw erro;
    }
  };
}
