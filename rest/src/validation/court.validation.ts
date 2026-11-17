import { badRequest, FieldError, unprocessable } from "../errors/http-error.js";
import { GROUND_TYPES, PAGE_DEFAULT, PAGE_MAX, RESOURCES, SPORTS } from "../domain/enums.js";

// Convenção usada na API inteira:
//   400 → a requisição está malformada (campo obrigatório ausente, tipo errado)
//   422 → a requisição está bem formada, mas o valor viola uma regra do domínio

export interface CourtInput {
  court_name: string;
  sport: string;
  price: number;
  ground_type: string;
  cep: string;
  address: string;
  address_number: string;
  neighborhood: string;
  city: string;
  state: string;
  description: string;
  resources: string[];
}

const STRING_FIELDS = [
  "court_name", "sport", "ground_type", "cep", "address",
  "address_number", "neighborhood", "city", "state",
] as const;

// Aceita o formato antigo do frontend (descricao, temCobertura...) e o novo (description, resources)
function normalize(body: any): any {
  const out = { ...body };
  if (out.description === undefined && out.descricao !== undefined) out.description = out.descricao;
  if (out.resources === undefined && ("temCobertura" in out || "temIluminacao" in out || "temVestiario" in out)) {
    out.resources = [
      out.temCobertura && "cobertura",
      out.temIluminacao && "iluminacao",
      out.temVestiario && "vestiario",
    ].filter(Boolean);
  }
  if (typeof out.price === "string" && out.price.trim() !== "" && !isNaN(Number(out.price))) {
    out.price = Number(out.price);
  }
  if (typeof out.cep === "string") out.cep = out.cep.replace(/\D/g, "");
  delete out.descricao; delete out.temCobertura; delete out.temIluminacao; delete out.temVestiario;
  return out;
}

/**
 * partial = false → POST e PUT (todos os campos obrigatórios)
 * partial = true  → PATCH (só valida o que veio)
 */
export function validateCourt(rawBody: unknown, partial: boolean): Partial<CourtInput> {
  if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
    throw badRequest("Envie um objeto JSON com o cabeçalho Content-Type: application/json.");
  }
  const body = normalize(rawBody);

  // ---- 400: presença e tipo ----
  const shape: FieldError[] = [];
  for (const f of STRING_FIELDS) {
    if (body[f] === undefined) {
      if (!partial) shape.push({ field: f, message: "obrigatório" });
    } else if (typeof body[f] !== "string" || body[f].trim() === "") {
      shape.push({ field: f, message: "deve ser um texto não vazio" });
    }
  }
  if (body.price === undefined) {
    if (!partial) shape.push({ field: "price", message: "obrigatório" });
  } else if (typeof body.price !== "number" || !Number.isFinite(body.price)) {
    shape.push({ field: "price", message: "deve ser um número" });
  }
  if (body.description !== undefined && typeof body.description !== "string") {
    shape.push({ field: "description", message: "deve ser um texto" });
  }
  if (body.resources !== undefined && !Array.isArray(body.resources)) {
    shape.push({ field: "resources", message: "deve ser uma lista" });
  }
  if (partial && Object.keys(body).length === 0) {
    throw badRequest("Envie pelo menos um campo para alterar.");
  }
  if (shape.length) throw badRequest("Há campos ausentes ou com tipo errado.", shape);

  // ---- 422: valores válidos para o domínio ----
  const rules: FieldError[] = [];
  if (body.sport !== undefined && !SPORTS.includes(body.sport))
    rules.push({ field: "sport", message: `use um destes: ${SPORTS.join(", ")}` });
  if (body.ground_type !== undefined && !GROUND_TYPES.includes(body.ground_type))
    rules.push({ field: "ground_type", message: `use um destes: ${GROUND_TYPES.join(", ")}` });
  if (body.price !== undefined && (body.price <= 0 || body.price > 10000))
    rules.push({ field: "price", message: "o preço por hora deve ser maior que 0 e no máximo 10000" });
  if (body.cep !== undefined && !/^\d{8}$/.test(body.cep))
    rules.push({ field: "cep", message: "o CEP deve ter 8 dígitos" });
  if (body.state !== undefined && !/^[A-Za-z]{2}$/.test(body.state))
    rules.push({ field: "state", message: "use a sigla do estado com 2 letras (ex.: SP)" });
  if (body.address_number !== undefined && body.address_number.length > 6)
    rules.push({ field: "address_number", message: "no máximo 6 caracteres" });
  if (Array.isArray(body.resources)) {
    const invalid = body.resources.filter((r: unknown) => !RESOURCES.includes(r as any));
    if (invalid.length) rules.push({ field: "resources", message: `valores aceitos: ${RESOURCES.join(", ")}` });
  }
  if (rules.length) throw unprocessable("dados-invalidos", "Dados inválidos para uma quadra", "Um ou mais valores não são aceitos.", rules);

  const result: Partial<CourtInput> = {};
  for (const f of [...STRING_FIELDS, "price", "description", "resources"] as const) {
    if (body[f] !== undefined) (result as any)[f] = body[f];
  }
  if (result.state) result.state = result.state.toUpperCase();
  if (!partial && result.description === undefined) result.description = "";
  if (!partial && result.resources === undefined) result.resources = [];
  return result;
}

