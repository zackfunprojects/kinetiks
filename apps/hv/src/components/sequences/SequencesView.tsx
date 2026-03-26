"use client";

import { useState, useCallback } from "react";
import type { HvSequence } from "@/types/sequences";
import SequencesList from "./SequencesList";
import SequenceDetail from "./SequenceDetail";
import CreateSequenceModal from "./CreateSequenceModal";

export default function SequencesView() {
  const [selected, setSelected] = useState<HvSequence | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
    setSelected(null);
    setShowCreate(false);
  }, []);

  return (
    <div>
      <SequencesList
        key={refreshKey}
        onSelect={setSelected}
        onCreateClick={() => setShowCreate(true)}
      />

      {selected && (
        <SequenceDetail
          sequence={selected}
          onClose={() => setSelected(null)}
          onUpdated={refresh}
        />
      )}

      {showCreate && (
        <CreateSequenceModal
          onClose={() => setShowCreate(false)}
          onCreated={refresh}
        />
      )}
    </div>
  );
}
