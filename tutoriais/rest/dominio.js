// Regras do domínio SportSpot: valores fixos (enums), validação de entrada e
// regras de negócio. Os erros são lançados como Problema (RFC 9457).
import { Problema } from '../shared/problema.js';
import { dataLocal, horaParaMinutos, minutosDoDia, RE_HORA, RE_ISO_COM_FUSO } from './tempo.js';

// --- Valores fixos do domínio ---------------------------------------------
// Os valores de esporte e piso vêm do formulário "Cadastrar Nova Quadra" do
// frontend Angular (cadastrar-quadra.component.html) e do backend original.
export const ESPORTES = ['futebol', 'futsal', 'basquete', 'volei', 'tenis', 'beach_tennis'];
export const PISOS = ['grama_natural', 'grama_sintetica', 'parquet', 'cimento', 'areia'];
export const RECURSOS = ['cobertura', 'iluminacao', 'vestiario'];
export const STATUS_AGENDAMENTO = ['CONFIRMADO', 'CANCELADO'];
export const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];

// RN01: pisos adequados a cada esporte.
export const PISOS_POR_ESPORTE = {
  futebol: ['grama_natural', 'grama_sintetica'],
  futsal: ['parquet', 'cimento'],
  basquete: ['parquet', 'cimento'],
  volei: ['parquet', 'cimento', 'areia'],
  tenis: ['cimento', 'grama_natural', 'grama_sintetica'],
  beach_tennis: ['areia'],
};

// Parâmetros das regras de agendamento.
export const REGRAS = {
  duracaoMinima: 60, // RN04
  duracaoMaxima: 180, // RN04
  passoMinutos: 30, // RN04: início e duração em blocos de 30 min
  antecedenciaMinimaMin: 30, // RN03
  antecedenciaMaximaDias: 60, // RN03
  inicioNoturno: '18:00', // RN06
  cancelamentoAntecedenciaH: 2, // RN07
};

// --- Ferramentas de validação ----------------------------------------------
class Validador {
  constructor() {
    this.erros = [];
  }
  erro(campo, mensagem) {
    this.erros.push({ campo, mensagem });
  }
  texto(obj, campo, { obrigatorio = true, min = 1, max = 255, rotulo = campo } = {}) {
    const v = obj[campo];
    if (v === undefined || v === null) {
      if (obrigatorio) this.erro(rotulo, 'é obrigatório');
      return;
    }
    if (typeof v !== 'string') return this.erro(rotulo, 'deve ser texto');
    const t = v.trim();
    if (t.length < min || t.length > max) this.erro(rotulo, `deve ter entre ${min} e ${max} caracteres`);
  }
  enumeracao(obj, campo, valores, { obrigatorio = true } = {}) {
    const v = obj[campo];
    if (v === undefined || v === null) {
      if (obrigatorio) this.erro(campo, 'é obrigatório');
      return;
    }
    if (!valores.includes(v)) this.erro(campo, `valor inválido; use um de: ${valores.join(', ')}`);
  }
  numero(obj, campo, { obrigatorio = true, min = -Infinity, max = Infinity, inteiro = false } = {}) {
    const v = obj[campo];
    if (v === undefined || v === null) {
      if (obrigatorio) this.erro(campo, 'é obrigatório');
      return;
    }
    if (typeof v !== 'number' || !Number.isFinite(v)) return this.erro(campo, 'deve ser um número');
    if (inteiro && !Number.isInteger(v)) return this.erro(campo, 'deve ser um número inteiro');
    if (v < min || v > max) this.erro(campo, `deve estar entre ${min} e ${max}`);
  }
  lancarSeHouver(detalhe = 'Um ou mais campos são inválidos.') {
    if (this.erros.length)
      throw new Problema(422, 'validacao', 'Dados inválidos', detalhe, { errors: this.erros });
  }
}

function camposDesconhecidos(corpo, permitidos, v) {
  for (const campo of Object.keys(corpo)) if (!permitidos.includes(campo)) v.erro(campo, 'campo desconhecido');
}

// --- Quadras ------------------------------------------------------------------
const CAMPOS_QUADRA = ['nome', 'esporte', 'piso', 'precoHora', 'endereco', 'descricao', 'recursos', 'horarioAbertura', 'horarioFechamento', 'proprietarioId'];
const CAMPOS_ENDERECO = ['cep', 'logradouro', 'numero', 'bairro', 'cidade', 'uf'];

/**
 * Valida o corpo de uma quadra.
 * modo 'completo' (POST/PUT): todos os obrigatórios; modo 'parcial' (PATCH): só os enviados.
 */
