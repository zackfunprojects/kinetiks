"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface SetupCompleteProps {
  accountId: string;
  systemName: string;
}

export function SetupComplete({ accountId, systemName }: SetupCompleteProps) {
  const router = useRouter();
  const [completing, setCompleting] = useState(true);

  useEffect(() => {
    async function complete() {
      try {
        await fetch("/api/account", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kinetiks_connected: true }),
        });
      } catch {
        // Continue anyway - worst case they see setup again
      }
      setCompleting(false);
      // Give the user a moment to see the confirmation
      setTimeout(() => {
        router.push("/chat");
      }, 2000);
    }
    complete();
  }, [accountId, router]);

  return (
    <div style={{ textAlign: "center" }}>
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: 16,
          background: "var(--success-muted)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "0 auto 20px",
        }}
      >
        <svg
          width={32}
          height={32}
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--success)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <h1
        style={{
          fontSize: 24,
          fontWeight: 700,
          color: "var(--text-primary)",
          margin: "0 0 8px",
        }}
      >
        {systemName} is ready
      </h1>
      <p
        style={{
          fontSize: 14,
          color: "var(--text-secondary)",
          margin: "0 0 24px",
          lineHeight: 1.5,
        }}
      >
        {completing ? "Setting things up..." : "Taking you to Chat..."}
      </p>
    </div>
  );
}
