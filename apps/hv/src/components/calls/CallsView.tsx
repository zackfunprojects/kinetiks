"use client";

import { useState, useCallback } from "react";
import type { HvCall } from "@/types/calls";
import CallsList from "./CallsList";
import CallDetail from "./CallDetail";
import LogCallModal from "./LogCallModal";

export default function CallsView() {
  const [selected, setSelected] = useState<HvCall | null>(null);
  const [showLog, setShowLog] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
    setSelected(null);
    setShowLog(false);
  }, []);

  return (
    <div>
      <CallsList
        key={refreshKey}
        onSelect={setSelected}
        onLogClick={() => setShowLog(true)}
      />

      {selected && (
        <CallDetail
          call={selected}
          onClose={() => setSelected(null)}
          onUpdated={refresh}
        />
      )}

      {showLog && (
        <LogCallModal
          onClose={() => setShowLog(false)}
          onCreated={refresh}
        />
      )}
    </div>
  );
}
