"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ONBOARDING_STEPS, INITIAL_ONBOARDING_STATE } from "@/types/onboarding";
import type { HarvestOnboardingState } from "@/types/onboarding";
import SenderProfileStep from "./steps/SenderProfileStep";
import OutreachGoalStep from "./steps/OutreachGoalStep";
import IcpReviewStep from "./steps/IcpReviewStep";
import TemplateGenerationStep from "./steps/TemplateGenerationStep";
import FirstEnrichmentStep from "./steps/FirstEnrichmentStep";

export default function OnboardingWizard() {
  const router = useRouter();
  const [state, setState] = useState<HarvestOnboardingState>(INITIAL_ONBOARDING_STATE);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/hv/onboarding");
        if (res.ok) {
          const json = await res.json();
          if (json.data) {
            if (json.data.completed) {
              router.replace("/greenhouse");
              return;
            }
            setState(json.data);
          }
        }
      } catch (err) {
        console.error("Failed to load onboarding state:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [router]);

  const completeStep = useCallback(async (step: number, data: Record<string, unknown>) => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/hv/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step, data }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error ?? "Failed to save step");
        return;
      }
      const json = await res.json();
      const newState = json.data as HarvestOnboardingState;
      setState(newState);

      if (newState.completed) {
        router.replace("/greenhouse");
      }
    } catch (err) {
      console.error("Failed to complete step:", err);
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }, [router]);

  const currentStep = state.current_step;

  if (loading) {
    return (
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "60vh",
        color: "var(--text-tertiary)",
        fontSize: 14,
      }}>
        Loading...
      </div>
    );
  }

  return (
    <div style={{
      maxWidth: 680,
      margin: "0 auto",
      padding: "var(--space-8) var(--space-4)",
    }}>
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: "var(--space-8)" }}>
        <h1 style={{
          fontSize: 24,
          fontWeight: 600,
          color: "var(--text-primary)",
          margin: 0,
          letterSpacing: "-0.02em",
        }}>
          Set up Harvest
        </h1>
        <p style={{
          fontSize: 14,
          color: "var(--text-tertiary)",
          margin: "6px 0 0",
        }}>
          Five quick steps to configure your outbound engine
        </p>
      </div>

      {/* Step progress */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        marginBottom: "var(--space-8)",
      }}>
        {ONBOARDING_STEPS.map((step) => {
          const isCompleted = state.completed_steps.includes(step.id);
          const isCurrent = currentStep === step.id;
          return (
            <div key={step.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div
                style={{
                  width: isCurrent ? 24 : 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: isCompleted
                    ? "var(--harvest-green)"
                    : isCurrent
                      ? "var(--harvest-green)"
                      : "var(--border-default)",
                  transition: "all 0.3s ease",
                  opacity: isCompleted || isCurrent ? 1 : 0.4,
                }}
              />
            </div>
          );
        })}
      </div>

      {/* Step label */}
      <div style={{
        textAlign: "center",
        marginBottom: "var(--space-6)",
      }}>
        <div style={{
          fontSize: 11,
          fontWeight: 600,
          color: "var(--harvest-green)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          marginBottom: 4,
        }}>
          Step {currentStep} of {ONBOARDING_STEPS.length}
          {currentStep <= ONBOARDING_STEPS.length && (
            <span style={{ color: "var(--text-tertiary)", fontWeight: 400 }}>
              {" "} - {ONBOARDING_STEPS[currentStep - 1]?.title}
            </span>
          )}
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div style={{
          marginBottom: "var(--space-4)",
          padding: "var(--space-3)",
          borderRadius: "var(--radius-md)",
          backgroundColor: "var(--error-subtle, #fef2f2)",
          color: "var(--error, #dc2626)",
          fontSize: 13,
          textAlign: "center",
        }}>
          {error}
        </div>
      )}

      {/* Step content */}
      <div style={{
        backgroundColor: "var(--surface-elevated)",
        borderRadius: "var(--radius-lg, 12px)",
        border: "1px solid var(--border-default)",
        padding: "var(--space-6)",
      }}>
        {currentStep === 1 && (
          <SenderProfileStep
            initialProfile={state.sender_profile}
            submitting={submitting}
            onComplete={(profile) => completeStep(1, { sender_profile: profile })}
          />
        )}
        {currentStep === 2 && (
          <OutreachGoalStep
            submitting={submitting}
            onComplete={(goal) => completeStep(2, { outreach_goal: goal })}
          />
        )}
        {currentStep === 3 && (
          <IcpReviewStep
            submitting={submitting}
            onComplete={() => completeStep(3, { icp_reviewed: true })}
          />
        )}
        {currentStep === 4 && (
          <TemplateGenerationStep
            submitting={submitting}
            onComplete={(count) => completeStep(4, { templates_generated: true, template_count: count })}
          />
        )}
        {currentStep === 5 && (
          <FirstEnrichmentStep
            submitting={submitting}
            onComplete={(domain) => completeStep(5, { first_enrichment_done: true, domain })}
          />
        )}
      </div>
    </div>
  );
}
