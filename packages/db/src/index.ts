export { assertSafeDatabaseRole } from "./boot-check.js";
export {
  createJobContext,
  isJobContext,
  isUserContext,
  jobChannelAttemptId,
  jobChannelInboundConnectionId,
  jobIntegrationEventId,
  SCHEDULED_SWEEP_NAMES,
  withResolvedFeatureFlags,
  WorkspaceRole,
  type AccessContext,
  type CreateJobContextInput,
  type JobContext,
  type JobOrigin,
  type ScheduledSweepName,
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
  integrationTokenHashesEqual,
  resolveWorkspaceByIntegrationToken,
  type GeneratedIntegrationToken,
  type IntegrationConnectionStatus,
  type IntegrationProvider,
  type ResolvedIntegrationWorkspace,
  type WhatsAppPairingState
} from "./integration-connection.js";

// --- Ticket 12: the Leads screen's named operations -----------------------
// Appended at the end, not interleaved above, because a parallel agent
// (ticket 14) edits this same file.
export { mergePersons, type MergedPersons, type MergePersonsInput } from "./person-merge.js";
export {
  assignLead,
  assignLeads,
  countLeadsByMarker,
  countNewLeads,
  getLead,
  listLeads,
  listLeadAssignmentDestinations,
  reassignLead,
  reassignLeads,
  resolveIdentityConflict,
  updateLeadDetails,
  type AssignedLead,
  LeadAssignmentError,
  type LeadAssignmentBatchResult,
  type LeadAssignmentDestination,
  type LeadAssignmentRefusal,
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
  type ReassignLeadInput,
  type ResolvedIdentityConflict,
  type ResolveIdentityConflictInput,
  type UpdateLeadDetailsInput,
  type UpdateLeadDetailsResult
} from "./leads.js";

// ---------------------------------------------------------------------------
// Ticket 14 — Tela Integrações > Pluga. Appended at the end on purpose: a
// parallel ticket is editing this file too, and reordering the exports above
// would turn an additive change into a merge conflict neither branch caused.
// ---------------------------------------------------------------------------
export {
  getIntegrationConnectionSummary,
  rotateIntegrationConnectionSecret,
  setIntegrationConnectionStatus,
  type IntegrationConnectionSummary
} from "./integration-connection-operations.js";
export {
  getLastSuccessfulSyncAt,
  integrationEventPayloadExpiresAt,
  requeueIntegrationEventForReprocessing,
  IntegrationEventPayloadExpiredError,
  PAYLOAD_RETENTION_DAYS
} from "./integration-event.js";
export {
  getQuarantinedEvent,
  listQuarantinedEvents,
  type ListQuarantinedEventsOptions,
  type QuarantinedEvent,
  type QuarantinedEventCursor,
  type QuarantinedEventSummary
} from "./quarantine.js";

// ---------------------------------------------------------------------------
// Ticket 15 — recuperação da outbox, fila morta e expiração do payload.
// ---------------------------------------------------------------------------
export {
  listDeadLetterEvents,
  markIntegrationEventFailed,
  type DeadLetterEventCursor,
  type DeadLetterEventRecord,
  type ListDeadLetterEventsOptions
} from "./integration-event.js";
export {
  claimWorkspacesWithExpiringPayloads,
  expireIntegrationEventPayloads,
  payloadExpiryCutoff,
  type ExpirePayloadsInput,
  type ExpiringPayloadWorkspace
} from "./payload-expiry.js";

// ---------------------------------------------------------------------------
// Ticket 03a — Equipe catalog and named operations. Appended at the end so
// parallel Fase 2 tickets (01/02) that also touch this barrel stay additive.
// ---------------------------------------------------------------------------
export {
  attachWorkspaceMember,
  detachWorkspaceMember,
  listTeam,
  terminateWorkspaceMember,
  type AttachWorkspaceMemberInput,
  type AttachedWorkspaceMember,
  type DetachedWorkspaceMember,
  type TerminatedWorkspaceMembership,
  type CollaboratorRole,
  type TeamMember
} from "./team.js";

// ---------------------------------------------------------------------------
// Ticket 07 — Kanban "Meus leads". Appended at the end for the same reason as
// every block above it: additive, never interleaved.
// ---------------------------------------------------------------------------
export {
  getLeadBoard,
  moveLeadStage,
  LeadStageMoveError,
  type LeadBoard,
  type LeadBoardCard,
  type LeadBoardColumn,
  type LeadStageMoveRefusal,
  type MoveLeadStageInput,
  type MovedLeadStage
} from "./lead-board.js";

// ---------------------------------------------------------------------------
// Ticket 01 — Activity on the lead. Appended at the end so parallel Fase 3
// tickets that also touch this barrel stay additive.
// ---------------------------------------------------------------------------
export {
  cancelActivity,
  completeActivity,
  createActivity,
  listLeadActivities,
  rescheduleActivity,
  ActivityError,
  type ActivityRefusal,
  type CreateActivityInput,
  type LeadActivity,
  type RescheduleActivityInput
} from "./activities.js";

