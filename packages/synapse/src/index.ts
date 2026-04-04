export type {
  SynapseConfig,
  SynapseAuthConfig,
  SynapseFilterResult,
  SynapseInstance,
  SynapseReviewInput,
  ProposalPayload,
  LayerPullResult,
  PullContextResult,
  ProposalEvaluation,
  SubmitProposalResult,
  RealtimeClient,
  RealtimeChannel,
  RoutingSubscription,
} from "./types";

export { createSynapse, SynapseError } from "./create-synapse";
export { validateProposalPayload, validateLayers } from "./validate";
export type { PayloadValidation } from "./validate";

export { createDarkMadderConfig, DM_CONTENT_TYPE_MAP } from "./presets";
export { createHarvestConfig, HV_CONTENT_TYPE_MAP } from "./presets";

// Command system
export type {
  CommandType,
  CapabilityDefinition,
  ParameterSchema,
  SynapseCapabilities,
  SynapseCommand,
  CommandContext,
  CommandResponse,
  CommandProgress,
} from "./command-types";
export { BaseCommandHandler } from "./command-handler";
