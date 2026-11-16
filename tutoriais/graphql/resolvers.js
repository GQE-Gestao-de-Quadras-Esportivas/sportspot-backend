// Resolvers: cada campo busca os dados na API REST (via DataLoader/RestCliente).
import { GraphQLError } from 'graphql';

// Enums: o valor externo (GraphQL) é mapeado para o valor interno (API REST).
const Esporte = { FUTEBOL: 'futebol', FUTSAL: 'futsal', BASQUETE: 'basquete', VOLEI: 'volei', TENIS: 'tenis', BEACH_TENNIS: 'beach_tennis' };
const TipoPiso = { GRAMA_NATURAL: 'grama_natural', GRAMA_SINTETICA: 'grama_sintetica', PARQUET: 'parquet', CIMENTO: 'cimento', AREIA: 'areia' };
const Recurso = { COBERTURA: 'cobertura', ILUMINACAO: 'iluminacao', VESTIARIO: 'vestiario' };

const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;
const exigirData = (data) => {
  if (data != null && !RE_DATA.test(data)) {
    throw new GraphQLError('data deve estar no formato AAAA-MM-DD', { extensions: { code: 'BAD_USER_INPUT', argumento: 'data' } });
  }
};

export const resolvers = {
  Esporte,
  TipoPiso,
  Recurso,

  Query: {
    quadras: async (_p, { filtro = {}, ordenar, pagina, tamanho }, { rest }) => {
      const params = new URLSearchParams({ pagina: String(pagina), tamanho: String(tamanho) });
      for (const [k, v] of Object.entries(filtro ?? {})) if (v != null) params.set(k, String(v));
      if (ordenar) params.set('ordenar', ordenar);
      const r = await rest.get(`/quadras?${params}`);
      return { itens: r.dados, total: r.paginacao.total, pagina: r.paginacao.pagina, totalPaginas: r.paginacao.totalPaginas };
    },
    quadra: (_p, { id }, { carregadores }) => carregadores.quadra.load(id),
    agendamento: (_p, { id }, { rest, metricas }) => {
      metricas.semGraphQL++;
      return rest.getOuNulo(`/agendamentos/${encodeURIComponent(id)}`);
    },
    atleta: (_p, { id }, { carregadores }) => carregadores.atleta.load(id),
    proprietario: (_p, { id }, { carregadores }) => carregadores.proprietario.load(id),
  },

  Mutation: {
    agendarQuadra: async (_p, { input }, { rest }) => {
      if (input.duracaoMinutos <= 0) {
        throw new GraphQLError('duracaoMinutos deve ser positivo', { extensions: { code: 'BAD_USER_INPUT', argumento: 'input.duracaoMinutos' } });
      }
      if (Number.isNaN(Date.parse(input.inicio))) {
        throw new GraphQLError('inicio deve ser data e hora ISO 8601 com fuso', { extensions: { code: 'BAD_USER_INPUT', argumento: 'input.inicio' } });
      }
      return rest.post('/agendamentos', { ...input });
    },
    cancelarAgendamento: (_p, { id, motivo }, { rest }) =>
      rest.post(`/agendamentos/${encodeURIComponent(id)}/cancelamento`, motivo ? { motivo } : {}),
  },

  Proprietario: {
    quadras: (p, _a, { carregadores }) => carregadores.quadrasDoProprietario.load(p.id),
  },

  Atleta: {
    agendamentos: (a, { status }, { carregadores }) => carregadores.agendamentosDoAtleta.load(JSON.stringify({ atletaId: a.id, status })),
  },

  Quadra: {
    proprietario: (q, _a, { carregadores }) => carregadores.proprietario.load(q.proprietarioId),
    agendamentos: (q, { data, status }, { carregadores }) => {
      exigirData(data);
      return carregadores.agendamentosDaQuadra.load(JSON.stringify({ quadraId: q.id, data, status }));
    },
  },

  Agendamento: {
    quadra: (a, _x, { carregadores }) => carregadores.quadra.load(a.quadraId),
    atleta: (a, _x, { carregadores }) => carregadores.atleta.load(a.atletaId),
  },
};
