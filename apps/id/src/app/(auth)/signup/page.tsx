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
        fontFamily: "system-ui, sans-serif",
        background: "#FAFAFA",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 440,
          padding: 40,
          background: "#fff",
          borderRadius: 16,
          boxShadow: "0 2px 16px rgba(0,0,0,0.06)",
        }}
      >
        <div style={{ marginBottom: 32 }}>
          <h1
            style={{
              fontSize: 24,
              fontWeight: 700,
              color: "#111",
              margin: 0,
            }}
          >
            {framing.title}
          </h1>
          <p style={{ color: "#666", marginTop: 8, fontSize: 14, lineHeight: 1.5 }}>
            {framing.subtitle}
          </p>
        </div>

        <form onSubmit={handleSignup}>
          <div style={{ marginBottom: 16 }}>
            <label
              htmlFor="email"
              style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 6, color: "#333" }}
            >
              Email
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
                border: "1px solid #ddd",
                borderRadius: 8,
                fontSize: 14,
                boxSizing: "border-box",
              }}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label
              htmlFor="password"
              style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 6, color: "#333" }}
            >
              Password
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
                border: "1px solid #ddd",
                borderRadius: 8,
                fontSize: 14,
                boxSizing: "border-box",
              }}
            />
          </div>

          {error && (
            <p style={{ color: "#e74c3c", fontSize: 13, marginBottom: 16 }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "12px 0",
              background: loading ? "#a29bfe" : "#6C5CE7",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Creating account..." : "Create account"}
          </button>
        </form>

        <p style={{ textAlign: "center", marginTop: 20, fontSize: 13, color: "#666" }}>
          Already have an account?{" "}
          <Link
            href={fromApp ? `/login?from=${encodeURIComponent(fromApp)}` : "/login"}
            style={{ color: "#6C5CE7", textDecoration: "none" }}
          >
            Log in
          </Link>
        </p>
      </div>
    </main>
  );
}
