"use client";

import { useEffect, useRef, useState } from "react";
import type { ContextFillStatus } from "@/lib/cartographer/conversation";

interface CompletionStepProps {
  codename: string;
  fromApp: string | null;
  fillStatus: ContextFillStatus | null;
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

const APP_URLS: Record<string, string> = {
  dark_madder: "https://dm.kinetiks.ai",
  harvest: "https://hv.kinetiks.ai",
  hypothesis: "https://ht.kinetiks.ai",
  litmus: "https://lt.kinetiks.ai",
};

function getRedirectTarget(fromApp: string | null): string {
  return fromApp && APP_URLS[fromApp] ? APP_URLS[fromApp] : "/";
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

  // Start countdown only after PATCH completes
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

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="w-full max-w-lg rounded-2xl bg-white p-10 text-center shadow-sm">
        <div className="mb-6 inline-block rounded-full bg-[#f0eeff] px-4 py-1.5 text-sm font-semibold text-[#6C5CE7]">
          {codename}
        </div>

        <h1 className="text-2xl font-bold text-gray-900">
          Your Kinetiks ID is ready
        </h1>

        <div className="mt-4 flex items-center justify-center gap-2">
          <span className="text-3xl font-bold text-[#6C5CE7]">
            {aggregate}%
          </span>
          <span className="text-sm text-gray-400">confidence</span>
        </div>

        <div className="mt-6 space-y-2 text-left">
          {Object.entries(layers).map(([key, val]) => (
            <div key={key} className="flex items-center gap-3">
              <span className="w-24 text-xs text-gray-500">
                {LAYER_LABELS[key] ?? key}
              </span>
              <div className="flex-1">
                <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full bg-[#6C5CE7] transition-all"
                    style={{ width: `${val.percentage}%` }}
                  />
                </div>
              </div>
              <span className="w-8 text-right text-xs text-gray-400">
                {val.percentage}%
              </span>
            </div>
          ))}
        </div>

        {error && (
          <p className="mt-4 text-xs text-red-400">{error}</p>
        )}

        <p className="mt-6 text-xs text-gray-400">
          To improve your ID further, connect GA4, upload brand assets, or chat
          with Marcus.
        </p>

        <button
          onClick={() => redirect(getRedirectTarget(fromApp))}
          disabled={!ready}
          className="mt-6 w-full rounded-lg bg-[#6C5CE7] py-3 text-sm font-semibold text-white transition-colors hover:bg-[#5b4bd6] disabled:opacity-50"
        >
          {fromApp
            ? `Go to ${fromApp.replace("_", " ")}`
            : "Go to dashboard"}
        </button>

        <p className="mt-3 text-xs text-gray-400">
          {ready
            ? `Redirecting in ${countdown}s...`
            : "Finalizing your profile..."}
        </p>
      </div>
    </div>
  );
}
