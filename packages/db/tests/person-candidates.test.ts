import { randomUUID } from "node:crypto";
import { planPersonLookup, type NormalizedLead, type PersonLookupPlan } from "@marctco/domain";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createJobContext, type UserContext } from "../src/access-context.js";
import { findPersonCandidates } from "../src/person.js";
import { resolveUserContextForSlug } from "../src/workspace-context.js";

const database_url = process.env.DATABASE_URL;
if (!database_url) {
  throw new Error("DATABASE_URL is required for database tests");
}

/**
 * The seeding client connects as the local superuser, which bypasses RLS —
 * that is what lets it write rows into two workspaces at once. The reads under
 * test run through a second connection whose session role is `marctco_app`,
 * so the policies apply exactly as they do in production.
 */
function appRoleUrl(url: string): string {
  const parsed = new URL(url);
  parsed.searchParams.set("options", "-c role=marctco_app");
  return parsed.toString();
}

const seeder = new PrismaClient({ datasources: { db: { url: database_url } } });
const app = new PrismaClient({ datasources: { db: { url: appRoleUrl(database_url) } } });

const workspace_a = randomUUID();
const workspace_b = randomUUID();
const slug_a = randomUUID();
const user_a = randomUUID();

const maria = randomUUID();
const joao = randomUUID();
const absorbed = randomUUID();
const neighbour = randomUUID();
const namesake_in_b = randomUUID();

const MARIA_CPF = "52998224725";
const JOAO_CPF = "11144477735";
const MARIA_PHONE = "+5511987654321";
const MARIA_EMAIL = "maria@exemplo.com";
const SHARED_EMAIL = "contato@empresa.com.br";

let context_a: UserContext;

/** The plan a submission carrying these values would produce. */
function planFor(values: {
  cpf?: string;
  phones?: readonly string[];
  emails?: readonly string[];
}): PersonLookupPlan {
  const normalized = {
    cpf: values.cpf ?? null,
    phones: values.phones ?? [],
    emails: values.emails ?? []
  } as NormalizedLead;
  return planPersonLookup(normalized);
}

beforeAll(async () => {
  await seeder.$transaction(async (transaction) => {
    await transaction.workspace.createMany({
      data: [
        { id: workspace_a, slug: slug_a, name: "Workspace A" },
        { id: workspace_b, slug: randomUUID(), name: "Workspace B" }
      ]
    });
    await transaction.workspaceMember.create({
      data: { workspace_id: workspace_a, user_id: user_a, role: "OWNER" }
    });
    // Every workspace owes the database exactly one default commercial
    // pipeline; this test does not use it, but the invariant is not optional.
    for (const workspace_id of [workspace_a, workspace_b]) {
      await transaction.pipeline.create({
        data: {
          workspace_id,
          name: "Comercial",
          type: "COMMERCIAL",
          is_default: true,
          stages: {
            create: [
              { label: "Novo lead", position: 1, role: "ENTRY" },
              { label: "Negociação final", position: 2, role: "CLOSING" }
            ]
          }
        }
      });
    }
    await transaction.person.createMany({
      data: [
        { id: maria, workspace_id: workspace_a, name: "Maria", cpf: MARIA_CPF },
        { id: joao, workspace_id: workspace_a, name: "João", cpf: JOAO_CPF },
        { id: neighbour, workspace_id: workspace_a, name: "Vizinha" },
        // Another workspace's Pessoa, carrying exactly the same keys.
        { id: namesake_in_b, workspace_id: workspace_b, name: "Homônima", cpf: MARIA_CPF }
      ]
    });
    await transaction.person.create({
      data: {
        id: absorbed,
        workspace_id: workspace_a,
        name: "Maria (absorvida)",
        merged_into_person_id: maria
      }
    });
    await transaction.personPhone.createMany({
      data: [
        { workspace_id: workspace_a, person_id: maria, phone_e164: MARIA_PHONE },
        { workspace_id: workspace_a, person_id: maria, phone_e164: "+551133334444" },
        { workspace_id: workspace_a, person_id: joao, phone_e164: "+5511911112222" },
        { workspace_id: workspace_b, person_id: namesake_in_b, phone_e164: MARIA_PHONE }
      ]
    });
    await transaction.personEmail.createMany({
      data: [
        { workspace_id: workspace_a, person_id: maria, email: MARIA_EMAIL },
        { workspace_id: workspace_a, person_id: maria, email: SHARED_EMAIL },
        { workspace_id: workspace_a, person_id: neighbour, email: SHARED_EMAIL }
      ]
    });
  });

  const resolved = await resolveUserContextForSlug(user_a, slug_a, seeder);
  if (!resolved) {
    throw new Error("failed to resolve the seeded user workspace");
  }
  context_a = resolved.context;
});

