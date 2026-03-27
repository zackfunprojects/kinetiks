"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

/* ── Types ─────────────────────────────────────────────────── */

interface AccountData {
  codename: string;
  confidenceScore: number;
}

interface Suggestion {
  label: string;
  impact: string;
}

interface AppLink {
  name: string;
  abbrev: string;
  url: string;
  color: string;
}

/* ── Constants ─────────────────────────────────────────────── */

const ID_BASE_URL =
  process.env.NEXT_PUBLIC_ID_URL || "https://id.kinetiks.ai";

const DEFAULT_SUGGESTIONS: Suggestion[] = [
  { label: "Connect GA4", impact: "+10%" },
  { label: "Upload writing samples", impact: "+8%" },
  { label: "Add competitor data", impact: "+5%" },
];

const OTHER_APPS: AppLink[] = [
  { name: "Dark Madder", abbrev: "DM", url: "https://dm.kinetiks.ai", color: "#8B5CF6" },
  { name: "Hypothesis", abbrev: "HT", url: "https://ht.kinetiks.ai", color: "#3182CE" },
  { name: "Litmus", abbrev: "LT", url: "https://lt.kinetiks.ai", color: "#D97706" },
];

/* ── Confidence Arc ────────────────────────────────────────── */

function ConfidenceArc({ score }: { score: number }) {
  const size = 56;
  const strokeWidth = 4;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = (score / 100) * circumference;
  const offset = circumference - filled;

  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--border-default, rgba(0,0,0,0.08))"
          strokeWidth={strokeWidth}
        />
        {/* Progress arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--harvest-green, #3D7C47)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{
            transform: "rotate(-90deg)",
            transformOrigin: "50% 50%",
            transition: "stroke-dashoffset var(--duration-slow, 400ms) var(--ease-spring, cubic-bezier(0.34,1.56,0.64,1))",
          }}
        />
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 14,
          fontWeight: 700,
          fontFamily: "var(--font-mono, monospace)",
          color: "var(--text-primary, #1A1918)",
        }}
      >
        {score}%
      </div>
    </div>
  );
}

/* ── Main Component ────────────────────────────────────────── */

export default function FloatingPill() {
  const [expanded, setExpanded] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [account, setAccount] = useState<AccountData | null>(null);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  /* Mount animation trigger */
  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(timer);
  }, []);

  /* Fetch account data */
  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          setLoading(false);
          return;
        }

        const { data: acc, error: accError } = await supabase
          .from("kinetiks_accounts")
          .select("id, codename")
          .eq("user_id", user.id)
          .maybeSingle();

        if (accError) {
          console.error("Failed to load Kinetiks account:", accError.message);
          setLoading(false);
          return;
        }

        if (!acc) {
          setLoading(false);
          return;
        }

        const { data: conf, error: confError } = await supabase
          .from("kinetiks_confidence")
          .select("aggregate")
          .eq("account_id", acc.id)
          .maybeSingle();

        if (confError) {
          console.error("Failed to load confidence score:", confError.message);
        }

        setAccount({
          codename: acc.codename,
          confidenceScore: conf?.aggregate ?? 0,
        });
      } catch {
        // Silently fail - pill will show CTA state
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  /* Close on click outside */
  useEffect(() => {
    if (!expanded) return;
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setExpanded(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [expanded]);

  /* Close on Escape */
  useEffect(() => {
    if (!expanded) return;
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setExpanded(false);
    }
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [expanded]);

  const toggle = useCallback(() => setExpanded((prev) => !prev), []);

  if (loading) return null;

  const score = account?.confidenceScore ?? 0;

  return (
    <div
      ref={containerRef}
      style={{
        position: "fixed",
        bottom: 20,
        left: 20,
        zIndex: 999,
        opacity: mounted ? 1 : 0,
        transform: mounted ? "translateY(0)" : "translateY(8px)",
        transition: "opacity var(--duration-normal, 250ms) var(--ease-smooth, cubic-bezier(0.4,0,0.2,1)), transform var(--duration-normal, 250ms) var(--ease-smooth, cubic-bezier(0.4,0,0.2,1))",
      }}
    >
      {/* ── Expanded Panel ────────────────────────────── */}
      <div
        style={{
          position: "absolute",
          bottom: 52,
          left: 0,
          width: 320,
          background: "var(--surface-elevated, #FFFFFF)",
          border: "1px solid var(--border-default, rgba(0,0,0,0.08))",
          borderRadius: "var(--radius-lg, 12px)",
          boxShadow: "var(--shadow-overlay, 0 8px 32px rgba(0,0,0,0.12))",
          maxHeight: "70vh",
          overflowY: "auto",
          opacity: expanded ? 1 : 0,
          transform: expanded ? "translateY(0) scale(1)" : "translateY(8px) scale(0.97)",
          pointerEvents: expanded ? "auto" : "none",
          transition: "opacity var(--duration-normal, 250ms) var(--ease-spring, cubic-bezier(0.34,1.56,0.64,1)), transform var(--duration-normal, 250ms) var(--ease-spring, cubic-bezier(0.34,1.56,0.64,1))",
          transformOrigin: "bottom left",
        }}
      >
        {account ? (
          <>
            {/* Header: codename + arc */}
            <div
              style={{
                padding: "16px 16px 14px",
                borderBottom: "1px solid var(--border-default, rgba(0,0,0,0.08))",
                display: "flex",
                alignItems: "center",
                gap: 14,
              }}
            >
              <ConfidenceArc score={score} />
              <div>
                <p
                  style={{
                    margin: 0,
                    fontSize: 15,
                    fontWeight: 600,
                    fontFamily: "var(--font-mono, monospace)",
                    color: "var(--text-primary, #1A1918)",
                  }}
                >
                  {account.codename}
                </p>
                <p
                  style={{
                    margin: "3px 0 0",
                    fontSize: 12,
                    color: "var(--text-tertiary, #9C9889)",
                  }}
                >
                  Your Kinetiks ID
                </p>
              </div>
            </div>

            {/* Suggestions */}
            <div
              style={{
                padding: "12px 16px",
                borderBottom: "1px solid var(--border-default, rgba(0,0,0,0.08))",
              }}
            >
              <p style={sectionHeaderStyle}>Improve your ID</p>
              {DEFAULT_SUGGESTIONS.map((s, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "5px 0",
                  }}
                >
                  <span
                    style={{
                      fontSize: 13,
                      color: "var(--text-secondary, #6B6860)",
                    }}
                  >
                    {s.label}
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      fontFamily: "var(--font-mono, monospace)",
                      color: "var(--harvest-green, #3D7C47)",
                    }}
                  >
                    {s.impact}
                  </span>
                </div>
              ))}
            </div>

            {/* App switcher */}
            <div
              style={{
                padding: "12px 16px",
                borderBottom: "1px solid var(--border-default, rgba(0,0,0,0.08))",
              }}
            >
              <p style={sectionHeaderStyle}>Other apps</p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {OTHER_APPS.map((app) => (
                  <a
                    key={app.name}
                    href={app.url}
                    title={app.name}
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: "var(--radius-md, 8px)",
                      background: app.color,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#FFFFFF",
                      fontWeight: 700,
                      fontSize: 12,
                      fontFamily: "var(--font-mono, monospace)",
                      textDecoration: "none",
                      transition: "transform var(--duration-fast, 150ms) var(--ease-spring)",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.transform = "scale(1.1)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.transform = "scale(1)";
                    }}
                  >
                    {app.abbrev}
                  </a>
                ))}
              </div>
            </div>

            {/* Footer links */}
            <div
              style={{
                padding: "10px 16px",
                display: "flex",
                gap: 16,
              }}
            >
              <a href={ID_BASE_URL} style={footerLinkStyle}>
                View full ID
              </a>
              <a href={`${ID_BASE_URL}/billing`} style={footerLinkStyle}>
                Billing
              </a>
              <a href={`${ID_BASE_URL}/connections`} style={footerLinkStyle}>
                Integrations
              </a>
            </div>
          </>
        ) : (
          /* No account - CTA state */
          <div style={{ padding: "20px 16px", textAlign: "center" }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: "50%",
                background: "var(--harvest-green-muted, rgba(61,124,71,0.10))",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 12px",
              }}
            >
              <span
                style={{
                  fontSize: 18,
                  fontWeight: 800,
                  color: "var(--harvest-green, #3D7C47)",
                  fontFamily: "var(--font-mono, monospace)",
                }}
              >
                K
              </span>
            </div>
            <p
              style={{
                margin: "0 0 4px",
                fontSize: 14,
                fontWeight: 600,
                color: "var(--text-primary, #1A1918)",
              }}
            >
              Connect your Kinetiks ID
            </p>
            <p
              style={{
                margin: "0 0 14px",
                fontSize: 12,
                color: "var(--text-tertiary, #9C9889)",
                lineHeight: 1.4,
              }}
            >
              Power Harvest with your business identity
            </p>
            <a
              href={`${ID_BASE_URL}/signup?from=harvest`}
              style={{
                display: "inline-block",
                padding: "8px 20px",
                background: "var(--harvest-green, #3D7C47)",
                color: "#FFFFFF",
                borderRadius: "var(--radius-md, 8px)",
                fontSize: 13,
                fontWeight: 600,
                textDecoration: "none",
                transition: "background var(--duration-fast, 150ms)",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background =
                  "var(--harvest-green-hover, #2E6336)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background =
                  "var(--harvest-green, #3D7C47)";
              }}
            >
              Get started
            </a>
          </div>
        )}
      </div>

      {/* ── Collapsed Pill Button ─────────────────────── */}
      <button
        onClick={toggle}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        aria-label={
          account
            ? `Kinetiks ID: ${account.codename}, ${score}% confidence`
            : "Open Kinetiks ID"
        }
        aria-expanded={expanded}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: "var(--surface-elevated, #FFFFFF)",
          color: "var(--text-primary, #1A1918)",
          border: `1px solid ${
            hovered || expanded
              ? "var(--harvest-green, #3D7C47)"
              : "var(--border-default, rgba(0,0,0,0.08))"
          }`,
          borderRadius: 24,
          padding: "7px 14px 7px 10px",
          cursor: "pointer",
          fontSize: 13,
          fontWeight: 500,
          fontFamily: "var(--font-sans)",
          boxShadow: hovered
            ? "var(--shadow-lg, 0 4px 16px rgba(0,0,0,0.08))"
            : "var(--shadow-md, 0 2px 8px rgba(0,0,0,0.06))",
          transition: [
            "border-color var(--duration-fast, 150ms)",
            "box-shadow var(--duration-fast, 150ms)",
            "transform var(--duration-fast, 150ms) var(--ease-spring, cubic-bezier(0.34,1.56,0.64,1))",
          ].join(", "),
          transform: hovered ? "scale(1.03)" : "scale(1)",
          outline: "none",
        }}
      >
        {/* Kinetiks logo: green circle with K */}
        <span
          style={{
            width: 24,
            height: 24,
            borderRadius: "50%",
            background: "var(--harvest-green, #3D7C47)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontSize: 13,
              fontWeight: 800,
              color: "#FFFFFF",
              fontFamily: "var(--font-mono, monospace)",
              lineHeight: 1,
            }}
          >
            K
          </span>
        </span>

        {/* Confidence score */}
        {account ? (
          <span
            style={{
              fontFamily: "var(--font-mono, monospace)",
              fontWeight: 600,
              fontSize: 13,
              color: "var(--text-primary, #1A1918)",
            }}
          >
            {score}%
          </span>
        ) : (
          <span
            style={{
              fontSize: 12,
              color: "var(--text-secondary, #6B6860)",
            }}
          >
            Kinetiks
          </span>
        )}
      </button>
    </div>
  );
}

/* ── Shared styles ─────────────────────────────────────────── */

const sectionHeaderStyle: React.CSSProperties = {
  margin: "0 0 8px",
  fontSize: 11,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: 0.5,
  color: "var(--text-tertiary, #9C9889)",
  fontFamily: "var(--font-sans)",
};

const footerLinkStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 500,
  color: "var(--harvest-green, #3D7C47)",
  textDecoration: "none",
  fontFamily: "var(--font-sans)",
  transition: "opacity var(--duration-fast, 150ms)",
};
