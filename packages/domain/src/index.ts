export {
  createMemoryRateLimiter,
  checkSuspiciousRequestLimit,
  type RateLimitDecision,
  type RateLimiter,
  type SuspiciousRequest
} from "./rate-limit.js";
export {
  describeFailureReason,
  sanitizeTelemetry,
  type SafeTelemetry
} from "./telemetry.js";
export {
  INTEGRATION_EVENT_JOB,
  INTEGRATION_EVENT_QUEUE,
  integrationEventJobId,
  type IntegrationEventJobData
} from "./ingestion-jobs.js";
export {
  CHANNEL_OUTBOUND_INITIAL_DELAY_MS,
  CHANNEL_OUTBOUND_JOB,
  CHANNEL_OUTBOUND_QUEUE,
  CHANNEL_OUTBOUND_RATE_LIMIT_MAX,
  CHANNEL_OUTBOUND_RATE_LIMIT_WINDOW_MS,
  channelOutboundJobId,
  type ChannelOutboundJobData
} from "./channel-jobs.js";
export {
  WHATSMIAU_API_BASE_URL,
  buildWhatsMiauSendTextRequest,
  classifySendTextFailure,
  whatsMiauDigitsFromE164,
  type MessagingProvider,
  type SendTextResult,
  type WhatsMiauSendTextRequest
} from "./messaging-provider.js";
export {
  CONTRACT_VERSION,
  LEAD_SOURCES,
  MAX_EXTERNAL_LEAD_ID_LENGTH,
  buildInboundLead,
  inboundLeadSchema,
  isLeadSource,
  readLeadPayload,
  type InboundLead,
  type LeadPayloadReading,
  type LeadSource
} from "./intake/inbound-lead.js";
export {
  FINANCING_TYPES,
  normalize,
  type FinancingType,
  type NormalizationDiagnostic,
  type NormalizedLead
} from "./intake/normalize.js";
export { normalizeCpf } from "./intake/cpf.js";
export { normalizeEmail } from "./intake/email.js";
export { normalizeDecimalAmount } from "./intake/money.js";
export {
  DEFAULT_PHONE_COUNTRY,
  normalizePhone,
  readPhone,
  type PhoneReading
} from "./intake/phone.js";
export {
  PERSON_LOOKUP_KEY_KINDS,
  PERSON_LOOKUP_STRENGTHS,
  PERSON_LOOKUP_STRENGTH_BY_KIND,
  lookupValuesOfKind,
  planPersonLookup,
  type PersonLookupKey,
  type PersonLookupKeyKind,
  type PersonLookupPlan,
  type PersonLookupStrength
} from "./intake/person-lookup.js";
export {
  decidePersonIdentity,
  type DecidePersonIdentityInput,
  type PersonCandidate,
  type PersonContacts,
  type PersonDecision
} from "./intake/person-identity.js";
export {
  decideIntake,
  planSubmission,
  reusedPersonId,
  type DecideIntakeInput,
  type IntakeDestination,
  type IntakePlan,
  type IntakeReviewPlan,
  type SubmissionInsert,
  type SubmissionKey
} from "./intake/intake-plan.js";
export {
  markersFor,
  MARKERS,
  type Marker,
  type MarkerOpportunity,
  type MarkerReview,
  type TableMarker
} from "./markers.js";
export {
  FIRST_CONTACT_SLA_STATES,
  FirstContactSlaError,
  firstContactSla,
  type FirstContactSla,
  type FirstContactSlaInput,
  type FirstContactSlaOpportunityStatus,
  type FirstContactSlaRefusal,
  type FirstContactSlaState
} from "./first-contact-sla.js";
export {
  STAGNATION_STATES,
  stagnation,
  type Stagnation,
  type StagnationInput,
  type StagnationOpportunityStatus,
  type StagnationState
} from "./stagnation.js";
export {
  POSSIBLE_DUPLICATE_RESOLUTIONS,
  planPossibleDuplicateResolution,
  type PlanPossibleDuplicateResolutionInput,
  type PossibleDuplicateResolution,
  type PossibleDuplicateResolutionPlan
} from "./intake/intake-review-resolution.js";
export {
  PIPELINE_TYPES,
  STAGE_ROLES,
  assertPipelineDefinition,
  assertPipelineStageInvariants,
  defaultCommercialPipeline,
  type PipelineDefinition,
  type PipelineInvariantStage,
  type PipelineType,
  type StageDefinition,
  type StageRole
} from "./pipelines.js";
export { teamUserIds, type TeamScopeMember } from "./team-scope.js";
export {
  decideLeadAssignment,
  decideLeadReassignment,
  type AssignmentDecision,
  type AssignmentMember,
  type AssignmentRole
} from "./lead-assignment.js";
export {
  decideLeadStageMove,
  type StageMoveDecision,
  type StageMoveDestination,
  type StageMoveOpportunity,
  type StageMoveStatus
} from "./lead-stage-move.js";
export {
  ACTIVITY_STATUSES,
  ACTIVITY_TYPES,
  activityAssigneeUserIds,
  decideActivityCreate,
  decideActivityTransition,
  isActivityOverdue,
  isActivityType,
  memberReachesOpportunity,
  type ActivityActorRole,
  type ActivityAssigneeMember,
  type ActivityCreateDecision,
  type ActivityCreateRefusal,
  type ActivityStatus,
  type ActivityTransitionAction,
  type ActivityTransitionDecision,
  type ActivityTransitionRefusal,
  type ActivityType
} from "./activity.js";
export {
  AGENDA_DUE_FILTERS,
  AGENDA_VIEWS,
  MAX_AGENDA_RANGE_MS,
  agendaBoundsForView,
  isAgendaView,
  parseAgendaDueFilter,
  parseAgendaInterval,
  shiftAgendaDate,
  todayAgendaDate,
  type AgendaDueFilter,
  type AgendaIntervalDecision,
  type AgendaIntervalRefusal,
  type AgendaViewKind
} from "./agenda.js";
export {
  LEAD_CLOCK_FILTERS,
  parseLeadClockFilter,
  type LeadClockFilter
} from "./lead-clock-filter.js";
export {
  DEFAULT_FIRST_CONTACT_SLA_MINUTES,
  DEFAULT_STAGNATION_DAYS,
  MAX_FIRST_CONTACT_SLA_MINUTES,
  MAX_STAGNATION_DAYS,
  canWriteWorkspaceSettings,
  parseWorkspaceSettingsWrite,
  resolveWorkspaceSettings,
  workspaceSettingsWriteSchema,
  type ResolvedWorkspaceSettings,
  type StoredWorkspaceSettings,
  type WorkspaceSettingsWrite,
  type WorkspaceSettingsWriteParse
} from "./workspace-settings.js";
export {
  DEFAULT_FIRST_CONTACT_TEMPLATE_BODY,
  DEFAULT_FIRST_CONTACT_TRIGGER,
  FIRST_CONTACT_TRIGGERS,
  isFirstContactTrigger,
  parseFirstContactTemplate,
  planFirstContactDispatch,
  renderFirstContactTemplate,
  templateVariablesFor,
  type FirstContactDispatchPlan,
  type FirstContactDispatchRefusal,
  type FirstContactRender,
  type FirstContactTemplateParse,
  type FirstContactTrigger
} from "./first-contact.js";
export {
  CHANNEL_OUTBOUND_DELIVERY_STATUSES,
  CHANNEL_OUTBOUND_DISPATCH_LEASE_MS,
  CHANNEL_OUTBOUND_DISPATCH_STATUSES,
  CHANNEL_OUTBOUND_FAILURE_REASONS,
  CHANNEL_OUTBOUND_KIND,
  CHANNEL_OUTBOUND_PROCESSING_LEASE_MS,
  decideChannelOutboundTransition,
  planFirstContactAttempt,
  prepareChannelOutboundSend,
  type ChannelOutboundDeliveryStatus,
  type ChannelOutboundDispatchStatus,
  type ChannelOutboundFailureReason,
  type ChannelOutboundKind,
  type ChannelOutboundSendPayload,
  type ChannelOutboundTransitionAction,
  type ChannelOutboundTransitionDecision,
  type ChannelOutboundTransitionRefusal,
  type FirstContactAttemptPlan,
  type FirstContactAttemptRefusal,
  type PreparedChannelOutboundSend
} from "./channel-outbound.js";
export {
  INBOUND_MESSAGE_PREVIEW_MAX_CHARS,
  parseWhatsMiauWebhookEnvelope,
  type WhatsMiauInboundIgnoreReason,
  type WhatsMiauWebhookParse
} from "./channel-inbound.js";
export {
  WHATSAPP_PAIRING_STATES,
  WHATSMIAU_CREATE_INSTANCE_DEFAULTS,
  WHATSMIAU_WEBHOOK_EVENTS,
  buildWhatsMiauCreateInstanceBody,
  buildWhatsMiauWebhookSetBody,
  isPublicHttpsWebhookUrl,
  isWhatsAppPairingState,
  parseWhatsAppConnectPayload,
  parseWhatsAppFetchInstancesPayload,
  parseWhatsAppPairingState,
  whatsAppInstanceNameFor,
  type WhatsAppConnectReading,
  type WhatsAppFetchedInstance,
  type WhatsAppPairingState
} from "./whatsapp-pairing.js";
export {
  CATEGORICAL_CHART_COLOR_COUNT,
  OPERATIONAL_DASHBOARD_RECENT_DAYS,
  OPERATIONAL_DASHBOARD_TILE_IDS,
  OPERATIONAL_DASHBOARD_TIME_ZONE,
  buildOperationalDashboardSeries,
  buildOperationalDashboardTiles,
  calendarDateKey,
  canReadOperationalDashboard,
  canSeeUnassignedQueueOnDashboard,
  categoricalChartToken,
  operationalDashboardTileDestination,
  operationalDashboardWindowDays,
  operationalDashboardWindowStart,
  startOfZonedDay,
  type ArrivalDayPoint,
  type CategoricalChartToken,
  type DashboardSeriesOpportunity,
  type DashboardStage,
  type OpenByStagePoint,
  type OperationalDashboardCounts,
  type OperationalDashboardDestination,
  type OperationalDashboardEmptyReason,
  type OperationalDashboardScreen,
  type OperationalDashboardSeries,
  type OperationalDashboardTile,
  type OperationalDashboardTileId,
  type SlaAdherenceDayPoint
} from "./operational-dashboard.js";
export {
  canActOnManagementNotifications,
  clockNotificationTypes,
  NOTIFICATION_TYPES,
  type ClockNotificationOpportunity,
  type NotificationType
} from "./notifications.js";