afterAll(async () => {
  await seeder.workspaceMember.deleteMany({
    where: { workspace_id: { in: [workspace_a, workspace_b] } }
  });
  await seeder.workspace.deleteMany({ where: { id: { in: [workspace_a, workspace_b] } } });
  await seeder.$disconnect();
  await app.$disconnect();
});

describe("findPersonCandidates", () => {
  it("finds a Pessoa by the CPF the plan asked for, and says the CPF matched", async () => {
    const candidates = await findPersonCandidates(context_a, planFor({ cpf: MARIA_CPF }), app);

    expect(candidates).toEqual([
      { person_id: maria, cpf: MARIA_CPF, matched: { cpf: true, phone: false, email: false } }
    ]);
  });

  it("finds a Pessoa by any of the phones the plan asked for", async () => {
    const by_first = await findPersonCandidates(context_a, planFor({ phones: [MARIA_PHONE] }), app);
    expect(by_first).toEqual([
      { person_id: maria, cpf: MARIA_CPF, matched: { cpf: false, phone: true, email: false } }
    ]);

    // The landline the same person left in an earlier submission. A lookup
    // that carried only the first phone would not recognise her.
    const by_second = await findPersonCandidates(
      context_a,
      planFor({ phones: ["+551133334444"] }),
      app
    );
    expect(by_second.map((candidate) => candidate.person_id)).toEqual([maria]);
  });

  it("finds a Pessoa by e-mail and reports which kinds of key matched", async () => {
    const candidates = await findPersonCandidates(
      context_a,
      planFor({ phones: [MARIA_PHONE], emails: [MARIA_EMAIL] }),
      app
    );

    expect(candidates).toEqual([
      { person_id: maria, cpf: MARIA_CPF, matched: { cpf: false, phone: true, email: true } }
    ]);
  });

  it("returns the CPF already on the record, so a contradiction is visible without a second read", async () => {
    // The phone points at Maria; the submission claims João's CPF. The
    // arbitration needs both facts, and gets them in one row.
    const candidates = await findPersonCandidates(
      context_a,
      planFor({ cpf: JOAO_CPF, phones: [MARIA_PHONE] }),
      app
    );

    const by_phone = candidates.find((candidate) => candidate.person_id === maria);
    expect(by_phone?.cpf).toBe(MARIA_CPF);
    expect(by_phone?.matched).toEqual({ cpf: false, phone: true, email: false });
  });

  it("returns every Pessoa the keys point at, so the decision can see the conflict", async () => {
    const candidates = await findPersonCandidates(
      context_a,
      planFor({ cpf: JOAO_CPF, phones: [MARIA_PHONE] }),
      app
    );

    expect(candidates.map((candidate) => candidate.person_id).sort()).toEqual([joao, maria].sort());
  });

  it("returns every Pessoa sharing a weak key", async () => {
    const candidates = await findPersonCandidates(
      context_a,
      planFor({ emails: [SHARED_EMAIL] }),
      app
    );

    expect(candidates.map((candidate) => candidate.person_id).sort()).toEqual(
      [maria, neighbour].sort()
    );
  });

  it("never returns a merged Pessoa", async () => {
    // The tombstone kept no contacts, so nothing should reach it — but if
    // anything ever did, reusing it would write onto a row the merge took out
    // of every active view.
    const candidates = await findPersonCandidates(
      context_a,
      planFor({ cpf: MARIA_CPF, phones: [MARIA_PHONE], emails: [MARIA_EMAIL] }),
      app
    );

    expect(candidates.map((candidate) => candidate.person_id)).not.toContain(absorbed);
  });

  it("never crosses the workspace boundary, even on identical keys", async () => {
    // Workspace B holds a Pessoa with the same CPF and the same phone.
    const candidates = await findPersonCandidates(
      context_a,
      planFor({ cpf: MARIA_CPF, phones: [MARIA_PHONE] }),
      app
    );

    expect(candidates).toEqual([
      { person_id: maria, cpf: MARIA_CPF, matched: { cpf: true, phone: true, email: false } }
    ]);
  });

  it("accepts a JobContext as well as a UserContext — ingestion has two callers", async () => {
    const job_context = createJobContext({
      workspace_id: workspace_a,
      integration_event_id: randomUUID()
    });

    await expect(
      findPersonCandidates(job_context, planFor({ cpf: MARIA_CPF }), app)
    ).resolves.toEqual([
      { person_id: maria, cpf: MARIA_CPF, matched: { cpf: true, phone: false, email: false } }
    ]);
  });

  it("answers an empty plan without querying at all", async () => {
    const never = new Proxy(
      {},
      {
        get() {
          throw new Error("findPersonCandidates must not query for a plan with no keys");
        }
      }
    ) as never;

    await expect(findPersonCandidates(context_a, planFor({}), never)).resolves.toEqual([]);
  });

  it("finds nobody when the keys are new", async () => {
    await expect(
      findPersonCandidates(
        context_a,
        planFor({ phones: ["+5511999998888"], emails: ["ninguem@exemplo.com"] }),
        app
      )
    ).resolves.toEqual([]);
  });
});

