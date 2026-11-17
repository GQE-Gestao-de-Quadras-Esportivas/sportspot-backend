import { GraphQLError } from "graphql";

// Enums: o nome no GraphQL → o valor que a API REST usa
const enums = {
  Esporte: { FUTEBOL: "futebol", BASQUETE: "basquete", VOLEI: "volei", TENIS: "tennis" },
  TipoPiso: {
    GRAMA_NATURAL: "grama_natural",
    GRAMA_SINTETICA: "grama_sintetica",
    PARQUET: "parquet",
    CIMENTO: "cimento",
    AREIA: "areia",
  },
  Recurso: { COBERTURA: "cobertura", ILUMINACAO: "iluminacao", VESTIARIO: "vestiario" },
  PapelReserva: { CLIENTE: "customer", PROPRIETARIO: "landlord" },
  StatusReserva: { CONFIRMADA: "confirmada", CANCELADA: "cancelada" },
  OrdemQuadras: {
    RECENTES: "createdAt:desc",
    MENOR_PRECO: "price:asc",
    MAIOR_PRECO: "price:desc",
    NOME: "name:asc",
  },
};

// Converte o formato da API REST (snake_case) para o do schema
const quadraDaApi = (c) => ({
  id: c.id,
  nome: c.court_name,
  esporte: c.sport,
  precoPorHora: c.price,
  piso: c.ground_type,
  pisoDescricao: c.ground_type_label,
  descricao: c.description,
  recursos: c.resources ?? [],
  endereco: {
    cep: c.cep,
    logradouro: c.address,
    numero: c.address_number,
    bairro: c.neighborhood,
    cidade: c.city,
    estado: c.state,
  },
});

const reservaDaApi = (a) => ({
  id: a.id,
  quadraId: a.court_id,
  inicio: a.start_time,
  fim: a.end_time,
  preco: a.price,
  status: a.status,
  criadaEm: a.created_at,
});

const lista = (q) => new URLSearchParams(Object.entries(q).filter(([, v]) => v !== undefined && v !== null)).toString();

export const resolvers = {
  ...enums,

  Query: {
    async quadras(_, { filtro = {}, ordenarPor, pagina, limite }, { rest }) {
      const [sort, order] = ordenarPor.split(":");
      const resposta = await rest.get(
        "/courts?" +
          lista({
            sport: filtro.esporte,
            groundType: filtro.piso,
            city: filtro.cidade,
            state: filtro.estado,
            minPrice: filtro.precoMinimo,
            maxPrice: filtro.precoMaximo,
            owner: filtro.apenasMinhas ? "me" : undefined,
            sort,
            order,
            page: pagina,
            limit: limite,
          }),
      );
      return {
        itens: resposta.data.map(quadraDaApi),
        total: resposta.pagination.total,
        pagina: resposta.pagination.page,
        totalPaginas: resposta.pagination.totalPages,
      };
    },

    async quadra(_, { id }, { loaders }) {
      return loaders.quadra.load(id); // null se não existir
    },

    async eu(_, __, { rest }) {
      const u = await rest.get("/users/me");
      return { id: u.id, nome: u.name, email: u.email, tipo: u.user_type };
    },

    async minhasReservas(_, { papel }, { rest }) {
      return (await rest.get(`/appointments?role=${papel}`)).map(reservaDaApi);
    },
  },

  Usuario: {
    // Aninhamento nível 1: eu → quadras
    async quadras(_, __, { rest }) {
      const resposta = await rest.get("/courts?owner=me&limit=50");
      return resposta.data.map(quadraDaApi);
    },
    async reservasFeitas(_, __, { rest }) {
      return (await rest.get("/appointments?role=customer")).map(reservaDaApi);
    },
  },

  Quadra: {
    // Aninhamento nível 2: eu → quadras → reservas
    async reservas(quadra, { apenasFuturas }, { rest }) {
      const todas = (await rest.get(`/courts/${quadra.id}/appointments`)).map(reservaDaApi);
      if (!apenasFuturas) return todas;
      const agora = Date.now();
      return todas.filter((r) => r.status === "confirmada" && new Date(r.inicio).getTime() >= agora);
    },
  },

  Reserva: {
    // Sem DataLoader, 10 reservas = 10 chamadas GET /courts/:id (o problema N+1).
    // Com DataLoader, os ids pedidos na mesma rodada viram UMA chamada GET /courts?ids=a,b,c
    async quadra(reserva, _, { loaders }) {
      const q = await loaders.quadra.load(reserva.quadraId);
      if (!q) throw new GraphQLError(`A quadra ${reserva.quadraId} não existe mais.`, { extensions: { code: "NOT_FOUND" } });
      return q;
    },
  },

  Mutation: {
    async criarReserva(_, { input }, { rest }) {
      const criada = await rest.chamar("POST", `/courts/${encodeURIComponent(input.quadraId)}/appointments`, {
        start_time: input.inicio,
        end_time: input.fim,
      });
      return reservaDaApi(criada);
    },
    async cancelarReserva(_, { id }, { rest }) {
      await rest.chamar("DELETE", `/appointments/${encodeURIComponent(id)}`);
      return true;
    },
  },
};

export { quadraDaApi };
