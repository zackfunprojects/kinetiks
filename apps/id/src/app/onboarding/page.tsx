"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow";

interface Account {
  id: string;
  codename: string;
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
          // API envelope: { success: false, error: "..." }
          setError(json.error ?? "Failed to create account");
          return;
        }

        // API envelope: { success: true, data: { account: {...} } }
        const acct = json.data?.account ?? json.account;
        if (!acct) {
          setError("Invalid response from server");
          return;
        }
        setAccount(acct);
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
        style={{ background: "var(--bg-base)" }}
      >
        <div className="flex items-center gap-3">
          <div
            className="h-4 w-4 animate-spin rounded-full border-2 border-t-transparent"
            style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }}
          />
          <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>Setting up your Kinetiks ID...</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main
        className="flex min-h-screen items-center justify-center"
        style={{ background: "var(--bg-base)" }}
      >
        <div className="text-center">
          <p className="text-sm" style={{ color: "var(--error)" }}>{error}</p>
          <button
            onClick={() => router.push("/login")}
            className="mt-4 rounded-lg px-6 py-2.5 text-sm font-semibold"
            style={{ background: "var(--accent-emphasis)", color: "var(--text-on-accent)" }}
          >
            Back to login
          </button>
        </div>
      </main>
    );
  }

  if (!account) return null;

  return <OnboardingFlow account={account} fromApp={fromApp} />;
}
