import type {
  ContextLayer,
  Proposal,
  ProposalAction,
  ProposalConfidence,
  ProposalStatus,
  Evidence,
  RoutingEvent,
  SentinelContentType,
  SentinelVerdict,
  SentinelFlag,
  FatigueCheckResult,
  ComplianceCheckResult,
  ReviewRequest,
  ReviewResponse,
} from "@kinetiks/types";

/**
 * Auth configuration for Synapse-to-Cortex communication.
 * Service secret for server-side calls, or cookie-based for browser contexts.
 */
export interface SynapseAuthConfig {
  /** Service secret for server-to-server auth (sent as Bearer token) */
  serviceSecret?: string;
}

/**
 * Configuration for creating a Synapse instance.
 */
export interface SynapseConfig {
  /** Internal app name (e.g., 'dark_madder', 'harvest') */
  appName: string;
  /** Base URL of the Kinetiks ID product (e.g., 'https://id.kinetiks.ai') */
  baseUrl: string;
  /** Layers this Synapse can read from the Context Structure */
  readLayers: ContextLayer[];
  /** Layers this Synapse can propose changes to */
  writeLayers: ContextLayer[];
  /** Auth configuration for API calls */
  auth?: SynapseAuthConfig;
  /**
   * Filter function that decides whether app-internal data should be
   * promoted to a Proposal. Returns shouldPropose: false to block.
   */
  filterProposal: (data: Record<string, unknown>) => SynapseFilterResult;
  /** Handler called when the Cortex routes a learning to this Synapse */
  handleRoutingEvent: (event: RoutingEvent) => Promise<void>;
}

/**
 * Result of the filterProposal function.
 */
export interface SynapseFilterResult {
  shouldPropose: boolean;
  proposal?: ProposalPayload;
}

/**
 * The subset of Proposal fields a Synapse provides when submitting.
 * The server fills in id, account_id, status, submitted_at, evaluated_at, evaluated_by.
 */
export interface ProposalPayload {
  source_app: string;
  source_operator?: string;
  target_layer: ContextLayer;
  action: ProposalAction;
  confidence: ProposalConfidence;
  payload: Record<string, unknown>;
  evidence: Evidence[];
  expires_at?: string;
}

/**
 * Per-layer result returned by the pull endpoint.
 */
export interface LayerPullResult {
  data: Record<string, unknown>;
  confidence_score: number;
  source: string;
  updated_at: string;
}

/**
 * Response from POST /api/synapse/pull.
 */
export interface PullContextResult {
  layers: Partial<Record<ContextLayer, LayerPullResult | Record<string, never>>>;
}

/**
 * Evaluation result nested in the propose response.
 */
export interface ProposalEvaluation {
  status: ProposalStatus | "error";
  decline_reason: string | null;
  routed: boolean;
  error?: string;
}

/**
 * Response from POST /api/synapse/propose.
 */
export interface SubmitProposalResult {
  proposal_id: string;
  evaluation: ProposalEvaluation;
}

/**
 * Review request as submitted by a Synapse.
 * Wraps the server-side ReviewRequest but lets the Synapse provide
 * just the content - account_id and source_app are filled automatically.
 */
export interface SynapseReviewInput {
  content_type: SentinelContentType;
  content: string;
  source_operator?: string;
  contact_email?: string;
  contact_linkedin?: string;
  org_domain?: string;
  metadata?: Record<string, unknown>;
}

/**
 * The object returned by createSynapse().
 */
export interface SynapseInstance {
  /** The app this Synapse belongs to */
  appName: string;
  /** Layers this Synapse can read */
  readLayers: ContextLayer[];
  /** Layers this Synapse can write to */
  writeLayers: ContextLayer[];
  /** Pull Context Structure layers from the Kinetiks ID */
  pullContext: (accountId: string, layers?: ContextLayer[]) => Promise<PullContextResult>;
  /** Submit a Proposal to the Cortex through the filter */
  submitProposal: (
    accountId: string,
    data: Record<string, unknown>
  ) => Promise<SubmitProposalResult | { submitted: false }>;
  /** Submit content for Sentinel review before external delivery */
  submitReview: (
    accountId: string,
    input: SynapseReviewInput
  ) => Promise<ReviewResponse>;
  /** Subscribe to Realtime routing events from the Cortex */
  subscribeToRouting: (
    supabaseClient: RealtimeClient,
    accountId: string
  ) => RoutingSubscription;
  /** Direct handler for routing events */
  handleRoutingEvent: (event: RoutingEvent) => Promise<void>;
}

/**
 * Minimal interface for a Supabase client capable of Realtime subscriptions.
 * Avoids importing the full @supabase/supabase-js dependency.
 */
export interface RealtimeClient {
  channel: (name: string) => RealtimeChannel;
}

export interface RealtimeChannel {
  on: (
    type: string,
    filter: Record<string, unknown>,
    callback: (payload: { new: Record<string, unknown> }) => void
  ) => RealtimeChannel;
  subscribe: () => RealtimeChannel;
  unsubscribe: () => void;
}

/**
 * Handle to an active Realtime subscription. Call unsubscribe() to clean up.
 */
export interface RoutingSubscription {
  unsubscribe: () => void;
}
