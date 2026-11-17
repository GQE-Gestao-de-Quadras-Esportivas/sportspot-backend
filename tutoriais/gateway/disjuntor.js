// Circuit breaker (disjuntor) por serviço.
//   FECHADO    -> chamadas passam; N falhas seguidas -> ABERTO
//   ABERTO     -> responde 503 na hora, sem chamar o serviço, até o tempo acabar
//   SEMIABERTO -> deixa passar UMA chamada de teste: sucesso fecha, falha reabre
export class Disjuntor {
  constructor(nome, { limiteFalhas, tempoAbertoMs }, logger) {
    Object.assign(this, { nome, limiteFalhas, tempoAbertoMs, logger });
    this.estado = 'FECHADO';
    this.falhas = 0;
    this.abertoAte = 0;
    this.testeEmAndamento = false;
  }

  /** @returns {{permitido: boolean, retryAfterS?: number}} */
  podeChamar() {
    if (this.estado === 'ABERTO') {
      if (Date.now() < this.abertoAte) return { permitido: false, retryAfterS: Math.ceil((this.abertoAte - Date.now()) / 1000) };
      this.mudar('SEMIABERTO');
    }
    if (this.estado === 'SEMIABERTO') {
      if (this.testeEmAndamento) return { permitido: false, retryAfterS: 1 };
      this.testeEmAndamento = true;
    }
    return { permitido: true };
  }

  sucesso() {
    this.testeEmAndamento = false;
    this.falhas = 0;
    if (this.estado !== 'FECHADO') this.mudar('FECHADO');
  }

  falha() {
    this.testeEmAndamento = false;
    this.falhas++;
    if (this.estado === 'SEMIABERTO' || this.falhas >= this.limiteFalhas) {
      this.abertoAte = Date.now() + this.tempoAbertoMs;
      this.mudar('ABERTO');
    }
  }

  mudar(estado) {
    this.logger.warn(`disjuntor do serviço "${this.nome}": ${this.estado} -> ${estado}`, { falhas: this.falhas });
    this.estado = estado;
  }

  resumo() {
    return { estado: this.estado, falhasSeguidas: this.falhas, abertoAte: this.estado === 'ABERTO' ? new Date(this.abertoAte).toISOString() : null };
  }
}
