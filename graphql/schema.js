// Schema do SportSpot. Os nomes estão em português e escondem os detalhes da API REST
// (snake_case, preço em texto, etc.): o cliente pede exatamente os campos da tela.

export const typeDefs = /* GraphQL */ `
  "Modalidades aceitas nas quadras"
  enum Esporte {
    FUTEBOL
    BASQUETE
    VOLEI
    TENIS
  }

  "Tipo de piso da quadra"
  enum TipoPiso {
    GRAMA_NATURAL
    GRAMA_SINTETICA
    PARQUET
    CIMENTO
    AREIA
  }

  enum Recurso {
    COBERTURA
    ILUMINACAO
    VESTIARIO
  }

  "Ponto de vista das reservas: as que eu fiz ou as feitas nas minhas quadras"
  enum PapelReserva {
    CLIENTE
    PROPRIETARIO
  }

  enum StatusReserva {
    CONFIRMADA
    CANCELADA
  }

  enum OrdemQuadras {
    RECENTES
    MENOR_PRECO
    MAIOR_PRECO
    NOME
  }

  type Endereco {
    cep: String!
    logradouro: String!
    numero: String!
    bairro: String!
    cidade: String!
    estado: String!
  }

  type Quadra {
    id: ID!
    nome: String!
    esporte: Esporte!
    precoPorHora: Float!
    piso: TipoPiso!
    pisoDescricao: String!
    descricao: String
    recursos: [Recurso!]!
    endereco: Endereco!
    "Reservas desta quadra, em ordem de horário (apenasFuturas também omite as canceladas)"
    reservas(apenasFuturas: Boolean = false): [Reserva!]!
  }

  type Reserva {
    id: ID!
    inicio: String!
    fim: String!
    "Preço total: preço por hora × duração"
    preco: Float
    "Reservas canceladas continuam no histórico (não há exclusão física)"
    status: StatusReserva!
    criadaEm: String!
    "A quadra reservada (resolvida em lote pelo DataLoader)"
    quadra: Quadra!
  }

  type Usuario {
    id: ID!
    nome: String!
    email: String!
    tipo: String!
    "Quadras das quais o usuário é proprietário"
    quadras: [Quadra!]!
    "Reservas que o usuário fez como jogador"
    reservasFeitas: [Reserva!]!
  }

  type PaginaQuadras {
    itens: [Quadra!]!
    total: Int!
    pagina: Int!
    totalPaginas: Int!
  }

  input FiltroQuadras {
    esporte: Esporte
    piso: TipoPiso
    cidade: String
    estado: String
    precoMinimo: Float
    precoMaximo: Float
    apenasMinhas: Boolean
  }

  input NovaReservaInput {
    quadraId: ID!
    "Data e hora ISO 8601, ex.: 2026-12-01T19:00:00-03:00"
    inicio: String!
    fim: String!
  }

  type Query {
    "Busca de quadras com filtros, ordenação e paginação (máximo 50 por página)"
    quadras(filtro: FiltroQuadras, ordenarPor: OrdemQuadras = RECENTES, pagina: Int = 1, limite: Int = 10): PaginaQuadras!
    "Uma quadra pelo id (null se não existir)"
    quadra(id: ID!): Quadra
    "O usuário logado. É a raiz da tela do painel: eu → quadras → reservas"
    eu: Usuario!
    minhasReservas(papel: PapelReserva = CLIENTE): [Reserva!]!
  }

  type Mutation {
    "Reserva um horário. Erros: HORARIO_OCUPADO, AGENDAMENTO_NO_PASSADO, INTERVALO_INVALIDO, DURACAO_INVALIDA..."
    criarReserva(input: NovaReservaInput!): Reserva!
    "Cancela uma reserva (com 24 h de antecedência). Erro: CANCELAMENTO_FORA_DO_PRAZO"
    cancelarReserva(id: ID!): Boolean!
  }
`;
