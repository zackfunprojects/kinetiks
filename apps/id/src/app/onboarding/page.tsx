"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";

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

  const framingText = fromApp
    ? `Let's learn your business so ${fromApp.replace("_", " ")} can work its magic.`
    : "Let's build your business identity.";

  if (loading) {
    return (
      <main
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <p style={{ color: "#666" }}>Setting up your Kinetiks ID...</p>
      </main>
    );
  }

  if (error) {
    return (
      <main
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <p style={{ color: "#e74c3c" }}>{error}</p>
          <button
            onClick={() => router.push("/login")}
            style={{
              marginTop: 16,
              padding: "8px 24px",
              background: "#6C5CE7",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
            }}
          >
            Back to login
          </button>
        </div>
      </main>
    );
  }

  return (
    <main
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        fontFamily: "system-ui, sans-serif",
        background: "#FAFAFA",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 560,
          padding: 48,
          background: "#fff",
          borderRadius: 16,
          boxShadow: "0 2px 16px rgba(0,0,0,0.06)",
          textAlign: "center",
        }}
      >
        <div
          style={{
            display: "inline-block",
            padding: "6px 16px",
            background: "#f0eeff",
            borderRadius: 999,
            color: "#6C5CE7",
            fontSize: 14,
            fontWeight: 600,
            marginBottom: 24,
          }}
        >
          {account?.codename}
        </div>

        <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0, color: "#111" }}>
          Welcome to Kinetiks
        </h1>
        <p style={{ color: "#666", marginTop: 8, fontSize: 15, lineHeight: 1.5 }}>
          {framingText}
        </p>

        <p
          style={{
            color: "#999",
            marginTop: 32,
            fontSize: 13,
            fontStyle: "italic",
          }}
        >
          The Cartographer onboarding experience will be built in Phase 3.
        </p>

        <button
          onClick={() => {
            if (fromApp === "dark_madder") {
              window.location.href = "https://dm.kinetiks.ai";
            } else if (fromApp === "harvest") {
              window.location.href = "https://hv.kinetiks.ai";
            } else if (fromApp === "hypothesis") {
              window.location.href = "https://ht.kinetiks.ai";
            } else if (fromApp === "litmus") {
              window.location.href = "https://lt.kinetiks.ai";
            } else {
              router.push("/");
            }
          }}
          style={{
            marginTop: 24,
            padding: "12px 32px",
            background: "#6C5CE7",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {fromApp ? "Continue to app" : "Go to dashboard"}
        </button>
      </div>
    </main>
  );
}
