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
        background: "var(--kt-bg-base)",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 440,
          padding: 40,
          background: "var(--kt-bg-subtle)",
          borderRadius: 12,
          border: "1px solid var(--kt-border-1)",
        }}
      >
        <div style={{ marginBottom: 32 }}>
          <div
            style={{
              fontFamily: "var(--font-mono), monospace",
              fontSize: 14,
              color: "var(--kt-accent)",
              marginBottom: 16,
            }}
          >
            kinetiks_id
          </div>
          <h1
            style={{
              fontSize: 24,
              fontWeight: 700,
              color: "var(--kt-fg-1)",
              margin: 0,
            }}
          >
            Log in
          </h1>
          <p style={{ color: "var(--kt-fg-2)", marginTop: 8, fontSize: 14 }}>
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
                color: "var(--kt-fg-2)",
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
                border: "1px solid var(--kt-border-1)",
                borderRadius: 6,
                fontSize: 14,
                boxSizing: "border-box",
                background: "var(--kt-bg-base)",
                color: "var(--kt-fg-1)",
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
                color: "var(--kt-fg-2)",
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
                border: "1px solid var(--kt-border-1)",
                borderRadius: 6,
                fontSize: 14,
                boxSizing: "border-box",
                background: "var(--kt-bg-base)",
                color: "var(--kt-fg-1)",
              }}
            />
          </div>

          {error && (
            <p style={{ color: "var(--kt-danger)", fontSize: 13, marginBottom: 16 }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "12px 0",
              background: loading ? "var(--kt-border-1)" : "var(--kt-accent-hover)",
              color: loading ? "var(--kt-fg-3)" : "var(--kt-fg-on-inverse)",
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

        <p style={{ textAlign: "center", marginTop: 20, fontSize: 13, color: "var(--kt-fg-2)" }}>
          Don&apos;t have an account?{" "}
          <Link href={signupHref} style={{ color: "var(--kt-accent)", textDecoration: "none" }}>
            Sign up
          </Link>
        </p>

        <div style={{ textAlign: "center", marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--kt-border-2)" }}>
          <Link href="/developers" style={{ fontSize: 12, color: "var(--kt-fg-3)", textDecoration: "none" }}>
            Developer docs &amp; API reference
          </Link>
        </div>
      </div>
    </main>
  );
}
