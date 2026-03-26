"use client";

import { useState, useCallback } from "react";
import type { InboxEmail } from "@/types/inbox";
import InboxList from "./InboxList";
import InboxDetail from "./InboxDetail";

export default function InboxView() {
  const [selected, setSelected] = useState<InboxEmail | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
    setSelected(null);
  }, []);

  return (
    <div>
      <InboxList
        key={refreshKey}
        onSelect={setSelected}
      />

      {selected && (
        <InboxDetail
          email={selected}
          onClose={() => setSelected(null)}
          onUpdated={refresh}
        />
      )}
    </div>
  );
}
