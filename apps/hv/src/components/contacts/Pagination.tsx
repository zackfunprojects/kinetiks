"use client";

interface PaginationProps {
  page: number;
  perPage: number;
  total: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, perPage, total, onPageChange }: PaginationProps) {
  const totalPages = Math.ceil(total / perPage);
  const from = (page - 1) * perPage + 1;
  const to = Math.min(page * perPage, total);

  if (total === 0) return null;

  const buttonStyle: React.CSSProperties = {
    padding: "6px 12px",
    borderRadius: "6px",
    border: "1px solid var(--border-default)",
    backgroundColor: "var(--surface-raised)",
    color: "var(--text-secondary)",
    fontSize: "0.75rem",
    cursor: "pointer",
  };

  const disabledStyle: React.CSSProperties = {
    ...buttonStyle,
    opacity: 0.4,
    cursor: "default",
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "12px 0",
      }}
    >
      <span
        style={{
          fontSize: "0.75rem",
          color: "var(--text-tertiary)",
          fontFamily: "var(--font-mono, monospace), monospace",
        }}
      >
        {from}-{to} of {total}
      </span>
      <div style={{ display: "flex", gap: "4px" }}>
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          style={page <= 1 ? disabledStyle : buttonStyle}
        >
          Prev
        </button>
        <span
          style={{
            padding: "6px 10px",
            fontSize: "0.75rem",
            color: "var(--text-secondary)",
            fontFamily: "var(--font-mono, monospace), monospace",
          }}
        >
          {page}/{totalPages}
        </span>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          style={page >= totalPages ? disabledStyle : buttonStyle}
        >
          Next
        </button>
      </div>
    </div>
  );
}
