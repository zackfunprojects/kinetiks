import type { ContextLayer, ReviewResponse, RoutingEvent } from "@kinetiks/types";
import type {
  SynapseConfig,
  SynapseInstance,
  SynapseReviewInput,
  PullContextResult,
  SubmitProposalResult,
  RoutingSubscription,
  RealtimeClient,
} from "./types";

/**
 * Error thrown when a Synapse API call fails.
 */
export class SynapseError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly endpoint: string
  ) {
    super(message);
    this.name = "SynapseError";
  }
}

/**
 * Build the headers for Synapse API requests.
 */
function buildHeaders(config: SynapseConfig): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (config.auth?.serviceSecret) {
    headers["Authorization"] = `Bearer ${config.auth.serviceSecret}`;
  }

  return headers;
}

/**
 * Create a Synapse instance for an app.
 *
 * The Synapse is the membrane between an app and the Kinetiks ID.
 * It pulls context, submits proposals through a filter, and listens
 * for routing events from the Cortex.
 *
 * @example
 * ```ts
 * const synapse = createSynapse({
 *   appName: 'dark_madder',
 *   baseUrl: 'https://id.kinetiks.ai',
 *   readLayers: ['org', 'products', 'voice', 'customers', 'narrative', 'brand'],
 *   writeLayers: ['voice', 'customers', 'narrative'],
 *   auth: { serviceSecret: process.env.INTERNAL_SERVICE_SECRET },
 *   filterProposal: (data) => { ... },
 *   handleRoutingEvent: async (event) => { ... },
 * });
 *
 * const context = await synapse.pullContext('account-uuid');
 * ```
 */
export function createSynapse(config: SynapseConfig): SynapseInstance {
  const headers = buildHeaders(config);

  return {
    appName: config.appName,
    readLayers: config.readLayers,
    writeLayers: config.writeLayers,

    async pullContext(
      accountId: string,
      layers?: ContextLayer[]
    ): Promise<PullContextResult> {
      const requestedLayers = layers ?? config.readLayers;
      const endpoint = `${config.baseUrl}/api/synapse/pull`;

      const response = await fetch(endpoint, {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify({
          account_id: accountId,
          app_name: config.appName,
          layers: requestedLayers,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        const message =
          (errorBody as Record<string, string>).error ??
          `Pull failed with status ${response.status}`;
        throw new SynapseError(message, response.status, endpoint);
      }

      return response.json() as Promise<PullContextResult>;
    },

    async submitProposal(
      accountId: string,
      data: Record<string, unknown>
    ): Promise<SubmitProposalResult | { submitted: false }> {
      const filterResult = config.filterProposal(data);

      if (!filterResult.shouldPropose || !filterResult.proposal) {
        return { submitted: false };
      }

      const endpoint = `${config.baseUrl}/api/synapse/propose`;

      const response = await fetch(endpoint, {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify({
          account_id: accountId,
          ...filterResult.proposal,
          source_app: config.appName,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        const message =
          (errorBody as Record<string, string>).error ??
          `Propose failed with status ${response.status}`;
        throw new SynapseError(message, response.status, endpoint);
      }

      return response.json() as Promise<SubmitProposalResult>;
    },

    async submitReview(
      accountId: string,
      input: SynapseReviewInput
    ): Promise<ReviewResponse> {
      const endpoint = `${config.baseUrl}/api/sentinel/review`;

      const response = await fetch(endpoint, {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify({
          account_id: accountId,
          source_app: config.appName,
          source_operator: input.source_operator,
          content_type: input.content_type,
          content: input.content,
          contact_email: input.contact_email,
          contact_linkedin: input.contact_linkedin,
          org_domain: input.org_domain,
          metadata: input.metadata,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        const message =
          (errorBody as Record<string, string>).error ??
          `Review failed with status ${response.status}`;
        throw new SynapseError(message, response.status, endpoint);
      }

      return response.json() as Promise<ReviewResponse>;
    },

    subscribeToRouting(
      supabaseClient: RealtimeClient,
      accountId: string
    ): RoutingSubscription {
      const channelName = `synapse:${config.appName}:${accountId}`;

      const channel = supabaseClient
        .channel(channelName)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "kinetiks_routing_events",
            filter: `target_app=eq.${config.appName}&account_id=eq.${accountId}`,
          },
          (payload) => {
            const event = payload.new as unknown as RoutingEvent;

            // Only process events for this account
            if (event.account_id !== accountId) return;

            config.handleRoutingEvent(event).catch((err) => {
              console.error(
                `[Synapse:${config.appName}] Failed to handle routing event:`,
                err
              );
            });
          }
        )
        .subscribe();

      return {
        unsubscribe: () => {
          channel.unsubscribe();
        },
      };
    },

    handleRoutingEvent: config.handleRoutingEvent,
  };
}
