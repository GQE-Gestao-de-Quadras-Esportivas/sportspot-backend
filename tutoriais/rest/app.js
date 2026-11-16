// API REST do SportSpot (Parte 1).
// Recursos: /proprietarios, /atletas, /quadras (CRUD completo) e /agendamentos.
// A aplicação é criada por uma função para poder ser testada com node --test.
import express from 'express';
import { randomUUID } from 'node:crypto';
import { Problema, enviarProblema } from '../shared/problema.js';
import { criarLogger } from '../shared/logger.js';
import { config } from '../shared/config.js';
import {
  ESPORTES, PISOS, RECURSOS, STATUS_AGENDAMENTO,
  validarQuadra, normalizarEndereco, verificarRegrasDaQuadra,
  validarNovoAgendamento, verificarRegrasDoAgendamento, verificarCancelamento,
} from './dominio.js';
import { paraIsoLocal, dataLocal, RE_DATA } from './tempo.js';

const TAMANHO_PADRAO = 10;
const TAMANHO_MAXIMO = 50; // teto da página

export function criarApp({ banco, logger = criarLogger('rest') }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('etag', false);

  // --- X-Request-Id: recebido do gateway (ou gerado, se a chamada for direta)
  app.use((req, res, next) => {
    const recebido = req.get('x-request-id');
    req.requestId = recebido && /^[\w.-]{1,100}$/.test(recebido) ? recebido : randomUUID();
    res.setHeader('X-Request-Id', req.requestId);
    const inicio = performance.now();
    res.on('finish', () => {
      logger.info(`${req.method} ${req.originalUrl} -> ${res.statusCode} (${Math.round(performance.now() - inicio)} ms)`, {
        requestId: req.requestId,
        cliente: req.get('x-cliente-id'),
      });
    });
    next();
  });

  // --- Corpo JSON: Content-Type obrigatório quando há corpo (415) -------------
  app.use((req, res, next) => {
    const temCorpo = Number(req.get('content-length') ?? 0) > 0 || req.get('transfer-encoding');
    if (['POST', 'PUT', 'PATCH'].includes(req.method) && temCorpo && !req.is('application/json')) {
      return next(new Problema(415, 'tipo-de-midia', 'Tipo de mídia não suportado', 'Envie o corpo como JSON, com o cabeçalho Content-Type: application/json.'));
    }
    next();
  });
  app.use(express.json({ limit: '100kb' }));

  // Corpo obrigatório e precisa ser um objeto JSON
  const exigirCorpo = (req, _res, next) => {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return next(new Problema(400, 'corpo-invalido', 'Corpo da requisição inválido', 'O corpo deve ser um objeto JSON.'));
    }
    next();
  };

  // Quem chama: o gateway repassa o cliente (X-Cliente-Id) e, quando o acesso é
  // por JWT, o usuário (X-Usuario-Id / X-Usuario-Papel). O serviço confere o
  // dono do dado mesmo com o gateway autenticando (defesa em profundidade).
  const usuario = (req) => ({ id: req.get('x-usuario-id'), papel: req.get('x-usuario-papel') });

  // --- Saúde e diagnóstico ----------------------------------------------------
  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      servico: 'api-rest',
      quadras: banco.quadras.size,
      agendamentos: banco.agendamentos.size,
      outboxPendentes: banco.outboxPendentes().length,
    });
  });

  if (config.simulacoes) {
    // Usada só na demonstração para provocar o 504 (timeout) no gateway.
    app.get('/diagnostico/lento', async (req, res) => {
      const ms = Math.min(Number(req.query.ms) || 5000, 15000);
      await new Promise((r) => setTimeout(r, ms));
      res.json({ mensagem: `respondi depois de ${ms} ms` });
    });
  }

  // --- Proprietários e atletas (leitura) ---------------------------------------
  app.get('/proprietarios', (req, res) => {
    const lista = filtrarPorIds([...banco.proprietarios.values()], req.query.ids);
    res.json(paginar(req, res, lista, '/proprietarios'));
  });
  app.get('/proprietarios/:id', (req, res) => res.json(buscar(banco.proprietarios, req.params.id, 'Proprietário')));

  app.get('/atletas', (req, res) => {
    const lista = filtrarPorIds([...banco.atletas.values()], req.query.ids);
    res.json(paginar(req, res, lista, '/atletas'));
  });
  app.get('/atletas/:id', (req, res) => res.json(buscar(banco.atletas, req.params.id, 'Atleta')));

  // --- Quadras: CRUD completo ---------------------------------------------------
  app.get('/quadras', (req, res) => {
    const q = req.query;
    validarEnumConsulta('esporte', q.esporte, ESPORTES);
    validarEnumConsulta('piso', q.piso, PISOS);
    validarEnumConsulta('recurso', q.recurso, RECURSOS);
    const precoMax = numeroConsulta('precoMax', q.precoMax);
    const precoMin = numeroConsulta('precoMin', q.precoMin);

    let lista = filtrarPorIds([...banco.quadras.values()], q.ids);
    if (q.esporte) lista = lista.filter((x) => x.esporte === q.esporte);
    if (q.piso) lista = lista.filter((x) => x.piso === q.piso);
    if (q.recurso) lista = lista.filter((x) => x.recursos.includes(q.recurso));
    if (q.proprietarioId) lista = lista.filter((x) => x.proprietarioId === q.proprietarioId);
    if (q.cidade) lista = lista.filter((x) => normalizar(x.endereco.cidade) === normalizar(q.cidade));
    if (q.uf) lista = lista.filter((x) => x.endereco.uf === String(q.uf).toUpperCase());
    if (q.busca) lista = lista.filter((x) => normalizar(x.nome).includes(normalizar(q.busca)));
    if (precoMax !== undefined) lista = lista.filter((x) => x.precoHora <= precoMax);
    if (precoMin !== undefined) lista = lista.filter((x) => x.precoHora >= precoMin);

    lista = ordenar(lista, q.ordenar, { nome: (x) => x.nome, precoHora: (x) => x.precoHora, criadaEm: (x) => x.criadaEm, cidade: (x) => x.endereco.cidade }, 'nome');
    res.json(paginar(req, res, lista, '/quadras'));
  });

  app.get('/quadras/:id', (req, res) => res.json(buscar(banco.quadras, req.params.id, 'Quadra')));

  app.post('/quadras', exigirCorpo, (req, res) => {
    validarQuadra(req.body, 'completo');
    const b = req.body;
    if (!banco.proprietarios.has(b.proprietarioId)) {
      throw new Problema(422, 'validacao', 'Dados inválidos', 'O proprietário informado não existe.', {
        errors: [{ campo: 'proprietarioId', mensagem: 'proprietário inexistente' }],
      });
    }
    conferirDono(usuario(req), b.proprietarioId);
    const agora = new Date().toISOString();
    const quadra = {
      id: null, nome: b.nome.trim(), esporte: b.esporte, piso: b.piso, precoHora: b.precoHora,
      endereco: normalizarEndereco(b.endereco), descricao: b.descricao?.trim() ?? '', recursos: b.recursos ?? [],
      horarioAbertura: b.horarioAbertura ?? '07:00', horarioFechamento: b.horarioFechamento ?? '23:00',
      proprietarioId: b.proprietarioId, criadaEm: agora, atualizadaEm: agora,
    };
    verificarRegrasDaQuadra(quadra);
    quadra.id = banco.novoIdQuadra();
    banco.quadras.set(quadra.id, quadra);
    banco.registrarEvento('quadra.cadastrada', { quadra }, req.requestId);
    res.status(201).location(`/quadras/${quadra.id}`).json(quadra);
  });

  app.put('/quadras/:id', exigirCorpo, (req, res) => {
    const atual = buscar(banco.quadras, req.params.id, 'Quadra');
    conferirDono(usuario(req), atual.proprietarioId);
    validarQuadra(req.body, 'completo');
    const b = req.body;
    if (b.proprietarioId !== atual.proprietarioId) {
      throw new Problema(422, 'validacao', 'Dados inválidos', 'Não é possível transferir a quadra para outro proprietário.', {
        errors: [{ campo: 'proprietarioId', mensagem: 'deve ser igual ao atual' }],
      });
    }
    const nova = {
      ...atual, nome: b.nome.trim(), esporte: b.esporte, piso: b.piso, precoHora: b.precoHora,
      endereco: normalizarEndereco(b.endereco), descricao: b.descricao?.trim() ?? '', recursos: b.recursos ?? [],
      horarioAbertura: b.horarioAbertura ?? '07:00', horarioFechamento: b.horarioFechamento ?? '23:00',
      atualizadaEm: new Date().toISOString(),
    };
    verificarRegrasDaQuadra(nova);
    banco.quadras.set(nova.id, nova);
    banco.registrarEvento('quadra.atualizada', { quadra: nova, campos: Object.keys(b) }, req.requestId);
    res.json(nova);
  });

  app.patch('/quadras/:id', exigirCorpo, (req, res) => {
    const atual = buscar(banco.quadras, req.params.id, 'Quadra');
    conferirDono(usuario(req), atual.proprietarioId);
    validarQuadra(req.body, 'parcial');
    const b = req.body;
    const nova = { ...atual, ...b, atualizadaEm: new Date().toISOString() };
    if (b.nome) nova.nome = b.nome.trim();
    if (b.endereco) nova.endereco = normalizarEndereco(b.endereco);
    verificarRegrasDaQuadra(nova);
    banco.quadras.set(nova.id, nova);
    banco.registrarEvento('quadra.atualizada', { quadra: nova, campos: Object.keys(b) }, req.requestId);
    res.json(nova);
  });

  app.delete('/quadras/:id', (req, res) => {
    const quadra = buscar(banco.quadras, req.params.id, 'Quadra');
    conferirDono(usuario(req), quadra.proprietarioId);
    // RN08: quadra com reservas futuras confirmadas não pode ser removida
    const futuras = [...banco.agendamentos.values()].filter((a) => a.quadraId === quadra.id && a.status === 'CONFIRMADO' && a.fim > Date.now());
    if (futuras.length) {
      throw new Problema(409, 'quadra-com-reservas', 'Quadra com reservas futuras',
        `A quadra "${quadra.nome}" tem ${futuras.length} reserva(s) futura(s) confirmada(s). Cancele-as antes de remover a quadra.`,
        { regra: 'RN08', reservas: futuras.map((a) => a.id) });
    }
    banco.quadras.delete(quadra.id);
    banco.registrarEvento('quadra.removida', { quadraId: quadra.id, nome: quadra.nome, proprietarioId: quadra.proprietarioId }, req.requestId);
    res.status(204).end();
  });

  // --- Agendamentos -------------------------------------------------------------
  const listarAgendamentos = (req, res, filtroQuadra) => {
    const q = req.query;
    validarEnumConsulta('status', q.status, STATUS_AGENDAMENTO);
    if (q.data !== undefined && !RE_DATA.test(q.data)) throw new Problema(400, 'parametro-invalido', 'Parâmetro de consulta inválido', 'data deve estar no formato AAAA-MM-DD.');
    let lista = [...banco.agendamentos.values()];
    const quadras = filtroQuadra ? [filtroQuadra] : q.quadraId ? String(q.quadraId).split(',') : null;
    if (quadras) lista = lista.filter((a) => quadras.includes(a.quadraId));
    if (q.atletaId) lista = lista.filter((a) => a.atletaId === q.atletaId);
    if (q.status) lista = lista.filter((a) => a.status === q.status);
    if (q.data) lista = lista.filter((a) => dataLocal(a.inicio) === q.data);
    lista = ordenar(lista, q.ordenar, { inicio: (a) => a.inicio, valorTotal: (a) => a.valorTotal, criadoEm: (a) => a.criadoEm }, 'inicio');
    const pagina = paginar(req, res, lista, req.path);
    pagina.dados = pagina.dados.map(agendamentoJson);
    res.json(pagina);
  };

  app.get('/agendamentos', (req, res) => listarAgendamentos(req, res));
  app.get('/quadras/:id/agendamentos', (req, res) => {
    buscar(banco.quadras, req.params.id, 'Quadra');
    listarAgendamentos(req, res, req.params.id);
  });
  app.get('/agendamentos/:id', (req, res) => res.json(agendamentoJson(buscar(banco.agendamentos, req.params.id, 'Agendamento'))));

  app.post('/agendamentos', exigirCorpo, (req, res) => {
    validarNovoAgendamento(req.body);
    const { quadraId, atletaId, inicio: inicioIso, duracaoMinutos } = req.body;
    const quadra = banco.quadras.get(quadraId);
    const atleta = banco.atletas.get(atletaId);
    const errosRef = [];
    if (!quadra) errosRef.push({ campo: 'quadraId', mensagem: 'quadra inexistente' });
    if (!atleta) errosRef.push({ campo: 'atletaId', mensagem: 'atleta inexistente' });
    if (errosRef.length) throw new Problema(422, 'validacao', 'Dados inválidos', 'Quadra ou atleta não encontrados.', { errors: errosRef });

    const u = usuario(req);
    if (u.papel === 'atleta' && u.id !== atletaId) {
      throw new Problema(403, 'acesso-negado', 'Acesso negado', 'Um atleta só pode agendar em seu próprio nome.');
    }

    const daQuadra = [...banco.agendamentos.values()].filter((a) => a.quadraId === quadraId);
    const { inicio, fim } = verificarRegrasDoAgendamento({ quadra, inicioIso, duracaoMinutos, agendamentosDaQuadra: daQuadra });

    // Gravação + evento na outbox, na mesma operação síncrona (padrão Outbox)
    const agendamento = {
      id: banco.novoIdAgendamento(), quadraId, atletaId, inicio, fim, duracaoMinutos,
      valorTotal: Math.round(quadra.precoHora * duracaoMinutos / 60 * 100) / 100,
      status: 'CONFIRMADO', criadoEm: new Date().toISOString(), canceladoEm: null, motivoCancelamento: null,
    };
    banco.agendamentos.set(agendamento.id, agendamento);
    banco.registrarEvento('agendamento.criado', dadosDoEvento(agendamento, quadra, atleta), req.requestId);

    // Responde sem esperar a publicação nem os consumidores
    res.status(201).location(`/agendamentos/${agendamento.id}`).json(agendamentoJson(agendamento));
  });

  app.post('/agendamentos/:id/cancelamento', (req, res) => {
    const agendamento = buscar(banco.agendamentos, req.params.id, 'Agendamento');
    const quadra = banco.quadras.get(agendamento.quadraId);
    const u = usuario(req);
    if ((u.papel === 'atleta' && u.id !== agendamento.atletaId) || (u.papel === 'proprietario' && u.id !== quadra?.proprietarioId)) {
      throw new Problema(403, 'acesso-negado', 'Acesso negado', 'Só o atleta da reserva ou o dono da quadra podem cancelá-la.');
    }
    const motivo = req.body?.motivo;
    if (motivo !== undefined && (typeof motivo !== 'string' || motivo.length > 200)) {
      throw new Problema(422, 'validacao', 'Dados inválidos', 'motivo deve ser texto com até 200 caracteres.', {
        errors: [{ campo: 'motivo', mensagem: 'até 200 caracteres' }],
      });
    }
    verificarCancelamento(agendamento);
    agendamento.status = 'CANCELADO';
    agendamento.canceladoEm = new Date().toISOString();
    agendamento.motivoCancelamento = motivo ?? null;
    banco.registrarEvento('agendamento.cancelado', dadosDoEvento(agendamento, quadra, banco.atletas.get(agendamento.atletaId)), req.requestId);
    res.json(agendamentoJson(agendamento));
  });

  // --- 404 e tratamento central de erros -------------------------------------
  app.use((req) => {
    throw new Problema(404, 'rota-inexistente', 'Recurso não encontrado', `Não existe rota para ${req.method} ${req.path}.`);
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    let p = err;
    if (err?.type === 'entity.parse.failed') {
      p = new Problema(400, 'json-malformado', 'JSON malformado', 'O corpo da requisição não é um JSON válido.');
    } else if (err?.type === 'entity.too.large') {
      p = new Problema(413, 'corpo-muito-grande', 'Corpo muito grande', 'O corpo da requisição passa do limite de 100 kB.');
    } else if (!(err instanceof Problema)) {
      logger.erro('erro inesperado', { requestId: req.requestId, erro: err?.stack ?? String(err) });
      p = new Problema(500, 'erro-interno', 'Erro interno', 'Ocorreu um erro inesperado. Informe o requestId ao suporte.');
    }
    if (p.status >= 400 && p.status < 500) {
      logger.warn(`${p.status} ${p.titulo}: ${p.message}`, { requestId: req.requestId });
    }
    enviarProblema(res, {
      status: p.status, tipo: p.tipo, titulo: p.titulo, detalhe: p.message,
      instancia: req.originalUrl, requestId: req.requestId, extensoes: p.extensoes,
    });
  });

  // --- Auxiliares que dependem do banco -----------------------------------------
  function dadosDoEvento(agendamento, quadra, atleta) {
    return {
      agendamento: agendamentoJson(agendamento),
      quadra: { id: quadra.id, nome: quadra.nome, esporte: quadra.esporte, proprietarioId: quadra.proprietarioId },
      atleta: { id: atleta.id, nome: atleta.nome, email: atleta.email },
    };
  }

  return app;
}

