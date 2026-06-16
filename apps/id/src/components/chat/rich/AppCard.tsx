"use client";

import { Button, Card } from "@kinetiks/ui";

export interface AppCardProps {
  appName: string;
  description: string;
  rationale?: string;
  /** Activate the app from Chat (spec §A.5 one-step activation). */
  onActivate?: (appName: string) => void;
}

/**
 * Recommends a suite-app activation inline in Chat (spec-addendum-chat-ux §B.5
 * "App cards"). Strategic advice, never a hard sell — the rationale is the
 * user-specific reason this app fits.
 */
export function AppCard({ appName, description, rationale, onActivate }: AppCardProps) {
  const title = appName.charAt(0).toUpperCase() + appName.slice(1);
  return (
    <Card variant="muted" style={{ marginTop: "var(--kt-s-3)" }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: "var(--kt-s-3)",
        }}
      >
        <span
          style={{
            fontFamily: "var(--kt-font-serif)",
            fontSize: "var(--kt-fs-15)",
            color: "var(--kt-fg-1)",
          }}
        >
          {title}
        </span>
        {onActivate && (
          <Button variant="secondary" size="sm" onClick={() => onActivate(appName)}>
            Activate
          </Button>
        )}
      </div>

      <p
        style={{
          margin: "var(--kt-s-2) 0 0",
          fontSize: "var(--kt-fs-14)",
          lineHeight: "var(--kt-lh-body)",
          color: "var(--kt-fg-2)",
        }}
      >
        {description}
      </p>

      {rationale && (
        <p
          style={{
            margin: "var(--kt-s-2) 0 0",
            fontSize: "var(--kt-fs-13)",
            lineHeight: "var(--kt-lh-body)",
            color: "var(--kt-fg-3)",
          }}
        >
          {rationale}
        </p>
      )}
    </Card>
  );
}
