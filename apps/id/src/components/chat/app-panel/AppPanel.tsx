"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@kinetiks/ui";
import { frameKey, type FrameDescriptor } from "@kinetiks/collaborative";
import type { AppPanelTarget, PanelStep } from "./AppPanelContext";
import { PanelBreadcrumb } from "./PanelBreadcrumb";
import { PanelFrame } from "./PanelFrame";
import { usePanelFrameCache } from "./usePanelFrameCache";
import { useMediaQuery, WIDE_VIEWPORT_QUERY } from "@/lib/hooks/useMediaQuery";

interface AppPanelProps {
  target: AppPanelTarget;
  threadId?: string;
  accountId: string;
  onClose: () => void;
}

function toDescriptor(app: string, entity?: string): FrameDescriptor {
  return { key: frameKey(app, entity), app, entity };
}

/**
 * The app panel (spec §4 + §10.4 + §14.3). Mounts each app surface via
 * `PanelFrame` (a `<webview>` on the desktop shell, an `<iframe>` on the web),
 * kept warm in a ≤3 LRU cache so a breadcrumb switch is instant. For a
 * multi-app orchestration the header shows a breadcrumb and, on wide viewports,
 * a side-by-side toggle; the presence layer renders inside each frame.
 */
export function AppPanel({ target, threadId, accountId, onClose }: AppPanelProps) {
  const steps = target.steps ?? [];
  const multiApp = steps.length > 1;
  const canShowBoth = useMediaQuery(WIDE_VIEWPORT_QUERY) && multiApp;

  const [activeApp, setActiveApp] = useState(target.app);
  const [showBoth, setShowBoth] = useState(false);
  // Clamp: side-by-side only renders while the viewport supports it.
  const sideBySide = showBoth && canShowBoth;

  // Reset the active app when the target changes.
  useEffect(() => {
    setActiveApp(target.app);
    setShowBoth(false);
  }, [target]);

  const activeStep: PanelStep | undefined = multiApp
    ? steps.find((s) => s.app === activeApp) ?? steps[0]
    : undefined;
  const partnerStep: PanelStep | undefined = sideBySide
    ? steps.find((s) => s.app !== (activeStep?.app ?? activeApp))
    : undefined;

  const label = target.entity ? `${target.app} · ${target.entity}` : target.app;

  // ── LRU frame cache (§14.3) ──
  const activeDesc = toDescriptor(activeStep?.app ?? target.app, activeStep?.entity ?? target.entity);
  const partnerDesc = partnerStep ? toDescriptor(partnerStep.app, partnerStep.entity) : null;
  const visibleDescriptors = partnerDesc ? [activeDesc, partnerDesc] : [activeDesc];
  const visibleKeys = new Set(visibleDescriptors.map((d) => d.key));

  // Orchestration identity — reset the cache when the command changes.
  const targetId = useMemo(() => {
    const ts = target.steps ?? [];
    return ts.length
      ? ts.map((s) => frameKey(s.app, s.entity)).join("|")
      : frameKey(target.app, target.entity);
  }, [target]);
  const cached = usePanelFrameCache(targetId, visibleDescriptors);

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
            showBoth={sideBySide}
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
        {cached.map((desc) => (
          <PanelFrame
            key={desc.key}
            app={desc.app}
            entity={desc.entity}
            mode={target.mode}
            threadId={threadId}
            accountId={accountId}
            visible={visibleKeys.has(desc.key)}
            order={desc.key === activeDesc.key ? 0 : desc.key === partnerDesc?.key ? 1 : 2}
          />
        ))}
      </div>
    </div>
  );
}
