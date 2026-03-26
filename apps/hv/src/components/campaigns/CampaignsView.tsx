"use client";

import { useState, useCallback } from "react";
import type { HvCampaign } from "@/types/campaigns";
import CampaignsList from "./CampaignsList";
import CampaignDetail from "./CampaignDetail";
import CreateCampaignModal from "./CreateCampaignModal";

export default function CampaignsView() {
  const [selected, setSelected] = useState<HvCampaign | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
    setSelected(null);
    setShowCreate(false);
  }, []);

  return (
    <div>
      <CampaignsList
        key={refreshKey}
        onSelect={setSelected}
        onCreateClick={() => setShowCreate(true)}
      />

      {selected && (
        <CampaignDetail
          campaign={selected}
          onClose={() => setSelected(null)}
          onUpdated={refresh}
        />
      )}

      {showCreate && (
        <CreateCampaignModal
          onClose={() => setShowCreate(false)}
          onCreated={refresh}
        />
      )}
    </div>
  );
}
