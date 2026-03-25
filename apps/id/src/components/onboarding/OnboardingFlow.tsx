"use client";

import { useState, useEffect, useRef } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import type { ContextFillStatus } from "@/lib/cartographer/conversation";
import { ProgressBar } from "./ProgressBar";
import { EducationScreen } from "./EducationScreen";
import { CrawlStep } from "./CrawlStep";
import { ConversationStep } from "./ConversationStep";
import { CalibrationStep } from "./CalibrationStep";
import { WritingSampleStep } from "./WritingSampleStep";
import { CompletionStep } from "./CompletionStep";

interface Account {
  id: string;
  codename: string;
}

interface OnboardingFlowProps {
  account: Account;
  fromApp: string | null;
}

const STEPS = ["Welcome", "Website", "Questions", "Voice", "Samples", "Done"];

export function OnboardingFlow({ account, fromApp }: OnboardingFlowProps) {
  const [step, setStep] = useState(0);
  const [fillStatus, setFillStatus] = useState<ContextFillStatus | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const hasCheckedResumeRef = useRef(false);
  const router = useRouter();

  const handleSignOut = async () => {
    setSigningOut(true);
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    await supabase.auth.signOut();
    router.push("/login");
  };

  // On mount, check if we can resume from a later step
  useEffect(() => {
    if (hasCheckedResumeRef.current) return;
    hasCheckedResumeRef.current = true;

    async function checkResume() {
      try {
        const res = await fetch("/api/cartographer/conversation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "fill_status" }),
        });
        if (!res.ok) return;
        const json = await res.json();
        const envelope = json.data ?? json;
        const status = envelope.fillStatus as ContextFillStatus | undefined;
        if (!status) return;

        setFillStatus(status);

        // If there's already data, skip to an appropriate step
        if (status.aggregate > 0) {
          const hasVoiceCalibration =
            status.layers.voice && status.layers.voice.percentage >= 40;

          if (status.aggregate >= 50 && hasVoiceCalibration) {
            // Basically done - go to completion
            setStep(5);
          } else if (status.aggregate >= 30) {
            // Has crawl data, skip to conversation
            setStep(2);
          } else {
            // Some data but not much - skip education
            setStep(1);
          }
        }
      } catch {
        // Proceed normally on error
      }
    }
    checkResume();
  }, []);

  const fetchFillStatus = async (): Promise<ContextFillStatus | null> => {
    try {
      const res = await fetch("/api/cartographer/conversation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "fill_status" }),
      });
      if (!res.ok) return null;
      const json = await res.json();
      const envelope = json.data ?? json;
      const status = envelope.fillStatus as ContextFillStatus | undefined;
      if (status) setFillStatus(status);
      return status ?? null;
    } catch {
      return null;
    }
  };

  const advance = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));

  const handleCrawlComplete = () => {
    advance();
  };

  const handleConversationComplete = () => {
    advance();
  };

  const handleCalibrationComplete = () => {
    advance();
  };

  const handleWritingSampleComplete = async () => {
    await fetchFillStatus();
    advance();
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-base)" }}>
      <div style={{ display: "flex", justifyContent: "flex-end", padding: "16px 24px" }}>
        <button
          onClick={handleSignOut}
          disabled={signingOut}
          style={{
            background: "transparent",
            border: "none",
            color: "var(--text-tertiary)",
            fontSize: 13,
            cursor: "pointer",
            padding: "4px 8px",
            borderRadius: 6,
            opacity: signingOut ? 0.5 : 1,
          }}
        >
          {signingOut ? "Signing out..." : "Sign out"}
        </button>
      </div>
      <ProgressBar currentStep={step} steps={STEPS} />

      <div className="mx-auto max-w-3xl px-4 pb-16">
        {step === 0 && (
          <EducationScreen
            fromApp={fromApp}
            codename={account.codename}
            onContinue={advance}
          />
        )}

        {step === 1 && (
          <CrawlStep onComplete={handleCrawlComplete} onSkip={advance} />
        )}

        {step === 2 && (
          <ConversationStep
            fromApp={fromApp}
            onComplete={handleConversationComplete}
          />
        )}

        {step === 3 && (
          <CalibrationStep onComplete={handleCalibrationComplete} />
        )}

        {step === 4 && (
          <WritingSampleStep onComplete={handleWritingSampleComplete} />
        )}

        {step === 5 && (
          <CompletionStep
            codename={account.codename}
            fromApp={fromApp}
            fillStatus={fillStatus}
          />
        )}
      </div>
    </div>
  );
}
