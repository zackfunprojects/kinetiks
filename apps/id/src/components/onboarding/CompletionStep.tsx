"use client";

import { useEffect, useRef, useState } from "react";
import type { ContextFillStatus } from "@/lib/cartographer/conversation";
import { StepWrapper } from "./StepWrapper";

interface CompletionStepProps {
  codename: string;
  fromApp: string | null;
  fillStatus: ContextFillStatus | null;
  stepNumber: number;
  totalSteps: number;
}

const LAYER_LABELS: Record<string, string> = {
  org: "Organization",
  products: "Products",
  voice: "Voice & Tone",
  customers: "Customers",
  narrative: "Narrative",
  competitive: "Competitive",
  market: "Market",
  brand: "Brand",
};

const APP_DISPLAY_NAMES: Record<string, string> = {
  dark_madder: "Dark Madder",
  harvest: "Harvest",
  hypothesis: "Hypothesis",
  litmus: "Litmus",
};

const APP_URLS: Record<string, string> = {
  dark_madder: "https://dm.kinetiks.ai",
  harvest: "https://hv.kinetiks.ai",
  hypothesis: "https://ht.kinetiks.ai",
  litmus: "https://lt.kinetiks.ai",
};

function getRedirectTarget(fromApp: string | null): string {
  return fromApp && APP_URLS[fromApp] ? APP_URLS[fromApp] : "/chat";
}

function redirect(target: string): void {
  if (target.startsWith("http")) {
    window.location.href = target;
  } else {
    window.location.pathname = target;
  }
}

export function CompletionStep({
  codename,
  fromApp,
  fillStatus,
  stepNumber,
  totalSteps,
}: CompletionStepProps) {
  const [countdown, setCountdown] = useState(5);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const markedCompleteRef = useRef(false);

  useEffect(() => {
    if (markedCompleteRef.current) return;
    markedCompleteRef.current = true;

    async function markComplete() {
      try {
        const res = await fetch("/api/account/onboarding-complete", {
          method: "PATCH",
        });
        if (res.ok) {
          setReady(true);
        } else {
          setError("Failed to finalize onboarding. You can continue manually.");
          setReady(true);
        }
      } catch {
        setError("Network error. You can continue manually.");
        setReady(true);
      }
    }
    markComplete();
  }, []);

  useEffect(() => {
    if (!ready) return;

    const timer = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(timer);
          redirect(getRedirectTarget(fromApp));
          return 0;
        }
        return c - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [ready, fromApp]);

  const aggregate = fillStatus?.aggregate ?? 0;
  const layers = (fillStatus?.layers ?? {}) as Record<
    string,
    { filled: number; total: number; percentage: number }
  >;

  const displayName = fromApp ? APP_DISPLAY_NAMES[fromApp] : null;
  const continueLabel = displayName
    ? `Go to ${displayName}`
    : "Continue";

  return (
    <StepWrapper
      stepNumber={stepNumber}
      totalSteps={totalSteps}
      title="Your Kinetiks ID is ready"
      onContinue={() => redirect(getRedirectTarget(fromApp))}
      continueLabel={continueLabel}
      continueDisabled={!ready}
    >
      <div className="text-center">
        {/* Codename */}
        <div
          className="mb-4 inline-block rounded px-4 py-1.5 text-sm font-semibold"
          style={{
            background: "var(--accent-muted)",
            color: "var(--accent)",
            fontFamily: "var(--font-mono), monospace",
          }}
        >
          {">"} {codename}
        </div>

        {/* Aggregate score */}
        <div className="flex items-center justify-center gap-2">
          <span
            className="text-3xl font-bold"
            style={{ color: "var(--accent)", fontFamily: "var(--font-mono), monospace" }}
          >
            {aggregate}%
          </span>
          <span className="text-sm" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono), monospace" }}>
            confidence
          </span>
        </div>
      </div>

      {/* Layer breakdown */}
      <div className="mt-6 space-y-2">
        {Object.entries(layers).map(([key, val]) => (
          <div key={key} className="flex items-center gap-3">
            <span
              className="w-24 text-xs"
              style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono), monospace" }}
            >
              {LAYER_LABELS[key] ?? key}
            </span>
            <div className="flex-1">
              <div
                className="h-1.5 overflow-hidden rounded-full"
                style={{ background: "var(--border-default)" }}
              >
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${val.percentage}%`, background: "var(--accent)" }}
                />
              </div>
            </div>
            <span
              className="w-8 text-right text-xs"
              style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono), monospace" }}
            >
              {val.percentage}%
            </span>
          </div>
        ))}
      </div>

      {error && (
        <p className="mt-4 text-center text-xs" style={{ color: "var(--error)" }}>{error}</p>
      )}

      <p className="mt-4 text-center text-xs" style={{ color: "var(--text-tertiary)" }}>
        To improve your ID further, connect GA4, upload brand assets, or chat with Marcus.
      </p>

      <p className="mt-2 text-center text-xs" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono), monospace" }}>
        {ready
          ? `Redirecting in ${countdown}s...`
          : "Finalizing your profile..."}
      </p>
    </StepWrapper>
  );
}
