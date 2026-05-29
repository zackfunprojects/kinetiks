"use client";

import { useEffect, useState, useMemo } from "react";
import { StepWrapper } from "./StepWrapper";
import {
  AuthorityDefaultsReview,
  type AuthorityDefaultsSection,
} from "./AuthorityDefaultsReview";

interface AuthorityDefaultsStepProps {
  onComplete: () => void;
  onBack: () => void;
  stepNumber: number;
  totalSteps: number;
}

interface DefaultsListPayload {
  already_reviewed: boolean;
  reviewed_at: string | null;
  sections: AuthorityDefaultsSection[];
}

interface DefaultsAcceptResponse {
  mode: "accept" | "skip";
  grants_created: number;
  grant_ids?: string[];
  reviewed_at: string;
}

const GENERIC_FETCH_ERROR =
  "We couldn't load your permissions options. Try again.";
const GENERIC_SUBMIT_ERROR =
  "We couldn't save your permission choices. Try again.";

/**
 * Step 6 of 7 in the onboarding flow — Permissions per the Kinetiks
 * Contract Addendum §2.6.
 *
 * The customer reviews manifest-declared default standing grants
 * (loaded from /api/onboarding/authority-defaults), opts in to the
 * subset they trust, and either accepts or skips. The component is
 * the only client-side surface for this flow; all customer copy is
 * server-rendered (the rendered_sentence per capability comes from
 * the renderCustomerSentence helper on the server).
 *
 * Three submit paths route to POST /api/onboarding/authority-defaults:
 *   - Accept selected → mode=accept, accepted_keys=[...]
 *   - Skip for now    → mode=skip
 *   - Already reviewed (resume after partial completion) → no-op,
 *     advance immediately (the API GET reports the marker).
 *
 * Per the Phase 5 plan, the literal phrase "Authority Grant" never
 * appears here or in any string this component renders. The server
 * validator + the inline DefaultGrantToggleCard styling enforce.
 */
export function AuthorityDefaultsStep({
  onComplete,
  onBack,
  stepNumber,
  totalSteps,
}: AuthorityDefaultsStepProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sections, setSections] = useState<AuthorityDefaultsSection[]>([]);
  const [acceptedKeys, setAcceptedKeys] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState<"accept" | "skip" | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/onboarding/authority-defaults", {
          method: "GET",
        });
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok || !json.success) {
          setError(json.error ?? GENERIC_FETCH_ERROR);
          return;
        }
        const data = (json.data ?? json) as DefaultsListPayload;
        if (data.already_reviewed) {
          // Resume path: customer already decided. Don't show the
          // step; advance directly. Matches the OnboardingFlow's
          // useEffect resume heuristic but with server-authoritative
          // state.
          onComplete();
          return;
        }
        setSections(data.sections);
      } catch {
        if (!cancelled) setError(GENERIC_FETCH_ERROR);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
    // onComplete is referentially stable in the parent (OnboardingFlow)
    // — included for exhaustive-deps correctness, not for re-runs.
  }, [onComplete]);

  const allKeys = useMemo(() => {
    const out = new Set<string>();
    for (const s of sections) for (const d of s.defaults) out.add(d.key);
    return out;
  }, [sections]);

  const toggleKey = (key: string, next: boolean) => {
    setAcceptedKeys((prev) => {
      const out = new Set(prev);
      if (next) out.add(key);
      else out.delete(key);
      return out;
    });
  };

  const handleAccept = async () => {
    if (submitting) return;
    setSubmitting("accept");
    setError(null);
    try {
      const res = await fetch("/api/onboarding/authority-defaults", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "accept",
          accepted_keys: Array.from(acceptedKeys),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error ?? GENERIC_SUBMIT_ERROR);
        setSubmitting(null);
        return;
      }
      const _data = (json.data ?? json) as DefaultsAcceptResponse;
      void _data; // typed for clarity; UI doesn't need the response payload
      onComplete();
    } catch {
      setError(GENERIC_SUBMIT_ERROR);
      setSubmitting(null);
    }
  };

  const handleSkip = async () => {
    if (submitting) return;
    setSubmitting("skip");
    setError(null);
    try {
      const res = await fetch("/api/onboarding/authority-defaults", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "skip" }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error ?? GENERIC_SUBMIT_ERROR);
        setSubmitting(null);
        return;
      }
      onComplete();
    } catch {
      setError(GENERIC_SUBMIT_ERROR);
      setSubmitting(null);
    }
  };

  if (loading) {
    return (
      <StepWrapper
        stepNumber={stepNumber}
        totalSteps={totalSteps}
        title="Permissions"
        subtitle="Loading your permission options..."
        onBack={onBack}
        hideContinue
      >
        <div
          className="flex items-center justify-center py-12"
          aria-busy="true"
          aria-live="polite"
          aria-label="Loading permissions"
        >
          <div
            className="h-5 w-5 animate-spin rounded-full border-2 border-t-transparent"
            style={{
              borderColor: "var(--kt-accent)",
              borderTopColor: "transparent",
            }}
          />
        </div>
      </StepWrapper>
    );
  }

  if (sections.length === 0 && !error) {
    // No defaults declared in any registered manifest. Mark and skip.
    // (Should not happen in v1 since kinetiks_id declares two; future-
    // proofing for an empty-manifest dev environment.)
    return (
      <StepWrapper
        stepNumber={stepNumber}
        totalSteps={totalSteps}
        title="Permissions"
        subtitle="No defaults to review right now."
        onBack={onBack}
        onContinue={handleSkip}
        continueLabel="Continue"
        loading={submitting !== null}
      >
        <p className="text-sm" style={{ color: "var(--kt-fg-2)" }}>
          Your system has no default permissions to request at this time. You can
          grant additional permissions later from Cortex.
        </p>
      </StepWrapper>
    );
  }

  const continueDisabled =
    acceptedKeys.size === 0 || submitting !== null;

  return (
    <StepWrapper
      stepNumber={stepNumber}
      totalSteps={totalSteps}
      title="Permissions"
      subtitle="Choose what your system can do without checking in each time. You can change any of these later from Cortex."
      onBack={onBack}
      onSkip={handleSkip}
      onContinue={handleAccept}
      continueLabel={
        acceptedKeys.size === 0
          ? "Accept selected"
          : acceptedKeys.size === allKeys.size
            ? "Accept all"
            : `Accept ${acceptedKeys.size} of ${allKeys.size}`
      }
      continueDisabled={continueDisabled}
      loading={submitting === "accept"}
    >
      <div className="space-y-4">
        {error && (
          <div
            role="alert"
            className="rounded-lg px-3 py-2 text-[12px]"
            style={{
              background: "var(--kt-bg-subtle)",
              border: "1px solid var(--kt-danger)",
              color: "var(--kt-danger)",
            }}
          >
            {error}
          </div>
        )}

        <AuthorityDefaultsReview
          sections={sections}
          acceptedKeys={acceptedKeys}
          onToggleKey={toggleKey}
        />

        <p
          className="pt-1 text-[11px]"
          style={{ color: "var(--kt-fg-3)" }}
        >
          Skipping is fine. Your system can still help you; it just won't take
          these actions on its own until you say so.
        </p>
      </div>
    </StepWrapper>
  );
}
