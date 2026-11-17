// API Gateway do SportSpot (Parte 4): o ÚNICO ponto de entrada público.
//
// Ordem do processamento de cada requisição:
//   1. gera o X-Request-Id e registra o log de acesso
//   2. autentica (X-API-Key ou Authorization: Bearer <JWT>)            -> 401
//   3. aplica o limite de uso do plano do cliente                       -> 429 + Retry-After
//   4. autoriza a rota para aquele cliente                              -> 403
//   5. roteia com reescrita de caminho e cabeçalhos por lista de permissão:
//        /api/graphql            -> GraphQL  /
//        /api/painel/quadras/:id -> rota agregada (REST + GraphQL)
//        /api/<recurso>/...      -> API REST /<recurso>/...
//   6. resiliência: timeout (504), serviço fora do ar (502), disjuntor (503),
//      nova tentativa com espera crescente para GET
// Todos os erros do gateway saem em Problem Details (RFC 9457).
import express from 'express';
import jwt from 'jsonwebtoken';
import { randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import { enviarProblema } from '../shared/problema.js';
import { config as configPadrao } from '../shared/config.js';
import { Disjuntor } from './disjuntor.js';
import { CLIENTES, CLIENTES_POR_ID, USUARIOS } from './clientes.js';

// Cabeçalhos que o gateway repassa (o resto é descartado)
const CABECALHOS_REQUISICAO = ['accept', 'accept-language', 'content-type'];
const CABECALHOS_RESPOSTA = ['content-type', 'location', 'x-total-count', 'retry-after', 'cache-control'];
const RECURSOS_REST = /^\/(quadras|agendamentos|atletas|proprietarios|diagnostico)(\/|$)/;

class ErroGateway extends Error {
  constructor(status, tipo, titulo, detalhe, cabecalhos = {}, extensoes = {}) {
    super(detalhe);
    Object.assign(this, { status, tipo, titulo, cabecalhos, extensoes });
  }
}

const QUERY_PAINEL = /* GraphQL */ `
  query PainelQuadra($id: ID!, $data: String!) {
    quadra(id: $id) {
      agendamentos(data: $data, status: CONFIRMADO) {
        id inicio fim duracaoMinutos valorTotal
        atleta { id nome telefone }
      }
    }
  }`;

export function criarGateway({ config = configPadrao, logger }) {
  const cfg = config.gateway;
  const servicos = {
    rest: { nome: 'api-rest', url: config.rest.url },
    graphql: { nome: 'graphql', url: config.graphql.url },
  };
  const disjuntores = {
    rest: new Disjuntor('api-rest', cfg.disjuntor, logger),
    graphql: new Disjuntor('graphql', cfg.disjuntor, logger),
  };
  const janelas = new Map(); // limite de uso: clienteId -> { inicio, contagem }

  const app = express();
  app.disable('x-powered-by');
  app.set('etag', false);

  // 1. X-Request-Id gerado aqui e log de acesso -------------------------------
  app.use((req, res, next) => {
    req.requestId = randomUUID();
    res.setHeader('X-Request-Id', req.requestId);
    const inicio = performance.now();
    res.on('finish', () => {
      const ms = Math.round(performance.now() - inicio);
      const destino = res.locals.destino ? ` => ${res.locals.destino}` : '';
      logger.info(`${req.method} ${req.originalUrl}${destino} -> ${res.statusCode} (${ms} ms)`, {
        requestId: req.requestId,
        cliente: req.cliente?.id,
        usuario: req.usuario?.id,
      });
    });
    next();
  });

  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      servico: 'gateway',
      disjuntores: { 'api-rest': disjuntores.rest.resumo(), graphql: disjuntores.graphql.resumo() },
    });
  });

  // O corpo é repassado como veio (bytes), sem reinterpretar
  app.use(express.raw({ type: () => true, limit: '1mb' }));

  // Variante com JWT: troca e-mail/senha (fictícios) por um token de 15 min
  app.post('/api/auth/token', (req, res) => {
    let corpo;
    try {
      corpo = JSON.parse(req.body?.length ? req.body.toString('utf8') : '{}');
    } catch {
      throw new ErroGateway(400, 'json-malformado', 'JSON malformado', 'Envie {"email": "...", "senha": "..."}.');
    }
    const usuario = USUARIOS.find((u) => u.email === corpo.email);
    const hash = createHash('sha256').update(String(corpo.senha ?? '')).digest();
    if (!usuario || !timingSafeEqual(hash, Buffer.from(usuario.senhaSha256, 'hex'))) {
      throw new ErroGateway(401, 'credenciais-invalidas', 'Credenciais inválidas', 'E-mail ou senha incorretos.');
    }
    const token = jwt.sign({ papel: usuario.papel, cliente: usuario.cliente }, cfg.jwtSegredo, {
      subject: usuario.id, expiresIn: '15m', issuer: 'sportspot-gateway', algorithm: 'HS256',
    });
    res.json({ access_token: token, token_type: 'Bearer', expires_in: 900 });
  });

  // 2. Autenticação --------------------------------------------------------------
  app.use('/api', (req, _res, next) => {
    const chave = req.get('x-api-key');
    const autorizacao = req.get('authorization');
    const desafio = { 'WWW-Authenticate': 'ApiKey header="X-API-Key", Bearer realm="sportspot"' };
    if (chave) {
      const cliente = CLIENTES[chave];
      if (!cliente) throw new ErroGateway(401, 'chave-invalida', 'Chave de API inválida', 'A chave enviada em X-API-Key não pertence a nenhum cliente.', desafio);
      req.cliente = cliente;
      return next();
    }
    if (autorizacao?.startsWith('Bearer ')) {
      try {
        const p = jwt.verify(autorizacao.slice(7), cfg.jwtSegredo, { algorithms: ['HS256'], issuer: 'sportspot-gateway' });
        req.cliente = CLIENTES_POR_ID[p.cliente];
        req.usuario = { id: p.sub, papel: p.papel };
        if (!req.cliente) throw new Error('cliente desconhecido');
        return next();
      } catch (e) {
        throw new ErroGateway(401, 'token-invalido', 'Token inválido', `O token JWT é inválido ou expirou (${e.message}).`, desafio);
      }
    }
    throw new ErroGateway(401, 'credencial-ausente', 'Autenticação necessária', 'Envie a chave de API no cabeçalho X-API-Key (ou um token Bearer).', desafio);
  });

  // 3. Limite de uso por cliente (janela fixa) ----------------------------------
  app.use('/api', (req, res, next) => {
    const { id, limitePorMinuto } = req.cliente;
    const agora = Date.now();
    let janela = janelas.get(id);
    if (!janela || agora - janela.inicio >= cfg.janelaLimiteMs) janela = { inicio: agora, contagem: 0 };
    janela.contagem++;
    janelas.set(id, janela);
    const resetS = Math.max(1, Math.ceil((janela.inicio + cfg.janelaLimiteMs - agora) / 1000));
    res.setHeader('RateLimit-Limit', String(limitePorMinuto));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, limitePorMinuto - janela.contagem)));
    res.setHeader('RateLimit-Reset', String(resetS));
    if (janela.contagem > limitePorMinuto) {
      throw new ErroGateway(429, 'limite-excedido', 'Limite de uso excedido',
        `O plano do cliente "${id}" permite ${limitePorMinuto} requisições por minuto. Tente de novo em ${resetS} s.`,
        { 'Retry-After': String(resetS) }, { limitePorMinuto });
    }
    next();
  });

  // 4. Autorização por rota --------------------------------------------------------
  app.use('/api', (req, _res, next) => {
    const caminho = req.originalUrl.split('?')[0];
    const ok = req.cliente.permissoes.some((p) => (p.metodos.includes('*') || p.metodos.includes(req.method)) && p.caminho.test(caminho));
    if (!ok) throw new ErroGateway(403, 'acesso-negado', 'Acesso negado', `O cliente "${req.cliente.id}" não tem permissão para ${req.method} ${caminho}.`);
    next();
  });

  // 5a. Rota agregada: painel da quadra (REST + GraphQL, com degradação graciosa)
  app.get('/api/painel/quadras/:id', async (req, res) => {
    const data = req.query.data ?? hojeLocal(config.fusoMinutos);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new ErroGateway(400, 'parametro-invalido', 'Parâmetro inválido', 'data deve estar no formato AAAA-MM-DD.');
    const id = req.params.id;
    const cabecalhos = cabecalhosInternos(req);
    res.locals.destino = 'agregada(api-rest + graphql)';

    const [rQuadra, rAgenda] = await Promise.allSettled([
      chamarServico('rest', { metodo: 'GET', caminho: `/quadras/${encodeURIComponent(id)}`, cabecalhos }, req.requestId),
      chamarServico('graphql', {
        metodo: 'POST', caminho: '/',
        cabecalhos: { ...cabecalhos, 'content-type': 'application/json' },
        corpo: Buffer.from(JSON.stringify({ query: QUERY_PAINEL, variables: { id, data } })),
      }, req.requestId),
    ]);

    const fontes = {};
    const avisos = [];
    let quadra = null;
    if (rQuadra.status === 'fulfilled' && rQuadra.value.status === 404) {
      res.status(404).type('application/problem+json').send(rQuadra.value.corpo);
      return;
    }
    if (rQuadra.status === 'fulfilled' && rQuadra.value.status === 200) {
      quadra = JSON.parse(rQuadra.value.corpo.toString('utf8'));
      fontes['api-rest'] = 'ok';
    } else {
      fontes['api-rest'] = 'indisponivel';
      avisos.push(`Dados da quadra indisponíveis: ${motivo(rQuadra)}`);
    }

    let reservas = null;
    if (rAgenda.status === 'fulfilled' && rAgenda.value.status === 200) {
      const json = JSON.parse(rAgenda.value.corpo.toString('utf8'));
      if (json.errors?.length || !json.data?.quadra) {
        fontes.graphql = 'erro';
        avisos.push(`Agenda indisponível: ${json.errors?.[0]?.message ?? 'quadra não encontrada'}`);
      } else {
        reservas = json.data.quadra.agendamentos;
        fontes.graphql = 'ok';
      }
    } else {
      fontes.graphql = 'indisponivel';
      avisos.push(`Agenda indisponível: ${motivo(rAgenda)}`);
    }

    if (!quadra && !reservas) {
      throw new ErroGateway(503, 'painel-indisponivel', 'Painel indisponível', 'Nenhuma das fontes do painel respondeu.', { 'Retry-After': '5' }, { fontes, avisos });
    }

    const agendaDoDia = reservas && {
      data,
      reservas,
      totalReservas: reservas.length,
      receitaPrevista: reservas.reduce((s, r) => s + r.valorTotal, 0),
      minutosReservados: reservas.reduce((s, r) => s + r.duracaoMinutos, 0),
      ocupacaoPercentual: quadra ? ocupacao(quadra, reservas) : null,
    };
    const parcial = Object.values(fontes).some((f) => f !== 'ok');
    res.json({ quadra, agendaDoDia, parcial, fontes, avisos });
  });

  // 5b. GraphQL: /api/graphql -> / --------------------------------------------------
  app.use('/api/graphql', (req, res) => encaminhar('graphql', req, res, req.url === '/' ? '/' : req.url));

  // 5c. API REST: /api/<recurso>... -> /<recurso>... ----------------------------------
  app.use('/api', (req, res, next) => {
    if (!RECURSOS_REST.test(req.path)) return next();
    return encaminhar('rest', req, res, req.url);
  });

  app.use((req) => {
    throw new ErroGateway(404, 'rota-inexistente', 'Rota inexistente', `O gateway não tem rota para ${req.method} ${req.path}.`);
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    let e = err;
    if (err?.type === 'entity.too.large') e = new ErroGateway(413, 'corpo-muito-grande', 'Corpo muito grande', 'O corpo passa de 1 MB.');
    else if (!(err instanceof ErroGateway)) {
      logger.erro('erro inesperado no gateway', { requestId: req.requestId, erro: err?.stack ?? String(err) });
      e = new ErroGateway(500, 'erro-interno', 'Erro interno do gateway', 'Erro inesperado. Informe o requestId ao suporte.');
    }
    enviarProblema(res, {
      status: e.status, tipo: e.tipo, titulo: e.titulo, detalhe: e.message, instancia: req.originalUrl,
      requestId: req.requestId, cabecalhos: e.cabecalhos, extensoes: e.extensoes,
    });
  });

  // --- Encaminhamento ---------------------------------------------------------
  function cabecalhosInternos(req) {
    const h = {};
    for (const nome of CABECALHOS_REQUISICAO) {
      const v = req.get(nome);
      if (v) h[nome] = v;
    }
    h['x-request-id'] = req.requestId;
    h['x-cliente-id'] = req.cliente.id;
    if (req.usuario) {
      h['x-usuario-id'] = req.usuario.id;
      h['x-usuario-papel'] = req.usuario.papel;
    }
    return h;
  }

  async function encaminhar(chave, req, res, caminhoInterno) {
    res.locals.destino = `${servicos[chave].nome} ${req.method} ${caminhoInterno}`;
    const corpo = Buffer.isBuffer(req.body) && req.body.length && !['GET', 'HEAD'].includes(req.method) ? req.body : undefined;
    const r = await chamarServico(chave, { metodo: req.method, caminho: caminhoInterno, cabecalhos: cabecalhosInternos(req), corpo }, req.requestId);
    res.status(r.status);
    for (const nome of CABECALHOS_RESPOSTA) {
      const v = r.headers.get(nome);
      if (!v) continue;
      // Location reescrito: /quadras/q6 -> /api/quadras/q6
      res.setHeader(nome, nome === 'location' && chave === 'rest' && v.startsWith('/') ? `/api${v}` : v);
    }
    res.send(r.corpo);
  }

  async function chamarServico(chave, { metodo, caminho, cabecalhos, corpo }, requestId) {
    const servico = servicos[chave];
    const disjuntor = disjuntores[chave];
    const liberado = disjuntor.podeChamar();
    if (!liberado.permitido) {
      throw new ErroGateway(503, 'circuito-aberto', 'Serviço temporariamente indisponível',
        `O disjuntor do serviço "${servico.nome}" está aberto depois de falhas seguidas; o gateway não vai chamá-lo por ${liberado.retryAfterS} s.`,
        { 'Retry-After': String(liberado.retryAfterS) }, { servico: servico.nome });
    }
    const maxTentativas = ['GET', 'HEAD'].includes(metodo) ? 1 + cfg.novasTentativas : 1;
    for (let tentativa = 1; ; tentativa++) {
      try {
        const r = await fetch(servico.url + caminho, {
          method: metodo, headers: cabecalhos, body: corpo, redirect: 'manual',
          signal: AbortSignal.timeout(cfg.timeoutMs),
        });
        const conteudo = Buffer.from(await r.arrayBuffer());
        if (r.status >= 500) disjuntor.falha();
        else disjuntor.sucesso();
        return { status: r.status, headers: r.headers, corpo: conteudo };
      } catch (e) {
        const esgotou = e.name === 'TimeoutError' || e.name === 'AbortError';
        const codigo = e.cause?.code ?? e.code ?? e.name;
        if (!esgotou && tentativa < maxTentativas) {
          const espera = 100 * 2 ** (tentativa - 1); // 100 ms, 200 ms, ...
          logger.warn(`falha ao chamar ${servico.nome} (${codigo}); nova tentativa ${tentativa + 1}/${maxTentativas} em ${espera} ms`, { requestId });
          await new Promise((r) => setTimeout(r, espera));
          continue;
        }
        disjuntor.falha();
        if (esgotou) {
          throw new ErroGateway(504, 'tempo-esgotado', 'Tempo de resposta esgotado',
            `O serviço "${servico.nome}" não respondeu em ${cfg.timeoutMs} ms.`, {}, { servico: servico.nome });
        }
        throw new ErroGateway(502, 'servico-fora-do-ar', 'Serviço fora do ar',
          `Não foi possível conectar ao serviço "${servico.nome}" (${codigo}).`, {}, { servico: servico.nome });
      }
    }
  }

  return app;
}

function motivo(resultado) {
  if (resultado.status === 'rejected') return `${resultado.reason.status ?? ''} ${resultado.reason.message}`.trim();
  return `HTTP ${resultado.value.status}`;
}

function hojeLocal(fusoMinutos) {
  return new Date(Date.now() + fusoMinutos * 60_000).toISOString().slice(0, 10);
}

function ocupacao(quadra, reservas) {
  const [ah, am] = quadra.horarioAbertura.split(':').map(Number);
  const [fh, fm] = quadra.horarioFechamento.split(':').map(Number);
  const aberto = fh * 60 + fm - (ah * 60 + am);
  const reservado = reservas.reduce((s, r) => s + r.duracaoMinutos, 0);
  return Math.round((reservado / aberto) * 1000) / 10;
}
