"use client";

import { Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function SignupPage() {
  return (
    <Suspense>
      <SignupForm />
    </Suspense>
  );
}

const APP_FRAMING: Record<string, { title: string; subtitle: string }> = {
  dark_madder: {
    title: "Dark Madder is powered by Kinetiks",
    subtitle:
      "We're going to spend 15 minutes learning your business so everything we create sounds like you. Your Kinetiks ID also powers other growth tools you can activate later.",
  },
  harvest: {
    title: "Harvest is powered by Kinetiks",
    subtitle:
      "We're going to learn your business so your outreach connects with the right people in the right way. Your Kinetiks ID powers all your growth tools.",
  },
  hypothesis: {
    title: "Hypothesis is powered by Kinetiks",
    subtitle:
      "We're going to learn your business so every landing page speaks to your audience. Your Kinetiks ID powers all your growth tools.",
  },
  litmus: {
    title: "Litmus is powered by Kinetiks",
    subtitle:
      "We're going to learn your business so your PR outreach lands with journalists. Your Kinetiks ID powers all your growth tools.",
  },
};

const DEFAULT_FRAMING = {
  title: "Build your Kinetiks ID",
  subtitle:
    "Kinetiks is a marketing data platform. Build your business identity once, and it powers every tool in the ecosystem.",
};

function SignupForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const fromApp = searchParams.get("from");
  const framing = fromApp ? APP_FRAMING[fromApp] ?? DEFAULT_FRAMING : DEFAULT_FRAMING;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error: signupError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/callback`,
        data: {
          from_app: fromApp,
        },
      },
    });

    if (signupError) {
      setError(signupError.message);
      setLoading(false);
      return;
    }

    // Redirect to onboarding with from param preserved
    const onboardingUrl = fromApp
      ? `/onboarding?from=${encodeURIComponent(fromApp)}`
      : "/onboarding";
    router.push(onboardingUrl);
  }

  return (
    <main
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        background: "var(--bg-base)",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 440,
          padding: 40,
          background: "var(--bg-surface)",
          borderRadius: 12,
          border: "1px solid var(--border-default)",
        }}
      >
        <div style={{ marginBottom: 32 }}>
          <div
            style={{
              fontFamily: "var(--font-mono), monospace",
              fontSize: 14,
              color: "var(--accent)",
              marginBottom: 16,
            }}
          >
            kinetiks_id
          </div>
          <h1
            style={{
              fontSize: 24,
              fontWeight: 700,
              color: "var(--text-primary)",
              margin: 0,
            }}
          >
            {framing.title}
          </h1>
          <p style={{ color: "var(--text-secondary)", marginTop: 8, fontSize: 14, lineHeight: 1.5 }}>
            {framing.subtitle}
          </p>
        </div>

        <form onSubmit={handleSignup}>
          <div style={{ marginBottom: 16 }}>
            <label
              htmlFor="email"
              style={{
                display: "block",
                fontSize: 13,
                fontWeight: 500,
                marginBottom: 6,
                color: "var(--text-secondary)",
                fontFamily: "var(--font-mono), monospace",
              }}
            >
              email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{
                width: "100%",
                padding: "10px 12px",
                border: "1px solid var(--border-default)",
                borderRadius: 6,
                fontSize: 14,
                boxSizing: "border-box",
                background: "var(--bg-inset)",
                color: "var(--text-primary)",
              }}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label
              htmlFor="password"
              style={{
                display: "block",
                fontSize: 13,
                fontWeight: 500,
                marginBottom: 6,
                color: "var(--text-secondary)",
                fontFamily: "var(--font-mono), monospace",
              }}
            >
              password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              style={{
                width: "100%",
                padding: "10px 12px",
                border: "1px solid var(--border-default)",
                borderRadius: 6,
                fontSize: 14,
                boxSizing: "border-box",
                background: "var(--bg-inset)",
                color: "var(--text-primary)",
              }}
            />
          </div>

          {error && (
            <p style={{ color: "var(--error)", fontSize: 13, marginBottom: 16 }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "12px 0",
              background: loading ? "var(--border-default)" : "var(--accent-emphasis)",
              color: loading ? "var(--text-tertiary)" : "var(--text-on-accent)",
              border: "none",
              borderRadius: 6,
              fontSize: 14,
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Creating account..." : "Create account"}
          </button>
        </form>

        <p style={{ textAlign: "center", marginTop: 20, fontSize: 13, color: "var(--text-secondary)" }}>
          Already have an account?{" "}
          <Link
            href={fromApp ? `/login?from=${encodeURIComponent(fromApp)}` : "/login"}
            style={{ color: "var(--accent)", textDecoration: "none" }}
          >
            Log in
          </Link>
        </p>
      </div>
    </main>
  );
}
