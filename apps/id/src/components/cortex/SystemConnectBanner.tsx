/**
 * Outcome banner for the system-connection OAuth round-trip — D1.
 *
 * The callback route redirects to /cortex/integrations with
 * `?system_connect=<outcome>&provider=<provider>`; this renders the
 * outcome as a dismissible inline notice (dismiss = plain link back
 * to the param-less page, so the server component stays server).
 */

import Link from "next/link";

import { isSystemProvider, getSystemProvider } from "@/lib/connections/system-providers";

const OUTCOME_COPY: Record<string, { tone: "success" | "warning" | "danger"; text: (label: string) => string }> = {
  success: {
    tone: "success",
    text: (label) => `${label} connected. Your system can use it now.`,
  },
  already_connected: {
    tone: "warning",
    text: (label) => `${label} is already connected. Disconnect first to re-link a different account.`,
  },
  denied: {
    tone: "warning",
    text: (label) => `${label} connection was cancelled. Nothing was linked.`,
  },
  not_configured: {
    tone: "warning",
    text: (label) => `${label} isn't configured for this deployment yet.`,
  },
  error: {
    tone: "danger",
    text: (label) => `We couldn't finish connecting ${label}. Try again in a moment.`,
  },
};

const TONE_STYLE: Record<"success" | "warning" | "danger", { bg: string; fg: string }> = {
  success: { bg: "var(--kt-success-soft)", fg: "var(--kt-success)" },
  warning: { bg: "var(--kt-warning-soft)", fg: "var(--kt-warning)" },
  danger: { bg: "var(--kt-danger-soft)", fg: "var(--kt-danger)" },
};

export function SystemConnectBanner({
  outcome,
  provider,
}: {
  outcome: string;
  provider: string | null;
}) {
  const copy = OUTCOME_COPY[outcome];
  if (!copy) return null;
  const label =
    provider && isSystemProvider(provider)
      ? getSystemProvider(provider).displayName
      : "The connection";
  const tone = TONE_STYLE[copy.tone];

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "var(--kt-s-3)",
        background: tone.bg,
        color: tone.fg,
        border: "1px solid currentColor",
        borderRadius: "var(--kt-radius-2)",
        padding: "var(--kt-s-3) var(--kt-s-4)",
        marginBottom: "var(--kt-s-5)",
      }}
    >
      <span className="kt-small" style={{ color: "inherit" }}>
        {copy.text(label)}
      </span>
      <Link
        href="/cortex/integrations"
        className="kt-small"
        style={{ color: "inherit", textDecoration: "underline", whiteSpace: "nowrap" }}
        aria-label="Dismiss notice"
      >
        Dismiss
      </Link>
    </div>
  );
}
