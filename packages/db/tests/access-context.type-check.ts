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
import { createJobContext, createUserContext, type UserContext } from "../src/access-context.js";

function representativeUserOnlyOperation(context: UserContext): void {
  // A real operation would open a scoped transaction here. The type shape
  // is what this file is proving, not the body.
  void context;
}

const userContext = createUserContext({
  workspace_id: "11111111-1111-1111-1111-111111111111",
  user_id: "22222222-2222-2222-2222-222222222222",
  role: "OWNER"
});

const jobContext = createJobContext({
  workspace_id: "11111111-1111-1111-1111-111111111111",
  integration_event_id: "33333333-3333-3333-3333-333333333333"
});

// A UserContext is exactly what the operation asks for: this must compile.
representativeUserOnlyOperation(userContext);

// @ts-expect-error - a JobContext must not satisfy an operation typed to
// accept only UserContext. Losing this error means listLeads(jobCtx) would
// start compiling, which is the regression ADR-0016 exists to prevent.
representativeUserOnlyOperation(jobContext);

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