// --- Funções auxiliares ------------------------------------------------------------
export function agendamentoJson(a) {
  return { ...a, inicio: paraIsoLocal(a.inicio), fim: paraIsoLocal(a.fim) };
}

function buscar(mapa, id, rotulo) {
  const item = mapa.get(id);
  const feminino = rotulo === 'Quadra';
  if (!item) throw new Problema(404, 'nao-encontrado', `${rotulo} não encontrad${feminino ? 'a' : 'o'}`, `${rotulo} "${id}" não existe.`);
  return item;
}

function conferirDono(u, proprietarioId) {
  if (u.papel === 'proprietario' && u.id !== proprietarioId) {
    throw new Problema(403, 'acesso-negado', 'Acesso negado', 'A quadra pertence a outro proprietário.');
  }
  if (u.papel === 'atleta') {
    throw new Problema(403, 'acesso-negado', 'Acesso negado', 'Atletas não podem cadastrar nem alterar quadras.');
  }
}

function filtrarPorIds(lista, ids) {
  if (!ids) return lista;
  const conjunto = new Set(String(ids).split(','));
  return lista.filter((x) => conjunto.has(x.id));
}

const normalizar = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

function validarEnumConsulta(nome, valor, valores) {
  if (valor !== undefined && !valores.includes(valor)) {
    throw new Problema(400, 'parametro-invalido', 'Parâmetro de consulta inválido', `${nome} deve ser um de: ${valores.join(', ')}.`);
  }
}

