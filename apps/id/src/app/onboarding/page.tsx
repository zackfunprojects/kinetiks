"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow";

interface Account {
  id: string;
  codename: string;
  system_name?: string | null;
}

export default function OnboardingPage() {
  return (
    <Suspense>
      <OnboardingContent />
    </Suspense>
  );
}

function OnboardingContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const fromApp = searchParams.get("from");

  const [account, setAccount] = useState<Account | null>(null);
  const [bootstrapKey, setBootstrapKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasInitRef = useRef(false);

  useEffect(() => {
    if (hasInitRef.current) return;
    hasInitRef.current = true;

    async function initAccount() {
      try {
        const res = await fetch("/api/account/create", { method: "POST" });
        const json = await res.json();

        if (!res.ok) {
          setError(json.error ?? `Account creation failed (${res.status})`);
          return;
        }

        // Support both envelope { success, data: { account } } and flat { account }
        const envelope = json.data ?? json;
        const acct = envelope.account;
        if (!acct) {
          setError(`Invalid response shape: ${JSON.stringify(Object.keys(json))}`);
          return;
        }
        setAccount(acct);
        setBootstrapKey(envelope.bootstrap_key ?? null);
      } catch {
        setError("Something went wrong. Please try again.");
      } finally {
        setLoading(false);
      }
    }
    initAccount();
  }, []);

  if (loading) {
    return (
      <main
        className="flex min-h-screen items-center justify-center"
        style={{ background: "var(--kt-bg-base)" }}
      >
        <div className="flex items-center gap-3">
          <div
            className="h-4 w-4 animate-spin rounded-full border-2 border-t-transparent"
            style={{ borderColor: "var(--kt-accent)", borderTopColor: "transparent" }}
          />
          <p className="text-sm" style={{ color: "var(--kt-fg-3)" }}>Setting up your Kinetiks ID...</p>
        </div>
      </main>
    );
  }

  if (error || !account) {
    return (
      <main
        className="flex min-h-screen items-center justify-center"
        style={{ background: "var(--kt-bg-base)" }}
      >
        <div className="text-center">
          <p className="text-sm" style={{ color: "var(--kt-danger)" }}>
            {error ?? "Failed to load account. Please try again."}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 mr-3 rounded-lg px-6 py-2.5 text-sm font-semibold kt-btn kt-btn--accent kt-btn--md"
          >
            Retry
          </button>
          <button
            onClick={() => router.push("/login")}
            className="mt-4 rounded-lg px-6 py-2.5 text-sm font-semibold kt-btn kt-btn--secondary kt-btn--md"
          >
            Back to login
          </button>
        </div>
      </main>
    );
  }

  return <OnboardingFlow account={account} fromApp={fromApp} bootstrapKey={bootstrapKey} />;
}
