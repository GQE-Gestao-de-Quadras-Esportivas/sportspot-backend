import { disjuntorConfig } from "../config.js";

// Disjuntor (circuit breaker), um por serviço.
//
//   FECHADO ──(N falhas seguidas)──► ABERTO ──(espera tempoAbertoMs)──► MEIO_ABERTO
//      ▲                                                                   │
//      └──────────────(a chamada de teste deu certo)──────────────────────┘
//                      (a chamada de teste falhou → volta para ABERTO)
//
// Enquanto está ABERTO, o gateway responde 503 na hora, sem chamar o serviço:
// não espera timeouts, e o serviço que está se recuperando não leva mais carga.

export class Disjuntor {
  constructor(nome, { limiteFalhas, tempoAbertoMs } = disjuntorConfig) {
    this.nome = nome;
    this.limiteFalhas = limiteFalhas;
    this.tempoAbertoMs = tempoAbertoMs;
    this.estado = "FECHADO";
    this.falhasSeguidas = 0;
    this.abertoEm = 0;
    this.testeEmAndamento = false;
  }

  // Pode chamar o serviço agora?
  permitir() {
    if (this.estado === "FECHADO") return true;
    if (this.estado === "ABERTO" && Date.now() - this.abertoEm >= this.tempoAbertoMs) {
      this.mudar("MEIO_ABERTO");
    }
    if (this.estado === "MEIO_ABERTO" && !this.testeEmAndamento) {
      this.testeEmAndamento = true; // deixa passar uma única chamada de teste
      return true;
    }
    return false;
  }

  segundosParaTentar() {
    return Math.max(1, Math.ceil((this.abertoEm + this.tempoAbertoMs - Date.now()) / 1000));
  }

  sucesso() {
    this.falhasSeguidas = 0;
    this.testeEmAndamento = false;
    if (this.estado !== "FECHADO") this.mudar("FECHADO");
  }

  falha() {
    this.testeEmAndamento = false;
    this.falhasSeguidas += 1;
    if (this.estado === "MEIO_ABERTO" || this.falhasSeguidas >= this.limiteFalhas) {
      this.abertoEm = Date.now();
      if (this.estado !== "ABERTO") this.mudar("ABERTO");
    }
  }

  mudar(novo) {
    console.log(`[gateway] [disjuntor ${this.nome}] ${this.estado} → ${novo}`);
    this.estado = novo;
  }
}

export const disjuntores = {};
export const disjuntorDe = (servico) => (disjuntores[servico] ??= new Disjuntor(servico));