export function validarQuadra(corpo, modo) {
  const v = new Validador();
  const parcial = modo === 'parcial';
  camposDesconhecidos(corpo, CAMPOS_QUADRA, v);
  if (parcial && 'proprietarioId' in corpo) v.erro('proprietarioId', 'não pode ser alterado; a quadra pertence ao mesmo proprietário');

  const obrig = (campo) => !parcial || campo in corpo;
  if (obrig('nome')) v.texto(corpo, 'nome', { min: 3, max: 80 });
  if (obrig('esporte')) v.enumeracao(corpo, 'esporte', ESPORTES);
  if (obrig('piso')) v.enumeracao(corpo, 'piso', PISOS);
  if (obrig('precoHora')) v.numero(corpo, 'precoHora', { min: 1, max: 2000 });
  if (!parcial) v.texto(corpo, 'proprietarioId', { max: 40 });
  v.texto(corpo, 'descricao', { obrigatorio: false, min: 0, max: 500 });

  if ('recursos' in corpo) {
    const r = corpo.recursos;
    if (!Array.isArray(r)) v.erro('recursos', 'deve ser uma lista');
    else {
      for (const item of r) if (!RECURSOS.includes(item)) v.erro('recursos', `recurso inválido "${item}"; use: ${RECURSOS.join(', ')}`);
      if (new Set(r).size !== r.length) v.erro('recursos', 'não pode repetir recursos');
    }
  }
  for (const campo of ['horarioAbertura', 'horarioFechamento']) {
    if (corpo[campo] !== undefined && (typeof corpo[campo] !== 'string' || !RE_HORA.test(corpo[campo])))
      v.erro(campo, 'deve estar no formato HH:MM');
  }

  if (obrig('endereco')) {
    const e = corpo.endereco;
    if (e === undefined || e === null) v.erro('endereco', 'é obrigatório');
    else if (typeof e !== 'object' || Array.isArray(e)) v.erro('endereco', 'deve ser um objeto');
    else {
      for (const campo of Object.keys(e)) if (!CAMPOS_ENDERECO.includes(campo)) v.erro(`endereco.${campo}`, 'campo desconhecido');
      if (typeof e.cep !== 'string' || !/^\d{5}-?\d{3}$/.test(e.cep)) v.erro('endereco.cep', 'deve ter 8 dígitos (00000-000)');
      v.texto(e, 'logradouro', { max: 120, rotulo: 'endereco.logradouro' });
      v.texto(e, 'numero', { max: 6, rotulo: 'endereco.numero' });
      v.texto(e, 'bairro', { max: 80, rotulo: 'endereco.bairro' });
      v.texto(e, 'cidade', { max: 80, rotulo: 'endereco.cidade' });
      if (!UFS.includes(e.uf)) v.erro('endereco.uf', 'deve ser a sigla de um estado brasileiro (ex.: SP)');
    }
  }
  v.lancarSeHouver();
}

export function normalizarEndereco(e) {
  const digitos = e.cep.replace(/\D/g, '');
  return {
    cep: `${digitos.slice(0, 5)}-${digitos.slice(5)}`,
    logradouro: e.logradouro.trim(),
    numero: e.numero.trim(),
    bairro: e.bairro.trim(),
    cidade: e.cidade.trim(),
    uf: e.uf,
  };
}

/** Regras que dependem da quadra completa (depois de aplicar PUT/PATCH). */
export function verificarRegrasDaQuadra(q) {
  // RN01: esporte compatível com o piso
  if (!PISOS_POR_ESPORTE[q.esporte].includes(q.piso)) {
    throw new Problema(422, 'piso-incompativel', 'Piso incompatível com o esporte',
      `O esporte "${q.esporte}" não pode ser praticado em piso "${q.piso}". Pisos aceitos: ${PISOS_POR_ESPORTE[q.esporte].join(', ')}.`,
      { regra: 'RN01' });
  }
  if (horaParaMinutos(q.horarioAbertura) >= horaParaMinutos(q.horarioFechamento)) {
    throw new Problema(422, 'validacao', 'Dados inválidos', 'O horário de abertura deve ser anterior ao de fechamento.', {
      errors: [{ campo: 'horarioFechamento', mensagem: 'deve ser posterior a horarioAbertura' }],
    });
  }
}

// --- Agendamentos -------------------------------------------------------------
const CAMPOS_AGENDAMENTO = ['quadraId', 'atletaId', 'inicio', 'duracaoMinutos'];

export function validarNovoAgendamento(corpo) {
  const v = new Validador();
  camposDesconhecidos(corpo, CAMPOS_AGENDAMENTO, v);
  v.texto(corpo, 'quadraId', { max: 40 });
  v.texto(corpo, 'atletaId', { max: 40 });
  v.numero(corpo, 'duracaoMinutos', { inteiro: true, min: 1, max: 24 * 60 });
  if (corpo.inicio === undefined) v.erro('inicio', 'é obrigatório');
  else if (typeof corpo.inicio !== 'string' || !RE_ISO_COM_FUSO.test(corpo.inicio) || Number.isNaN(Date.parse(corpo.inicio)))
    v.erro('inicio', 'deve ser data e hora ISO 8601 com fuso, ex.: 2026-11-20T19:00:00-03:00');
  v.lancarSeHouver();
}