// ---------------------------------------------------------------------------
// Ticket 02 — Configurações: SLA and stagnation clocks. Appended at the end
// so parallel Fase 3 tickets that also touch this barrel stay additive.
// ---------------------------------------------------------------------------
export {
  getWorkspaceSettings,
  updateWorkspaceSettings,
  WorkspaceSettingsWriteError
} from "./workspace-settings.js";

// ---------------------------------------------------------------------------
// Ticket 06 — Agenda, a calendar view over Activity. Appended at the end so
// parallel Fase 3 tickets that also touch this barrel stay additive.
// ---------------------------------------------------------------------------
export {
  listAgenda,
  AgendaError,
  type AgendaItem,
  type AgendaPipelineOption,
  type AgendaRefusal,
  type AgendaTagOption,
  type AgendaView,
  type ListAgendaOptions
} from "./agenda.js";

// ---------------------------------------------------------------------------
// Ticket 04 — stagnation clock and movement facts. No new named operation:
// existing writes stamp last_movement_at and record the fact internally.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Ticket 07 — operational Dashboard tiles. Ticket 08 extends this same
// operation with series; do not add a second dashboard read.
// ---------------------------------------------------------------------------
export {
  getOperationalDashboard,
  OperationalDashboardError,
  type GetOperationalDashboardOptions,
  type OperationalDashboard,
  type OperationalDashboardEmptyState,
  type OperationalDashboardRefusal
} from "./operational-dashboard.js";

// ---------------------------------------------------------------------------
// Ticket 05 — lead timeline on the card. Appended at the end so parallel
// Fase 3 tickets that also touch this barrel stay additive.
// ---------------------------------------------------------------------------
export {
  listLeadTimeline,
  DEFAULT_TIMELINE_LIMIT,
  MAX_TIMELINE_LIMIT,
  type LeadTimelineFact,
  type LeadTimelinePage,
  type ListLeadTimelineOptions,
  type OpportunityTimelineEventType
} from "./lead-timeline.js";

// ---------------------------------------------------------------------------
// Ticket 09 — Notification model, clock detection and scheduled sweep.
// Appended at the end so parallel Fase 3 tickets stay additive. Ticket 10
// owns the Dashboard reading surface; mark-as-read is required here to
// prove read does not resolve.
// ---------------------------------------------------------------------------
export {
  claimWorkspacesWithOverdueOpportunities,
  sweepWorkspaceOpportunityClock,
  type OpportunityClockSweepResult,
  type OverdueOpportunityWorkspace
} from "./opportunity-clock.js";
export {
  listUnresolvedNotifications,
  markNotificationRead,
  NotificationError,
  type MarkNotificationReadInput,
  type MarkedNotificationRead,
  type NotificationRefusal,
  type UnresolvedNotification,
  type UnresolvedNotificationList
} from "./notifications.js";

// ---------------------------------------------------------------------------
// Ticket 02 — Canal: WhatsMiau connection. Appended at the end so parallel
// Fase 4 tickets that also touch this barrel stay additive.
// ---------------------------------------------------------------------------
export {
  WhatsAppConnectionError,
  commitWhatsAppWebhookSecret,
  createWhatsAppConnection,
  getWhatsAppConnection,
  setWhatsAppPairingState,
  type CreatedWhatsAppConnection,
  type WhatsAppConnectionView,
  type WhatsAppWebhookSecretCommit
} from "./whatsapp-connection.js";

// ---------------------------------------------------------------------------
// Ticket 03a — Canal: outbound attempt / Postgres outbox. Appended at the
// end so parallel Fase 4 tickets that also touch this barrel stay additive.
// ---------------------------------------------------------------------------
export {
  ChannelOutboundError,
  acceptChannelOutboundAttempt,
  beginChannelOutboundAttempt,
  claimPendingChannelAttempts,
  dispatchChannelOutboundAttempt,
  failChannelOutboundAttempt,
  getChannelOutboundAttempt,
  loadChannelOutboundSend,
  planAndRecordChannelOutboundAttempt,
  type ChannelOutboundAttemptView,
  type ChannelOutboundRefusal,
  type PendingChannelAttempt,
  type PlanChannelOutboundAttemptInput,
  type PlannedChannelOutboundAttempt
} from "./channel-outbound.js";

// ---------------------------------------------------------------------------
// Ticket 05 — Canal: inbound WhatsMiau webhook. Appended at the end so
// parallel Fase 4 tickets that also touch this barrel stay additive.
// ---------------------------------------------------------------------------
export {
  recordWhatsAppInbound,
  type RecordWhatsAppInboundInput,
  type WhatsAppInboundIgnoreReason,
  type WhatsAppInboundResult
} from "./channel-inbound.js";

