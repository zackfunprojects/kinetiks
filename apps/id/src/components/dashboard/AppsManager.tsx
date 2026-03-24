"use client";

import { useState } from "react";
import type { AppActivation, SynapseRecord } from "@kinetiks/types";
import { APP_REGISTRY } from "@/lib/utils/app-registry";
import { AppDetailCard } from "./AppDetailCard";

interface AppsManagerProps {
  initialActivations: AppActivation[];
  synapses: SynapseRecord[];
}

export function AppsManager({
  initialActivations,
  synapses,
}: AppsManagerProps) {
  const [activations, setActivations] = useState(initialActivations);

  function handleActivate(appName: string) {
    setActivations((prev) => {
      const existing = prev.find((a) => a.app_name === appName);

      if (existing) {
        return prev.map((a) =>
          a.app_name === appName
            ? { ...a, status: "active" as const, activated_at: new Date().toISOString() }
            : a
        );
      }
      return [
        ...prev,
        {
          id: crypto.randomUUID(),
          account_id: "",
          app_name: appName,
          status: "active",
          activated_at: new Date().toISOString(),
        } as AppActivation,
      ];
    });
  }

  const apps = Object.values(APP_REGISTRY);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))",
        gap: 16,
      }}
    >
      {apps.map((app) => {
        const activation = activations.find((a) => a.app_name === app.name) ?? null;
        const synapse = synapses.find((s) => s.app_name === app.name) ?? null;
        return (
          <AppDetailCard
            key={app.name}
            appName={app.name}
            displayName={app.displayName}
            description={app.description}
            url={app.url}
            color={app.color}
            activation={activation}
            synapse={synapse}
            onActivate={handleActivate}
          />
        );
      })}
    </div>
  );
}