/**
 * Aplica as regras de negócio de um novo agendamento.
 * @returns {{inicio:number, fim:number}}
 */
export function verificarRegrasDoAgendamento({ quadra, inicioIso, duracaoMinutos, agendamentosDaQuadra, agora = Date.now() }) {
  const inicio = Date.parse(inicioIso);
  const fim = inicio + duracaoMinutos * 60_000;

  // RN03: não agendar no passado (nem em cima da hora) e no máximo 60 dias à frente
  if (inicio < agora + REGRAS.antecedenciaMinimaMin * 60_000) {
    throw new Problema(422, 'agendamento-no-passado', 'Horário no passado',
      `O agendamento precisa começar pelo menos ${REGRAS.antecedenciaMinimaMin} minutos no futuro.`, { regra: 'RN03' });
  }
  if (inicio > agora + REGRAS.antecedenciaMaximaDias * 86_400_000) {
    throw new Problema(422, 'antecedencia-maxima', 'Agendamento muito distante',
      `Só é possível agendar com até ${REGRAS.antecedenciaMaximaDias} dias de antecedência.`, { regra: 'RN03' });
  }

  // RN04: duração entre 1h e 3h, em blocos de 30 min, começando em hora cheia ou meia hora
  const minutoInicio = minutosDoDia(inicio);
  if (duracaoMinutos < REGRAS.duracaoMinima || duracaoMinutos > REGRAS.duracaoMaxima || duracaoMinutos % REGRAS.passoMinutos !== 0 || minutoInicio % REGRAS.passoMinutos !== 0) {
    throw new Problema(422, 'duracao-invalida', 'Duração ou horário fora do padrão',
      `A reserva deve durar de ${REGRAS.duracaoMinima} a ${REGRAS.duracaoMaxima} minutos, em blocos de ${REGRAS.passoMinutos} minutos, começando em hora cheia ou meia hora.`,
      { regra: 'RN04' });
  }

  // RN05: dentro do horário de funcionamento da quadra (e no mesmo dia)
  const abre = horaParaMinutos(quadra.horarioAbertura);
  const fecha = horaParaMinutos(quadra.horarioFechamento);
  const minutoFim = minutoInicio + duracaoMinutos;
  if (minutoInicio < abre || minutoFim > fecha || dataLocal(inicio) !== dataLocal(fim - 1)) {
    throw new Problema(422, 'fora-do-horario', 'Fora do horário de funcionamento',
      `A quadra "${quadra.nome}" funciona das ${quadra.horarioAbertura} às ${quadra.horarioFechamento}.`, { regra: 'RN05' });
  }

  // RN06: reservas que terminam depois das 18:00 exigem quadra com iluminação
  if (minutoFim > horaParaMinutos(REGRAS.inicioNoturno) && !quadra.recursos.includes('iluminacao')) {
    throw new Problema(422, 'sem-iluminacao', 'Quadra sem iluminação noturna',
      `A quadra "${quadra.nome}" não tem iluminação; reservas devem terminar até ${REGRAS.inicioNoturno}.`, { regra: 'RN06' });
  }

  // RN02: horário já ocupado (sobreposição com reserva confirmada na mesma quadra)
  const conflito = agendamentosDaQuadra.find((a) => a.status === 'CONFIRMADO' && a.inicio < fim && inicio < a.fim);
  if (conflito) {
    throw new Problema(409, 'horario-ocupado', 'Horário já ocupado',
      `A quadra "${quadra.nome}" já tem uma reserva que se sobrepõe a este horário.`,
      { regra: 'RN02', conflitoCom: conflito.id });
  }
  return { inicio, fim };
}

/** RN07: cancelamento só até 2 horas antes do início; não cancelar duas vezes. */
export function verificarCancelamento(agendamento, agora = Date.now()) {
  if (agendamento.status === 'CANCELADO') {
    throw new Problema(409, 'ja-cancelado', 'Agendamento já cancelado', `O agendamento ${agendamento.id} já foi cancelado.`, { regra: 'RN07' });
  }
  if (agendamento.inicio - agora < REGRAS.cancelamentoAntecedenciaH * 3_600_000) {
    throw new Problema(422, 'cancelamento-fora-do-prazo', 'Cancelamento fora do prazo',
      `O cancelamento só é permitido até ${REGRAS.cancelamentoAntecedenciaH} horas antes do início da reserva.`, { regra: 'RN07' });
  }
}
