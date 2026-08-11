export { assertSafeDatabaseRole } from "./boot-check.js";
export {
  createJobContext,
  isJobContext,
  isUserContext,
  WorkspaceRole,
  type AccessContext,
  type CreateJobContextInput,
  type JobContext,
  type UserContext
} from "./access-context.js";
export {
  listUserWorkspaces,
  resolveUserContextForSlug,
  type ResolveUserWorkspacesInput,
  type ResolvedUserContext,
  type UserWorkspace
} from "./workspace-context.js";
export {
  deletePipeline,
  deleteStage,
  reorderStages,
  replaceStageRoles,
  type DeletePipelineInput,
  type DeleteStageInput,
  type ReorderStagesInput,
  type ReplaceStageRolesInput,
  type StageRoleAssignment
} from "./pipeline-operations.js";
export {
  provisionWorkspace,
  type ProvisionWorkspaceInput,
  type ProvisionedWorkspace
} from "./provision-workspace.js";
export { findPersonCandidates, type PersonCandidate } from "./person.js";
export {
  FeatureDisabledError,
  assertWorkspaceFeatureEnabled,
  readWorkspaceFeatureFlags
} from "./feature-flags.js";
export {
  applyIntakePlan,
  decideAndApplyIntake,
  findOpenOpportunitiesOfPerson,
  recordLeadSubmission,
  resolveIntakeDestination,
  type AppliedIntakePlan,
  type DecideAndApplyIntakeInput,
  type DecidedAndAppliedIntake,
  type RecordLeadSubmissionInput
} from "./intake.js";
export {
  resolveIntakeReview,
  type ResolveIntakeReviewInput,
  type ResolvedIntakeReview
} from "./intake-review.js";
export {
  claimPendingIntegrationEvents,
  listIntegrationEvents,
  markIntegrationEventDispatched,
  readIntegrationEventForProcessing,
  recordIntegrationEvent,
  type IntegrationEventCursor,
  type IntegrationEventDispatchStatus,
  type IntegrationEventForProcessing,
  type IntegrationEventRecord,
  type IntegrationEventStatus,
  type ListIntegrationEventsOptions,
  type PendingIntegrationEvent,
  type RecordIntegrationEventInput,
  type RecordedIntegrationEvent
} from "./integration-event.js";
export {
  createIntegrationConnection,
  type CreateIntegrationConnectionInput,
  type CreatedIntegrationConnection
} from "./integration-connection-operations.js";
export {
  generateIntegrationToken,
  hashIntegrationToken,
  resolveWorkspaceByIntegrationToken,
  type GeneratedIntegrationToken,
  type IntegrationProvider,
  type ResolvedIntegrationWorkspace
} from "./integration-connection.js";

// --- Ticket 12: the Leads screen's named operations -----------------------
// Appended at the end, not interleaved above, because a parallel agent
// (ticket 14) edits this same file.
export { mergePersons, type MergedPersons, type MergePersonsInput } from "./person-merge.js";
export {
  assignLead,
  countLeadsByMarker,
  countNewLeads,
  getLead,
  listLeads,
  resolveIdentityConflict,
  updateLeadDetails,
  type AssignedLead,
  type AssignLeadInput,
  type FinancingType,
  type IdentityConflictResolution,
  type LeadCandidatePerson,
  type LeadDetail,
  type LeadListCursor,
  type LeadListRow,
  type LeadMarkerCounts,
  type LeadRelatedOpportunitySummary,
  type LeadReviewDetail,
  type LeadReviewMarker,
  type LeadSource,
  type ListLeadsOptions,
  type ResolvedIdentityConflict,
  type ResolveIdentityConflictInput,
  type UpdateLeadDetailsInput,
  type UpdateLeadDetailsResult
} from "./leads.js";

