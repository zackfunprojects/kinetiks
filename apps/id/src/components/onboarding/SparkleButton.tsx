interface SparkleButtonProps {
  onFill: () => void;
  loading?: boolean;
  disabled?: boolean;
  label?: string;
}

export function SparkleButton({ onFill, loading, disabled, label }: SparkleButtonProps) {
  return (
    <button
      onClick={onFill}
      disabled={disabled || loading}
      title={label ?? "AI fill"}
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs transition-colors disabled:opacity-40"
      style={{
        background: "transparent",
        border: "none",
        color: "var(--text-tertiary)",
        cursor: disabled || loading ? "default" : "pointer",
      }}
      onMouseEnter={(e) => {
        if (!disabled && !loading) {
          e.currentTarget.style.color = "var(--accent)";
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = "var(--text-tertiary)";
      }}
    >
      {loading ? (
        <div
          className="h-3.5 w-3.5 animate-spin rounded-full border border-t-transparent"
          style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }}
        />
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3l1.912 5.813a2 2 0 001.275 1.275L21 12l-5.813 1.912a2 2 0 00-1.275 1.275L12 21l-1.912-5.813a2 2 0 00-1.275-1.275L3 12l5.813-1.912a2 2 0 001.275-1.275L12 3z" />
        </svg>
      )}
      {label && <span>{label}</span>}
    </button>
  );
}
