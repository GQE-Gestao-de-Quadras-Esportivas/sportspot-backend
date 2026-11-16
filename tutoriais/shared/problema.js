// Problem Details for HTTP APIs (RFC 9457).
// Todas as respostas de erro do protótipo (API REST e gateway) usam este formato,
// com o Content-Type application/problem+json.

export const BASE_TIPOS = 'https://sportspot.example/problemas/';

export class Problema extends Error {
  /**
   * @param {number} status  código HTTP
   * @param {string} tipo    sufixo do URI do tipo (ex.: 'horario-ocupado')
   * @param {string} titulo  resumo curto e estável do tipo de problema
   * @param {string} detalhe explicação específica desta ocorrência
   * @param {object} extensoes membros adicionais (ex.: errors, regra)
   */
  constructor(status, tipo, titulo, detalhe, extensoes = {}) {
    super(detalhe);
    this.status = status;
    this.tipo = tipo;
    this.titulo = titulo;
    this.extensoes = extensoes;
  }
}

export function enviarProblema(res, { status, tipo, titulo, detalhe, instancia, requestId, extensoes = {}, cabecalhos = {} }) {
  for (const [nome, valor] of Object.entries(cabecalhos)) res.setHeader(nome, valor);
  res
    .status(status)
    .type('application/problem+json')
    .send(
      JSON.stringify({
        type: BASE_TIPOS + tipo,
        title: titulo,
        status,
        detail: detalhe,
        instance: instancia,
        requestId,
        ...extensoes,
      }),
    );
}
