"use client";

interface BatchApproveBarProps {
  quickCount: number;
  onBatchApprove: () => void;
  loading?: boolean;
}

export function BatchApproveBar({ quickCount, onBatchApprove, loading }: BatchApproveBarProps) {
  if (quickCount < 3) return null;

  return (
    <div
      style={{
        padding: "8px 12px",
        background: "var(--info-muted)",
        borderRadius: 8,
        marginBottom: 8,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <span style={{ fontSize: 12, color: "var(--info)" }}>
        {quickCount} quick approvals
      </span>
      <button
        onClick={onBatchApprove}
        disabled={loading}
        style={{
          padding: "4px 12px",
          borderRadius: 4,
          border: "none",
          background: "var(--info)",
          color: "#fff",
          fontSize: 11,
          fontWeight: 500,
          cursor: loading ? "not-allowed" : "pointer",
          opacity: loading ? 0.6 : 1,
        }}
      >
        {loading ? "Approving..." : "Approve all"}
      </button>
    </div>
  );
}
