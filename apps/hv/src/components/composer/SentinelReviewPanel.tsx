"use client";

interface SentinelFlag {
  category: string;
  severity: string;
  detail: string;
  suggested_action?: string;
}

interface ReviewData {
  review_id: string;
  verdict: "approved" | "flagged" | "held";
  quality_score: number;
  flags: SentinelFlag[];
  compliance: { passed: boolean; rules_checked: Array<{ rule: string; passed: boolean }> } | null;
}

interface SentinelReviewPanelProps {
  review: ReviewData | null;
  loading: boolean;
  onReview: () => void;
  disabled: boolean;
}

const VERDICT_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  approved: { color: "var(--success, #3d8f46)", bg: "rgba(61,143,70,0.12)", label: "Approved" },
  flagged: { color: "var(--warning, #d4a017)", bg: "rgba(212,160,23,0.12)", label: "Flagged" },
  held: { color: "var(--error, #d44040)", bg: "rgba(212,64,64,0.12)", label: "Held" },
};

const SEVERITY_COLORS: Record<string, string> = {
  low: "var(--text-tertiary)",
  medium: "var(--warning, #d4a017)",
  high: "var(--error, #d44040)",
  critical: "var(--error, #d44040)",
};

export function SentinelReviewPanel({ review, loading, onReview, disabled }: SentinelReviewPanelProps) {
  return (
    <div
      style={{
        backgroundColor: "var(--surface-raised)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "8px",
        padding: "16px",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
        <h4
          style={{
            fontSize: "0.6875rem",
            fontWeight: 600,
            color: "var(--text-tertiary)",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            margin: 0,
          }}
        >
          Sentinel Review
        </h4>
        <button
          onClick={onReview}
          disabled={loading || disabled}
          style={{
            padding: "4px 10px",
            borderRadius: "4px",
            border: "none",
            backgroundColor: (disabled || loading) ? "var(--surface-elevated)" : "var(--harvest-green)",
            color: (disabled || loading) ? "var(--text-tertiary)" : "#fff",
            fontSize: "0.6875rem",
            fontWeight: 500,
            cursor: loading || disabled ? "default" : "pointer",
            opacity: loading || disabled ? 0.5 : 1,
          }}
        >
          {loading ? "Reviewing..." : "Review"}
        </button>
      </div>

      {!review && !loading && (
        <p style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", lineHeight: 1.5 }}>
          Generate an email, then review it with Sentinel before saving.
        </p>
      )}

      {review && (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {/* Verdict + score */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span
              style={{
                padding: "3px 10px",
                borderRadius: "4px",
                backgroundColor: VERDICT_CONFIG[review.verdict]?.bg ?? "var(--surface-elevated)",
                color: VERDICT_CONFIG[review.verdict]?.color ?? "var(--text-primary)",
                fontSize: "0.75rem",
                fontWeight: 600,
              }}
            >
              {VERDICT_CONFIG[review.verdict]?.label ?? review.verdict}
            </span>
            <span
              style={{
                fontSize: "0.75rem",
                fontFamily: "var(--font-mono, monospace), monospace",
                color: "var(--text-secondary)",
              }}
            >
              Score: {review.quality_score}/100
            </span>
          </div>

          {/* Flags */}
          {review.flags.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {review.flags.map((flag, i) => (
                <div
                  key={i}
                  style={{
                    padding: "8px 10px",
                    borderRadius: "6px",
                    backgroundColor: "var(--surface-base)",
                    border: "1px solid var(--border-subtle)",
                    fontSize: "0.75rem",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "2px" }}>
                    <span
                      style={{
                        fontSize: "0.625rem",
                        fontWeight: 600,
                        textTransform: "uppercase",
                        color: SEVERITY_COLORS[flag.severity] ?? "var(--text-tertiary)",
                      }}
                    >
                      {flag.severity}
                    </span>
                    <span style={{ color: "var(--text-secondary)" }}>{flag.category}</span>
                  </div>
                  <div style={{ color: "var(--text-primary)", lineHeight: 1.4 }}>{flag.detail}</div>
                  {flag.suggested_action && (
                    <div style={{ color: "var(--text-tertiary)", marginTop: "4px", fontStyle: "italic" }}>
                      {flag.suggested_action}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Compliance */}
          {review.compliance && (
            <div style={{ fontSize: "0.75rem" }}>
              <span style={{ color: review.compliance.passed ? "var(--success, #3d8f46)" : "var(--error, #d44040)", fontWeight: 500 }}>
                Compliance: {review.compliance.passed ? "Passed" : "Failed"}
              </span>
            </div>
          )}

          {review.verdict === "held" && (
            <p style={{ fontSize: "0.75rem", color: "var(--error, #d44040)", lineHeight: 1.5, margin: 0 }}>
              This email cannot be sent until the issues above are resolved. Edit the draft and review again.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
