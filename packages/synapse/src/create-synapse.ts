import type { SynapseConfig } from "./types";

export function createSynapse(config: SynapseConfig) {
  return {
    appName: config.appName,
    readLayers: config.readLayers,
    writeLayers: config.writeLayers,

    async pullContext(accountId: string) {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_APP_URL}/api/synapse/pull`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            account_id: accountId,
            app_name: config.appName,
            layers: config.readLayers,
          }),
        }
      );
      return response.json();
    },

    async submitProposal(accountId: string, data: Record<string, unknown>) {
      const filterResult = config.filterProposal(data);
      if (!filterResult.shouldPropose || !filterResult.proposal) {
        return { submitted: false };
      }

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_APP_URL}/api/synapse/propose`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            account_id: accountId,
            ...filterResult.proposal,
          }),
        }
      );
      return response.json();
    },

    handleRoutingEvent: config.handleRoutingEvent,
  };
}