function numeroConsulta(nome, valor) {
  if (valor === undefined) return undefined;
  const n = Number(valor);
  if (valor === '' || !Number.isFinite(n)) throw new Problema(400, 'parametro-invalido', 'Parâmetro de consulta inválido', `${nome} deve ser numérico.`);
  return n;
}

/** ordenar=campo ou -campo (decrescente); vários separados por vírgula. */
function ordenar(lista, parametro, campos, padrao) {
  const criterios = String(parametro ?? padrao).split(',').map((c) => c.trim()).filter(Boolean);
  const regras = criterios.map((c) => {
    const desc = c.startsWith('-');
    const nome = desc ? c.slice(1) : c;
    if (!campos[nome]) {
      throw new Problema(400, 'parametro-invalido', 'Parâmetro de consulta inválido', `ordenar aceita: ${Object.keys(campos).join(', ')} (use "-" para ordem decrescente).`);
    }
    return { pegar: campos[nome], fator: desc ? -1 : 1 };
  });
  return [...lista].sort((a, b) => {
    for (const { pegar, fator } of regras) {
      const va = pegar(a);
      const vb = pegar(b);
      const cmp = typeof va === 'string' ? va.localeCompare(vb, 'pt-BR') : va - vb;
      if (cmp !== 0) return cmp * fator;
    }
    return 0;
  });
}

