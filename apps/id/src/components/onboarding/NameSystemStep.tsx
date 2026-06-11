"use client";

import { useEffect, useRef } from "react";
import { StepWrapper } from "./StepWrapper";
import { NameSystem } from "@/components/setup/NameSystem";

interface NameSystemStepProps {
  accountId: string;
  /** The account's current system_name; non-null means already named. */
  existingName: string | null;
  onComplete: (name: string) => void;
  onBack: () => void;
  stepNumber: number;
  totalSteps: number;
}

/**
 * B3 — the naming moment in onboarding, per the v3 spec: the customer
 * names their GTM system, and that name speaks in Chat, sends emails,
 * posts in Slack, and owns approval requests from then on.
 *
 * Resume pass-through: an account that already carries a system_name
 * (named in a previous session or via Settings) advances transparently,
 * mirroring how AuthorityDefaultsStep self-advances when permissions
 * were already reviewed.
 */
export function NameSystemStep({
  accountId,
  existingName,
  onComplete,
  onBack,
  stepNumber,
  totalSteps,
}: NameSystemStepProps) {
  const advancedRef = useRef(false);

  useEffect(() => {
    if (existingName && !advancedRef.current) {
      advancedRef.current = true;
      onComplete(existingName);
    }
  }, [existingName, onComplete]);

  if (existingName) return null;

  return (
    <StepWrapper
      stepNumber={stepNumber}
      totalSteps={totalSteps}
      title="Name your system"
      subtitle="This is what talks to you in Chat, shows up in Slack, and sends your emails."
      onBack={onBack}
      hideContinue
    >
      <NameSystem
        accountId={accountId}
        initialName=""
        onComplete={onComplete}
        hideHeader
      />
    </StepWrapper>
  );
}
