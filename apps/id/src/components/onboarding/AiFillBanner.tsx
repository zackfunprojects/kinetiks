interface AiFillBannerProps {
  onFillAll: () => void;
  loading?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  label?: string;
  sublabel?: string;
}

export function AiFillBanner({
  onFillAll,
  loading,
  disabled,
  disabledReason,
  label = "Let AI fill this step",
  sublabel = "Uses your website data and industry knowledge",
}: AiFillBannerProps) {
  return (
    <button
      onClick={onFillAll}
      disabled={disabled || loading}
      className="mb-5 flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left transition-colors disabled:opacity-50"
      style={{
        background: "var(--accent-muted)",
        borderLeft: "3px solid var(--accent)",
        border: "none",
        borderLeftWidth: 3,
        borderLeftStyle: "solid",
        borderLeftColor: disabled ? "var(--border-default)" : "var(--accent)",
        cursor: disabled || loading ? "default" : "pointer",
      }}
    >
      {loading ? (
        <div
          className="h-4 w-4 flex-shrink-0 animate-spin rounded-full border-2 border-t-transparent"
          style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }}
        />
      ) : (
        <svg
          className="h-4 w-4 flex-shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke={disabled ? "var(--text-tertiary)" : "var(--accent)"}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 3l1.912 5.813a2 2 0 001.275 1.275L21 12l-5.813 1.912a2 2 0 00-1.275 1.275L12 21l-1.912-5.813a2 2 0 00-1.275-1.275L3 12l5.813-1.912a2 2 0 001.275-1.275L12 3z" />
        </svg>
      )}
      <div>
        <div
          className="text-sm font-medium"
          style={{ color: disabled ? "var(--text-tertiary)" : "var(--accent)" }}
        >
          {loading ? "Filling with AI..." : label}
        </div>
        <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>
          {disabled && disabledReason ? disabledReason : sublabel}
        </div>
      </div>
    </button>
  );
}
