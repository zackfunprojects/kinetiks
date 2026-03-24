"use client";

import { Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

/**
 * Validate a redirect target is a safe same-origin relative path.
 * Returns the path if safe, or "/" as fallback.
 */
function validateRedirect(redirect: string | null): string {
  if (!redirect) return "/";
  // Block absolute URLs, protocol-relative, and non-path values
  if (redirect.startsWith("//")) return "/";
  if (!redirect.startsWith("/")) return "/";
  try {
    const url = new URL(redirect, window.location.origin);
    if (url.origin !== window.location.origin) return "/";
    return url.pathname + url.search + url.hash;
  } catch {
    return "/";
  }
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const redirect = searchParams.get("redirect");
  const from = searchParams.get("from");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Build signup URL preserving both redirect and from params
  const signupParams = new URLSearchParams();
  if (from) signupParams.set("from", from);
  if (redirect) signupParams.set("redirect", redirect);
  const signupHref = signupParams.toString()
    ? `/signup?${signupParams.toString()}`
    : "/signup";

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error: loginError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (loginError) {
      setError(loginError.message);
      setLoading(false);
      return;
    }

    // Redirect to where they came from, or dashboard
    const safeRedirect = validateRedirect(redirect);
    router.push(safeRedirect);
    router.refresh();
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
            Log in
          </h1>
          <p style={{ color: "var(--text-secondary)", marginTop: 8, fontSize: 14 }}>
            Access your Kinetiks ID and all connected apps
          </p>
        </div>

        <form onSubmit={handleLogin}>
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
            {loading ? "Logging in..." : "Log in"}
          </button>
        </form>

        <p style={{ textAlign: "center", marginTop: 20, fontSize: 13, color: "var(--text-secondary)" }}>
          Don&apos;t have an account?{" "}
          <Link href={signupHref} style={{ color: "var(--accent)", textDecoration: "none" }}>
            Sign up
          </Link>
        </p>
      </div>
    </main>
  );
}
