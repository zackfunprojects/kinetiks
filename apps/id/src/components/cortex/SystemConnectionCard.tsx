import { Card, StatusPill } from "@kinetiks/ui";

interface SystemConnectionCardProps {
  label: string;
  connected: boolean;
  /** Shown when connected (e.g. the linked address / workspace). */
  detail?: string | null;
  /** Shown when not connected (how to wire it up). */
  description: string;
}

export function SystemConnectionCard({ label, connected, detail, description }: SystemConnectionCardProps) {
  return (
    <Card variant="muted">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--kt-s-2)" }}>
        <span className="kt-card-title">{label}</span>
        <StatusPill tone={connected ? "success" : "neutral"}>{connected ? "Connected" : "Not connected"}</StatusPill>
      </div>
      <p className="kt-small" style={{ margin: 0 }}>
        {connected && detail ? detail : description}
      </p>
    </Card>
  );
}
