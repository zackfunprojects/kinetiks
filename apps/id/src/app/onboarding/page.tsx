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
        if (!res.ok) {
          const data = await res.json();
          setError(data.error ?? "Failed to create account");
          return;
        }
        const { account } = await res.json();
        setAccount(account);
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
      <main className="flex min-h-screen items-center justify-center bg-[#FAFAFA]">
        <div className="flex items-center gap-3">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#6C5CE7] border-t-transparent" />
          <p className="text-sm text-gray-500">Setting up your Kinetiks ID...</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#FAFAFA]">
        <div className="text-center">
          <p className="text-sm text-red-500">{error}</p>
          <button
            onClick={() => router.push("/login")}
            className="mt-4 rounded-lg bg-[#6C5CE7] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#5b4bd6]"
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
