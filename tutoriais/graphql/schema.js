// Schema GraphQL do SportSpot (Parte 3).
export const typeDefs = /* GraphQL */ `
  "Modalidades aceitas pelas quadras"
  enum Esporte {
    FUTEBOL
    FUTSAL
    BASQUETE
    VOLEI
    TENIS
    BEACH_TENNIS
  }

  "Tipo de piso da quadra"
  enum TipoPiso {
    GRAMA_NATURAL
    GRAMA_SINTETICA
    PARQUET
    CIMENTO
    AREIA
  }

  "Recursos de infraestrutura"
  enum Recurso {
    COBERTURA
    ILUMINACAO
    VESTIARIO
  }

  enum StatusAgendamento {
    CONFIRMADO
    CANCELADO
  }

  type Endereco {
    cep: String!
    logradouro: String!
    numero: String!
    bairro: String!
    cidade: String!
    uf: String!
  }

  "Dono (locador) de uma ou mais quadras"
  type Proprietario {
    id: ID!
    nome: String!
    empresa: String
    email: String!
    telefone: String
    quadras: [Quadra!]!
  }

  "Quem reserva as quadras"
  type Atleta {
    id: ID!
    nome: String!
    email: String!
    telefone: String
    agendamentos(status: StatusAgendamento): [Agendamento!]!
  }

  type Quadra {
    id: ID!
    nome: String!
    esporte: Esporte!
    piso: TipoPiso!
    precoHora: Float!
    endereco: Endereco!
    descricao: String
    recursos: [Recurso!]!
    horarioAbertura: String!
    horarioFechamento: String!
    proprietario: Proprietario
    "Reservas da quadra; data no formato AAAA-MM-DD"
    agendamentos(data: String, status: StatusAgendamento): [Agendamento!]!
  }

  type Agendamento {
    id: ID!
    inicio: String!
    fim: String!
    duracaoMinutos: Int!
    valorTotal: Float!
    status: StatusAgendamento!
    criadoEm: String!
    motivoCancelamento: String
    quadra: Quadra
    atleta: Atleta
  }

  type PaginaDeQuadras {
    itens: [Quadra!]!
    total: Int!
    pagina: Int!
    totalPaginas: Int!
  }

  "Filtros da busca de quadras (todos opcionais)"
  input FiltroQuadras {
    esporte: Esporte
    piso: TipoPiso
    recurso: Recurso
    cidade: String
    precoMax: Float
    busca: String
  }

  input NovoAgendamentoInput {
    quadraId: ID!
    atletaId: ID!
    "Data e hora com fuso, ex.: 2026-11-20T19:00:00-03:00"
    inicio: String!
    duracaoMinutos: Int!
  }

  type Query {
    "Busca de quadras com filtro, ordenação (ex.: -precoHora) e paginação"
    quadras(filtro: FiltroQuadras, ordenar: String, pagina: Int = 1, tamanho: Int = 10): PaginaDeQuadras!
    quadra(id: ID!): Quadra
    agendamento(id: ID!): Agendamento
    atleta(id: ID!): Atleta
    proprietario(id: ID!): Proprietario
  }

  type Mutation {
    "Reserva uma quadra (aplica todas as regras de negócio da API REST)"
    agendarQuadra(input: NovoAgendamentoInput!): Agendamento!
    "Cancela uma reserva (até 2 horas antes do início)"
    cancelarAgendamento(id: ID!, motivo: String): Agendamento!
  }
`;
