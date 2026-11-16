// Clientes (atores) do SportSpot, com planos de uso diferentes.
// TODAS as chaves e senhas abaixo são FICTÍCIAS, apenas para demonstração.

const GRAPHQL = { metodos: ['GET', 'POST'], caminho: /^\/api\/graphql\/?$/ };
const LER_CATALOGO = { metodos: ['GET'], caminho: /^\/api\/(quadras|proprietarios)(\/.*)?$/ };

export const CLIENTES = {
  'chave-app-atleta-123': {
    id: 'app-atleta',
    descricao: 'Aplicativo do atleta (celular): busca quadras e faz reservas',
    limitePorMinuto: 10,
    permissoes: [
      LER_CATALOGO,
      { metodos: ['GET'], caminho: /^\/api\/(agendamentos|atletas)(\/.*)?$/ },
      { metodos: ['POST'], caminho: /^\/api\/agendamentos(\/[\w-]+\/cancelamento)?$/ },
      GRAPHQL,
    ],
  },
  'chave-painel-proprietario-456': {
    id: 'painel-proprietario',
    descricao: 'Painel web do proprietário: gerencia quadras e acompanha a agenda',
    limitePorMinuto: 60,
    permissoes: [{ metodos: ['*'], caminho: /^\/api\/.*$/ }],
  },
  'chave-parceiro-789': {
    id: 'parceiro-marketplace',
    descricao: 'Parceiro externo que só consulta o catálogo de quadras',
    limitePorMinuto: 30,
    permissoes: [LER_CATALOGO],
  },
};

export const CLIENTES_POR_ID = Object.fromEntries(Object.values(CLIENTES).map((c) => [c.id, c]));

// Usuários fictícios para a variante com JWT (POST /api/auth/token).
// As senhas ficam só como hash SHA-256 (as senhas de teste estão no README).
export const USUARIOS = [
  {
    email: 'ana.souza@email-exemplo.test',
    senhaSha256: 'f9fdb0c5bca5596325e6238588ad667996b8590fa5239f4e2b540e09d4445c12', // senha-demo-atleta
    id: 'a1',
    papel: 'atleta',
    cliente: 'app-atleta',
  },
  {
    email: 'carla.menezes@arena-exemplo.test',
    senhaSha256: '1f2c45d31c597abe9027fe67c7fb15023b78e0ae6851c28179036676c4fe6182', // senha-demo-proprietario
    id: 'p1',
    papel: 'proprietario',
    cliente: 'painel-proprietario',
  },
];
