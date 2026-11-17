// Consumidor 2: FATURAMENTO E OCUPAÇÃO
// Mantém, por quadra e por dia, a receita prevista e os minutos reservados
// (o resumo financeiro do painel do proprietário). Liga-se apenas às chaves
// agendamento.criado e agendamento.cancelado.
// É o consumidor em que a idempotência mais aparece: se o mesmo evento
// chegasse duas vezes e fosse processado duas vezes, a receita dobraria.
// O estado fica em mensageria/dados/faturamento.json.
import { iniciarConsumidor } from './consumidor-base.js';
import { ehPrincipal } from '../shared/principal.js';

const brl = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

async function processar(evento, { estado, logger, requestId }) {
  const { agendamento, quadra } = evento.dados;
  const dia = agendamento.inicio.slice(0, 10);
  const chave = `${quadra.id}|${dia}`;
  const sinal = evento.tipo === 'agendamento.criado' ? 1 : -1;

  const atual = estado.porQuadraDia[chave] ?? { quadraId: quadra.id, quadra: quadra.nome, dia, reservas: 0, minutos: 0, receitaPrevista: 0 };
  const novo = {
    ...atual,
    reservas: atual.reservas + sinal,
    minutos: atual.minutos + sinal * agendamento.duracaoMinutos,
    receitaPrevista: Math.round((atual.receitaPrevista + sinal * agendamento.valorTotal) * 100) / 100,
  };
  estado.porQuadraDia[chave] = novo; // só altera o estado depois de calcular tudo
  logger.info(
    `${quadra.nome} em ${dia}: ${novo.reservas} reserva(s), ${novo.minutos} min, receita prevista ${brl(novo.receitaPrevista)} (${sinal > 0 ? '+' : '-'}${brl(agendamento.valorTotal)})`,
    { requestId },
  );
}

export const consumidorFaturamento = () =>
  iniciarConsumidor({
    nome: 'faturamento',
    ligacoes: ['agendamento.criado', 'agendamento.cancelado'],
    processar,
    estadoInicial: { porQuadraDia: {} },
  });

if (ehPrincipal(import.meta.url)) consumidorFaturamento();
