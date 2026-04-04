"use client";

import { useState } from "react";
import { NameSystem } from "./NameSystem";
import { ConnectEmail } from "./ConnectEmail";
import { ConnectSlack } from "./ConnectSlack";
import { SetupComplete } from "./SetupComplete";

interface SetupFlowProps {
  accountId: string;
  existingName: string | null;
}

type SetupStep = "name" | "email" | "slack" | "complete";

export function SetupFlow({ accountId, existingName }: SetupFlowProps) {
  const [step, setStep] = useState<SetupStep>("name");
  const [systemName, setSystemName] = useState(existingName || "");

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        background: "var(--bg-base)",
        padding: 24,
      }}
    >
      <div style={{ width: "100%", maxWidth: 480 }}>
        {step === "name" && (
          <NameSystem
            accountId={accountId}
            initialName={systemName}
            onComplete={(name) => {
              setSystemName(name);
              setStep("email");
            }}
          />
        )}
        {step === "email" && (
          <ConnectEmail
            onComplete={() => setStep("slack")}
            onSkip={() => setStep("slack")}
          />
        )}
        {step === "slack" && (
          <ConnectSlack
            systemName={systemName}
            onComplete={() => setStep("complete")}
            onSkip={() => setStep("complete")}
          />
        )}
        {step === "complete" && (
          <SetupComplete accountId={accountId} systemName={systemName} />
        )}
      </div>
    </div>
  );
}