// ---- Query string da listagem: filtros, ordenação e paginação ----

export const SORT_FIELDS = { price: "price", name: "court_name", createdAt: "created_At" } as const;

export interface CourtListQuery {
  sport?: string;
  groundType?: string;
  city?: string;
  state?: string;
  minPrice?: number;
  maxPrice?: number;
  owner?: "me";
  ids?: string[];
  sort: keyof typeof SORT_FIELDS;
  order: "ASC" | "DESC";
  page: number;
  limit: number;
}

export function parseCourtListQuery(q: Record<string, unknown>): CourtListQuery {
  const errors: FieldError[] = [];
  const str = (k: string) => (typeof q[k] === "string" && q[k] !== "" ? (q[k] as string) : undefined);
  const int = (k: string, def: number) => {
    const v = str(k);
    if (v === undefined) return def;
    if (!/^\d+$/.test(v) || Number(v) < 1) { errors.push({ field: k, message: "deve ser um inteiro ≥ 1" }); return def; }
    return Number(v);
  };
  const num = (k: string) => {
    const v = str(k);
    if (v === undefined) return undefined;
    if (isNaN(Number(v))) { errors.push({ field: k, message: "deve ser um número" }); return undefined; }
    return Number(v);
  };

  const sort = (str("sort") ?? "createdAt") as CourtListQuery["sort"];
  if (!(sort in SORT_FIELDS)) errors.push({ field: "sort", message: `use: ${Object.keys(SORT_FIELDS).join(", ")}` });
  const order = (str("order") ?? "desc").toLowerCase();
  if (order !== "asc" && order !== "desc") errors.push({ field: "order", message: "use asc ou desc" });
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const ids = str("ids")?.split(",").map((x) => x.trim()).filter(Boolean);
  if (ids && (ids.length > PAGE_MAX || ids.some((x) => !UUID.test(x))))
    errors.push({ field: "ids", message: `lista de até ${PAGE_MAX} UUIDs separados por vírgula` });
  const owner = str("owner");
  if (owner !== undefined && owner !== "me") errors.push({ field: "owner", message: "o único valor aceito é me" });

  const result: CourtListQuery = {
    sport: str("sport"),
    groundType: str("groundType"),
    city: str("city"),
    state: str("state")?.toUpperCase(),
    minPrice: num("minPrice"),
    maxPrice: num("maxPrice"),
    owner: owner as "me" | undefined,
    ids,
    sort,
    order: order.toUpperCase() as "ASC" | "DESC",
    page: int("page", 1),
    limit: Math.min(int("limit", PAGE_DEFAULT), PAGE_MAX), // teto da página
  };
  if (errors.length) throw badRequest("Parâmetros de consulta inválidos.", errors);
  return result;
}
