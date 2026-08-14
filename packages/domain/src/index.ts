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
  type MarkerReview
} from "./markers.js";
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
