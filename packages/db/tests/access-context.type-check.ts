/**
 * Compile-time proof, not a runtime test. It has no assertions to run — its
 * only job is to fail `pnpm typecheck` if the invariant it documents stops
 * holding.
 *
 * ADR-0016 requires that "listLeads(jobCtx) não compila": an operation
 * typed to accept only `UserContext` must be a compile error to call with a
 * `JobContext`, because the worker has no user and no role to scope with.
 * No operation of that shape exists yet in this ticket — `Opportunity`
 * doesn't either — so this file stands in with a representative operation
 * of the same shape every future `UserContext`-only operation
 * (`listLeads`, `countLeadsByMarker`, `getLead`, ...) will have. If this
 * file stops producing the expected error, the compiler barrier ADR-0016
 * describes has quietly become a runtime check instead — the exact
 * regression `@ts-expect-error` below is watching for.
 */
import { createJobContext, type UserContext } from "../src/access-context.js";
import { resolveIntakeReview } from "../src/intake-review.js";
import { listLeads } from "../src/leads.js";
import { attachWorkspaceMember, listTeam } from "../src/team.js";

function representativeUserOnlyOperation(context: UserContext): void {
  // A real operation would open a scoped transaction here. The type shape
  // is what this file is proving, not the body.
  void context;
}

declare const userContext: UserContext;

const jobContext = createJobContext({
  workspace_id: "11111111-1111-1111-1111-111111111111",
  integration_event_id: "33333333-3333-3333-3333-333333333333"
});

const sweepContext = createJobContext({
  workspace_id: "11111111-1111-1111-1111-111111111111",
  origin: { type: "scheduled_sweep", sweep: "OPPORTUNITY_CLOCK" }
});
void sweepContext;

// A UserContext is exactly what the operation asks for: this must compile.
representativeUserOnlyOperation(userContext);

// @ts-expect-error - a JobContext must not satisfy an operation typed to
// accept only UserContext. Losing this error means listLeads(jobCtx) would
// start compiling, which is the regression ADR-0016 exists to prevent.
representativeUserOnlyOperation(jobContext);

// @ts-expect-error - resolving a human review is never a worker operation.
void resolveIntakeReview(jobContext, {
  review_id: "44444444-4444-4444-8444-444444444444",
  resolution: "NEW_FINANCING",
  reason: "Contratos distintos",
  resolved_at: new Date()
});

// @ts-expect-error - listLeads(jobCtx) must not compile (ADR-0016, ADR-0018
// registro §Ticket 03 "Pendências carregadas"): the worker never reads the
// Leads screen, so there is no runtime path where a job could see it.
void listLeads(jobContext);

// @ts-expect-error - Equipe is a person acting in a workspace, never a job.
void listTeam(jobContext);

// @ts-expect-error - attaching a collaborator is Direção, never the worker.
void attachWorkspaceMember(jobContext, {
  user_id: "55555555-5555-5555-8555-555555555555",
  display_name: "Ana",
  email: "ana@hugs.test",
  role: "ATTENDANT",
  tags: []
});

// @ts-expect-error - AccessContext has "two constructors and no literal"
// (ADR-0016): the branded field that makes UserContext/JobContext nominal
// types is not exported, so a hand-written object literal can never
// structurally satisfy either variant, even when every visible field is
// correct.
const forgedContext: UserContext = {
  kind: "user",
  workspace_id: "11111111-1111-1111-1111-111111111111",
  user_id: "22222222-2222-2222-2222-222222222222",
  role: "OWNER"
};
void forgedContext;