describe("person contact storage", () => {
  it("makes overwriting an earlier contact impossible rather than merely discouraged", async () => {
    // Receiving a contact again must never replace what is there. The pair is
    // unique, so the write that ticket 09 performs is an insert that does
    // nothing on conflict — there is no UPDATE path to a contact value at all.
    await expect(
      seeder.personPhone.create({
        data: { workspace_id: workspace_a, person_id: maria, phone_e164: MARIA_PHONE }
      })
    ).rejects.toThrow(/unique/i);

    const phones = await seeder.personPhone.findMany({
      where: { person_id: maria },
      orderBy: { phone_e164: "asc" }
    });
    expect(phones.map((phone) => phone.phone_e164)).toEqual(["+551133334444", MARIA_PHONE]);
  });

  it("keeps many phones and many e-mails for one Pessoa", async () => {
    const emails = await seeder.personEmail.findMany({ where: { person_id: maria } });
    expect(emails).toHaveLength(2);
  });

  it("refuses a phone that is not in E.164 and an e-mail that is not lowercase", async () => {
    // The normalizers run in packages/domain, and the database is the second
    // line: a write path that skipped them would be caught here rather than
    // producing a lookup key that never matches itself.
    await expect(
      seeder.personPhone.create({
        data: { workspace_id: workspace_a, person_id: joao, phone_e164: "(11) 98765-4321" }
      })
    ).rejects.toThrow(/person_phones_phone_is_e164/i);

    await expect(
      seeder.personEmail.create({
        data: { workspace_id: workspace_a, person_id: joao, email: "Joao@Exemplo.com" }
      })
    ).rejects.toThrow(/person_emails_email_is_lowercase/i);
  });

  it("refuses a CPF that is not eleven digits, and a Pessoa merged into itself", async () => {
    await expect(
      seeder.person.create({
        data: { workspace_id: workspace_a, name: "Torto", cpf: "529.982.247-25" }
      })
    ).rejects.toThrow(/persons_cpf_is_eleven_digits/i);

    const self = randomUUID();
    await expect(
      seeder.person.create({
        data: { id: self, workspace_id: workspace_a, name: "Círculo", merged_into_person_id: self }
      })
    ).rejects.toThrow(/persons_merge_points_elsewhere/i);
  });
});