/** Paginação com teto: pagina>=1, tamanho entre 1 e TAMANHO_MAXIMO. */
function paginar(req, res, lista, caminho) {
  const inteiro = (nome, padrao) => {
    const v = req.query[nome];
    if (v === undefined) return padrao;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1) throw new Problema(400, 'parametro-invalido', 'Parâmetro de consulta inválido', `${nome} deve ser um inteiro maior ou igual a 1.`);
    return n;
  };
  const pagina = inteiro('pagina', 1);
  const tamanho = Math.min(inteiro('tamanho', TAMANHO_PADRAO), TAMANHO_MAXIMO);
  const total = lista.length;
  const totalPaginas = Math.max(1, Math.ceil(total / tamanho));
  res.setHeader('X-Total-Count', String(total));

  const link = (p) => {
    const params = new URLSearchParams(req.query);
    params.set('pagina', String(p));
    params.set('tamanho', String(tamanho));
    return `${caminho}?${params}`;
  };
  return {
    dados: lista.slice((pagina - 1) * tamanho, pagina * tamanho),
    paginacao: { pagina, tamanho, tamanhoMaximo: TAMANHO_MAXIMO, total, totalPaginas },
    links: {
      proxima: pagina < totalPaginas ? link(pagina + 1) : null,
      anterior: pagina > 1 ? link(pagina - 1) : null,
    },
  };
}
