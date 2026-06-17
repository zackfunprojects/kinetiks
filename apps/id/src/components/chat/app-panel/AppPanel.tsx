"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@kinetiks/ui";
import type { AppPanelTarget, PanelStep } from "./AppPanelContext";
import { PanelBreadcrumb } from "./PanelBreadcrumb";
import { useMediaQuery } from "@/lib/hooks/useMediaQuery";

interface AppPanelProps {
  target: AppPanelTarget;
  threadId?: string;
  accountId: string;
  onClose: () => void;
}

/** One embedded surface: same-origin `/embed` iframe + skeleton (§14.2). */
function EmbedFrame({
  app,
  entity,
  mode,
  threadId,
  accountId,
}: {
  app: string;
  entity?: string;
  mode: AppPanelTarget["mode"];
  threadId?: string;
  accountId: string;
}) {
  const [loaded, setLoaded] = useState(false);
  const src = useMemo(() => {
    const params = new URLSearchParams({ mode, account: accountId });
    if (app) params.set("app", app);
    if (entity) params.set("entity", entity);
    if (threadId) params.set("thread", threadId);
    return `/embed?${params.toString()}`;
  }, [app, entity, mode, threadId, accountId]);

  useEffect(() => {
    setLoaded(false);
  }, [src]);

  return (
    <div style={{ position: "relative", flex: 1, minHeight: 0, minWidth: 0 }}>
      {!loaded && (
        <div
          aria-busy="true"
          aria-live="polite"
          aria-label="Loading workspace"
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--kt-fg-3)",
            fontSize: "var(--kt-fs-13)",
          }}
        >
          Loading workspace…
        </div>
      )}
      <iframe
        src={src}
        title={`App panel — ${app}`}
        onLoad={() => setLoaded(true)}
        style={{
          border: "none",
          width: "100%",
          height: "100%",
          display: "block",
          opacity: loaded ? 1 : 0,
          transition: "opacity var(--kt-dur-2) ease",
        }}
      />
    </div>
  );
}

/**
 * The app panel (spec §4 + §10.4). Mounts the reference surface as a same-origin
 * `/embed` iframe. For a multi-app orchestration the header shows a breadcrumb
 * and, on wide viewports, a side-by-side toggle; the presence layer renders
 * inside each frame (8.3+).
 */
export function AppPanel({ target, threadId, accountId, onClose }: AppPanelProps) {
  const steps = target.steps ?? [];
  const multiApp = steps.length > 1;
  const canShowBoth = useMediaQuery("(min-width: 1280px)") && multiApp;

  const [activeApp, setActiveApp] = useState(target.app);
  const [showBoth, setShowBoth] = useState(false);

  // Reset the active app when the target changes.
  useEffect(() => {
    setActiveApp(target.app);
    setShowBoth(false);
  }, [target]);

  const activeStep: PanelStep | undefined = multiApp
    ? steps.find((s) => s.app === activeApp) ?? steps[0]
    : undefined;
  const partnerStep: PanelStep | undefined =
    showBoth && multiApp
      ? steps.find((s) => s.app !== (activeStep?.app ?? activeApp))
      : undefined;

  const label = target.entity ? `${target.app} · ${target.entity}` : target.app;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        borderLeft: "1px solid var(--kt-border-2)",
        backgroundColor: "var(--kt-bg-base)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--kt-s-2)",
          padding: "var(--kt-s-2) var(--kt-s-3)",
          borderBottom: "1px solid var(--kt-border-2)",
        }}
      >
        {multiApp ? (
          <PanelBreadcrumb
            steps={steps}
            current={activeStep?.app ?? activeApp}
            onSelect={(s) => setActiveApp(s.app)}
            showBoth={showBoth}
            onToggleBoth={() => setShowBoth((v) => !v)}
            canShowBoth={canShowBoth}
          />
        ) : (
          <span
            className="kt-data-inline"
            style={{
              fontSize: "var(--kt-fs-12)",
              color: "var(--kt-fg-2)",
              fontFamily: "var(--kt-font-mono)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {label}
          </span>
        )}
        <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close panel">
          Close
        </Button>
      </div>

      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <EmbedFrame
          app={activeStep?.app ?? target.app}
          entity={activeStep?.entity ?? target.entity}
          mode={target.mode}
          threadId={threadId}
          accountId={accountId}
        />
        {partnerStep && (
          <EmbedFrame
            app={partnerStep.app}
            entity={partnerStep.entity}
            mode={target.mode}
            threadId={threadId}
            accountId={accountId}
          />
        )}
      </div>
    </div>
  );
}
