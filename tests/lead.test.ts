import { describe, expect, it } from "vitest";
import { normalizeWhatsapp, validateLead } from "../src/lead";
import worker, { type Env } from "../src/worker/index";

const valid = {
  nome: "Ana Souza",
  whatsapp: "(11) 97481-5782",
  empresa: "Padaria Central",
  ramo: "Padaria",
  produto: "Pão de queijo",
  origem: "gmb",
};

/** D1 falso: guarda as linhas inseridas, sem banco nenhum. */
function fakeEnv() {
  const rows: unknown[][] = [];
  const env: Env = {
    DB: {
      prepare: (query: string) => ({
        bind(...values: unknown[]) {
          return { bind: this.bind, run: async () => rows.push([query, ...values]) };
        },
        run: async () => rows.push([query]),
      }),
    },
    ASSETS: { fetch: async () => new Response("asset") },
  };
  return { env, rows };
}

const post = (body: unknown, origin = "https://marct.co") =>
  new Request("https://marct.co/api/leads", {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

describe("normalizeWhatsapp", () => {
  it("aceita celular e fixo, com ou sem 55, e devolve só dígitos com 55", () => {
    expect(normalizeWhatsapp("(11) 97481-5782")).toBe("5511974815782");
    expect(normalizeWhatsapp("+55 11 97481 5782")).toBe("5511974815782");
    expect(normalizeWhatsapp("11 3456-7890")).toBe("551134567890");
  });

  it("recusa número sem DDD ou curto demais", () => {
    expect(normalizeWhatsapp("97481-5782")).toBeNull();
    expect(normalizeWhatsapp("123")).toBeNull();
  });
});

describe("validateLead", () => {
  it("normaliza e aceita um contato completo", () => {
    const result = validateLead({ ...valid, nome: "  Ana   Souza " });
    expect(result).toEqual({ ok: true, lead: { ...valid, nome: "Ana Souza", whatsapp: "5511974815782" } });
  });

  it("aponta cada campo vazio ou inválido", () => {
    const result = validateLead({ ...valid, empresa: " ", whatsapp: "123" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors).sort()).toEqual(["empresa", "whatsapp"]);
  });

  it("troca origem desconhecida por 'site'", () => {
    const result = validateLead({ ...valid, origem: "<script>" });
    expect(result.ok && result.lead.origem).toBe("site");
  });
});

describe("worker /api/leads", () => {
  it("grava o contato com SQL parametrizado e responde 201", async () => {
    const { env, rows } = fakeEnv();
    const res = await worker.fetch(post(valid), env);
    expect(res.status).toBe(201);
    expect(rows).toHaveLength(1);
    expect(rows[0]![0]).toMatch(/^INSERT INTO leads .* VALUES \(\?, \?, \?, \?, \?, \?\)$/);
    expect(rows[0]!.slice(1)).toEqual(["Ana Souza", "5511974815782", "Padaria Central", "Padaria", "Pão de queijo", "gmb"]);
  });

  it("recusa dados inválidos (422), JSON quebrado (400) e outra origem (403) sem gravar", async () => {
    const { env, rows } = fakeEnv();
    expect((await worker.fetch(post({ ...valid, nome: "" }), env)).status).toBe(422);
    expect((await worker.fetch(post("{"), env)).status).toBe(400);
    expect((await worker.fetch(post(valid, "https://evil.example"), env)).status).toBe(403);
    expect(rows).toHaveLength(0);
  });

  it("finge sucesso para robô que preenche o campo-isca", async () => {
    const { env, rows } = fakeEnv();
    expect((await worker.fetch(post({ ...valid, site: "spam" }), env)).status).toBe(201);
    expect(rows).toHaveLength(0);
  });

  it("deixa o resto do site com os assets", async () => {
    const { env } = fakeEnv();
    expect(await (await worker.fetch(new Request("https://marct.co/"), env)).text()).toBe("asset");
  });
});
