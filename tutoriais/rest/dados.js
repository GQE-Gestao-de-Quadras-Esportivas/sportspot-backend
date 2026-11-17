// Armazenamento em memória da API REST + tabela de saída (outbox) de eventos.
//
// Padrão Outbox: a gravação do dado e o registro do evento acontecem na mesma
// operação síncrona (no Node.js, uma função síncrona não é interrompida por
// outra requisição, então as duas escritas são atômicas entre si). Um processo
// separado (publicador.js) lê a outbox e publica no RabbitMQ. Assim, se o
// broker estiver fora do ar, o agendamento é gravado e o evento não se perde:
// fica pendente até ser publicado.
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { dataDaquiA, instanteLocal } from './tempo.js';

export function criarBanco({ semente = true } = {}) {
  const banco = {
    proprietarios: new Map(),
    atletas: new Map(),
    quadras: new Map(),
    agendamentos: new Map(),
    outbox: [],
    contadores: { quadra: 0, agendamento: 0 },
    eventos: new EventEmitter(),
  };

  banco.novoIdQuadra = () => `q${++banco.contadores.quadra}`;
  banco.novoIdAgendamento = () => `ag${String(++banco.contadores.agendamento).padStart(4, '0')}`;

  /** Registra um evento de negócio na outbox (chamado junto com a gravação). */
  banco.registrarEvento = (tipo, dados, requestId) => {
    const evento = {
      eventId: randomUUID(),
      tipo,
      versao: 1,
      ocorridoEm: new Date().toISOString(),
      requestId,
      dados,
    };
    banco.outbox.push({ evento, publicadoEm: null, tentativas: 0 });
    banco.eventos.emit('novo-evento', evento);
    return evento;
  };

  banco.outboxPendentes = () => banco.outbox.filter((e) => !e.publicadoEm);
  banco.marcarPublicado = (eventId) => {
    const item = banco.outbox.find((e) => e.evento.eventId === eventId);
    if (item) item.publicadoEm = new Date().toISOString();
  };

  if (semente) popular(banco);
  return banco;
}

// ---------------------------------------------------------------------------
// Dados fictícios de demonstração (nomes, e-mails e telefones inventados).
// Os agendamentos são criados para "amanhã", para que a demonstração sempre
// tenha horários no futuro, qualquer que seja o dia em que for executada.
// ---------------------------------------------------------------------------
function popular(banco) {
  const agora = new Date().toISOString();

  const proprietarios = [
    { id: 'p1', nome: 'Carla Menezes', empresa: 'Arena Santa Angelina', email: 'carla.menezes@arena-exemplo.test', telefone: '(16) 99000-0001' },
    { id: 'p2', nome: 'Rafael Toledo', empresa: 'Complexo Vila Xavier', email: 'rafael.toledo@complexo-exemplo.test', telefone: '(16) 99000-0002' },
  ];
  for (const p of proprietarios) banco.proprietarios.set(p.id, { ...p, criadoEm: agora });

  const atletas = [
    { id: 'a1', nome: 'Ana Beatriz Souza', email: 'ana.souza@email-exemplo.test', telefone: '(16) 98100-0001' },
    { id: 'a2', nome: 'Bruno Carvalho', email: 'bruno.carvalho@email-exemplo.test', telefone: '(16) 98100-0002' },
    { id: 'a3', nome: 'Juliana Prado', email: 'juliana.prado@email-exemplo.test', telefone: '(16) 98100-0003' },
    // E-mail digitado errado no cadastro: usado para demonstrar a DLQ (Cena 4).
    { id: 'a4', nome: 'Lucas Ferreira', email: 'lucas.ferreira#email-exemplo.test', telefone: '(16) 98100-0004' },
  ];
  for (const a of atletas) banco.atletas.set(a.id, { ...a, criadoEm: agora });

  const endereco = (logradouro, numero, bairro) => ({ cep: '14800-000', logradouro, numero, bairro, cidade: 'Araraquara', uf: 'SP' });
  const quadras = [
    {
      nome: 'Society 01 - Arena Santa Angelina', esporte: 'futebol', piso: 'grama_sintetica', precoHora: 180,
      endereco: endereco('Avenida Exemplo', '325', 'Santa Angelina'), descricao: 'Society 7x7 com coletes disponíveis.',
      recursos: ['iluminacao', 'vestiario'], horarioAbertura: '07:00', horarioFechamento: '23:00', proprietarioId: 'p1',
    },
    {
      nome: 'Quadra Coberta Poliesportiva', esporte: 'futsal', piso: 'parquet', precoHora: 150,
      endereco: endereco('Avenida Exemplo', '325', 'Santa Angelina'), descricao: 'Piso de madeira, arquibancada pequena.',
      recursos: ['cobertura', 'iluminacao', 'vestiario'], horarioAbertura: '07:00', horarioFechamento: '23:00', proprietarioId: 'p1',
    },
    {
      nome: 'Areia 01 - Beach Tennis', esporte: 'beach_tennis', piso: 'areia', precoHora: 90,
      endereco: endereco('Avenida Exemplo', '325', 'Santa Angelina'), descricao: 'O complexo fecha às 20:00, mas esta quadra não tem iluminação.',
      recursos: [], horarioAbertura: '07:00', horarioFechamento: '20:00', proprietarioId: 'p1',
    },
    {
      nome: 'Quadra de Basquete Vila Xavier', esporte: 'basquete', piso: 'cimento', precoHora: 80,
      endereco: endereco('Rua Modelo', '1200', 'Vila Xavier'), descricao: 'Tabelas oficiais.',
      recursos: ['iluminacao'], horarioAbertura: '08:00', horarioFechamento: '22:00', proprietarioId: 'p2',
    },
    {
      nome: 'Campo Gramado Vila Xavier', esporte: 'futebol', piso: 'grama_natural', precoHora: 250,
      endereco: endereco('Rua Modelo', '1200', 'Vila Xavier'), descricao: 'Campo 11x11.',
      recursos: ['vestiario'], horarioAbertura: '08:00', horarioFechamento: '18:00', proprietarioId: 'p2',
    },
  ];
  for (const q of quadras) {
    const id = banco.novoIdQuadra();
    banco.quadras.set(id, { id, ...q, criadaEm: agora, atualizadaEm: agora });
  }

  const amanha = dataDaquiA(1);
  const reservas = [
    ['q1', 'a1', '19:00', 90],
    ['q1', 'a2', '20:30', 90],
    ['q2', 'a3', '18:00', 60],
    ['q2', 'a1', '21:00', 120],
    ['q3', 'a2', '08:00', 90],
    ['q4', 'a3', '19:30', 60],
  ];
  for (const [quadraId, atletaId, hora, duracaoMinutos] of reservas) {
    const quadra = banco.quadras.get(quadraId);
    const inicio = instanteLocal(amanha, hora);
    const id = banco.novoIdAgendamento();
    banco.agendamentos.set(id, {
      id, quadraId, atletaId, inicio, fim: inicio + duracaoMinutos * 60_000, duracaoMinutos,
      valorTotal: (quadra.precoHora * duracaoMinutos) / 60, status: 'CONFIRMADO',
      criadoEm: agora, canceladoEm: null, motivoCancelamento: null,
    });
  }
}
