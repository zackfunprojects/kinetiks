"use client";

interface TagPillProps {
  tag: string;
  onRemove?: (tag: string) => void;
}

export function TagPill({ tag, onRemove }: TagPillProps) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        padding: "2px 8px",
        borderRadius: "4px",
        backgroundColor: "rgba(90,173,98,0.10)",
        color: "var(--accent-primary)",
        fontSize: "0.6875rem",
        fontWeight: 500,
        lineHeight: 1.4,
      }}
    >
      {tag}
      {onRemove && (
        <button
          onClick={() => onRemove(tag)}
          style={{
            background: "none",
            border: "none",
            color: "var(--accent-primary)",
            cursor: "pointer",
            padding: 0,
            fontSize: "0.75rem",
            lineHeight: 1,
            opacity: 0.6,
          }}
          aria-label={`Remove tag ${tag}`}
        >
          ×
        </button>
      )}
    </span>
  );
}
