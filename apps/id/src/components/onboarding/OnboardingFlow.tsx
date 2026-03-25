"use client";

import { useState, useEffect, useRef } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import type { ContextFillStatus } from "@/lib/cartographer/conversation";
import type { CrawlResult } from "@/lib/cartographer/types";
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
  bootstrapKey: string | null;
}

const STEPS = ["Welcome", "Website", "Questions", "Voice", "Samples", "Done"];
const TOTAL_STEPS = STEPS.length;

export function OnboardingFlow({ account, fromApp, bootstrapKey }: OnboardingFlowProps) {
  const [step, setStep] = useState(0);
  const [fillStatus, setFillStatus] = useState<ContextFillStatus | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [businessContext, setBusinessContext] = useState("");
  const [crawlData, setCrawlData] = useState<CrawlResult | null>(null);
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

        if (status.aggregate > 0) {
          const hasVoiceCalibration =
            status.layers.voice && status.layers.voice.percentage >= 40;

          if (status.aggregate >= 50 && hasVoiceCalibration) {
            setStep(5);
          } else if (status.aggregate >= 30) {
            setStep(2);
          } else {
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
  const goBack = () => setStep((s) => Math.max(s - 1, 0));

  const handleCrawlComplete = (result: CrawlResult) => {
    setCrawlData(result);
    setBusinessContext(buildBusinessContextString(result));
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
      <div style={{ display: "flex", justifyContent: "flex-end", padding: "16px 24px 0" }}>
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

      {step === 0 && (
        <EducationScreen
          fromApp={fromApp}
          codename={account.codename}
          bootstrapKey={bootstrapKey}
          onContinue={advance}
          stepNumber={1}
          totalSteps={TOTAL_STEPS}
        />
      )}

      {step === 1 && (
        <CrawlStep
          onComplete={handleCrawlComplete}
          onSkip={advance}
          onBack={goBack}
          stepNumber={2}
          totalSteps={TOTAL_STEPS}
        />
      )}

      {step === 2 && (
        <ConversationStep
          fromApp={fromApp}
          onComplete={handleConversationComplete}
          onBack={goBack}
          businessContext={businessContext}
          stepNumber={3}
          totalSteps={TOTAL_STEPS}
        />
      )}

      {step === 3 && (
        <CalibrationStep
          onComplete={handleCalibrationComplete}
          onBack={goBack}
          businessContext={businessContext}
          crawlData={crawlData}
          stepNumber={4}
          totalSteps={TOTAL_STEPS}
        />
      )}

      {step === 4 && (
        <WritingSampleStep
          onComplete={handleWritingSampleComplete}
          onBack={goBack}
          businessContext={businessContext}
          crawlData={crawlData}
          stepNumber={5}
          totalSteps={TOTAL_STEPS}
        />
      )}

      {step === 5 && (
        <CompletionStep
          codename={account.codename}
          fromApp={fromApp}
          fillStatus={fillStatus}
          stepNumber={6}
          totalSteps={TOTAL_STEPS}
        />
      )}
    </div>
  );
}

function buildBusinessContextString(result: CrawlResult): string {
  const lines: string[] = [`Website: ${result.url}`];
  const exts = result.extractions;

  const orgData = exts.org.success ? (exts.org.data as Record<string, unknown> | null) : null;
  if (orgData) {
    if (orgData.company_name) lines.push(`Company: ${orgData.company_name}`);
    if (orgData.industry) lines.push(`Industry: ${orgData.industry}`);
    if (orgData.description) lines.push(`Description: ${orgData.description}`);
    if (orgData.geography) lines.push(`Location: ${orgData.geography}`);
  }

  const prodData = exts.products.success ? (exts.products.data as Record<string, unknown> | null) : null;
  if (prodData?.products && Array.isArray(prodData.products)) {
    for (const p of prodData.products) {
      if (p && typeof p === "object") {
        const prod = p as Record<string, unknown>;
        lines.push(`Product: ${prod.name ?? "Unknown"} - ${prod.value_prop ?? prod.description ?? ""}`);
        if (Array.isArray(prod.differentiators) && prod.differentiators.length > 0) {
          lines.push(`  Differentiators: ${(prod.differentiators as string[]).join(", ")}`);
        }
      }
    }
  }

  const voiceData = exts.voice.success ? (exts.voice.data as Record<string, unknown> | null) : null;
  if (voiceData?.tone && typeof voiceData.tone === "object") {
    const tone = voiceData.tone as Record<string, number>;
    lines.push(`Voice: formality ${tone.formality ?? "?"}/100, warmth ${tone.warmth ?? "?"}/100, authority ${tone.authority ?? "?"}/100`);
  }

  const narrativeData = exts.narrative.success ? (exts.narrative.data as Record<string, unknown> | null) : null;
  if (narrativeData) {
    if (narrativeData.origin_story) lines.push(`Origin: ${narrativeData.origin_story}`);
    if (narrativeData.founder_thesis) lines.push(`Thesis: ${narrativeData.founder_thesis}`);
  }

  return lines.join("\n");
}
