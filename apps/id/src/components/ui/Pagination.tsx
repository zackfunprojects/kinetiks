"use client";

interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, totalPages, onPageChange }: PaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        marginTop: 24,
      }}
    >
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        style={{
          padding: "6px 12px",
          border: "1px solid var(--kt-border-1)",
          borderRadius: 6,
          background: page <= 1 ? "var(--kt-bg-muted)" : "var(--kt-bg-subtle)",
          color: page <= 1 ? "var(--kt-fg-3)" : "var(--kt-fg-2)",
          cursor: page <= 1 ? "not-allowed" : "pointer",
          fontSize: 13,
          fontWeight: 500,
        }}
      >
        Previous
      </button>
      <span style={{ fontSize: 13, color: "var(--kt-fg-3)", fontFamily: "var(--font-mono), monospace" }}>
        {page} of {totalPages}
      </span>
      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        style={{
          padding: "6px 12px",
          border: "1px solid var(--kt-border-1)",
          borderRadius: 6,
          background: page >= totalPages ? "var(--kt-bg-muted)" : "var(--kt-bg-subtle)",
          color: page >= totalPages ? "var(--kt-fg-3)" : "var(--kt-fg-2)",
          cursor: page >= totalPages ? "not-allowed" : "pointer",
          fontSize: 13,
          fontWeight: 500,
        }}
      >
        Next
      </button>
    </div>
  );
}
