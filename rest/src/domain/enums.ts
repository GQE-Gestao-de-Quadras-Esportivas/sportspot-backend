// Valores fixos do domínio (os mesmos que o formulário do frontend envia)

export const SPORTS = ["futebol", "basquete", "volei", "tennis"] as const;
export type Sport = (typeof SPORTS)[number];

export const GROUND_TYPES = ["grama_natural", "grama_sintetica", "parquet", "cimento", "areia"] as const;
export type GroundType = (typeof GROUND_TYPES)[number];

export const GROUND_LABELS: Record<GroundType, string> = {
  grama_natural: "Grama natural",
  grama_sintetica: "Grama sintética",
  parquet: "Madeira / Parquet",
  cimento: "Cimento polido",
  areia: "Areia",
};

export const RESOURCES = ["cobertura", "iluminacao", "vestiario"] as const;
export type Resource = (typeof RESOURCES)[number];

// Regras de agendamento
export const APPOINTMENT_RULES = {
  minMinutes: 30, // duração mínima de uma reserva
  maxMinutes: 240, // duração máxima (4 horas)
  cancelAdvanceHours: 24, // só cancela com 24 h de antecedência
};

// Paginação
export const PAGE_DEFAULT = 10;
export const PAGE_MAX = 50; // teto: pedir mais que isso devolve no máximo 50
