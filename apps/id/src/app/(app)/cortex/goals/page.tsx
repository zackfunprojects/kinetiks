export default function GoalsPage() {
  return (
    <div>
      <h1
        style={{
          fontSize: 24,
          fontWeight: 700,
          color: "var(--text-primary)",
          margin: "0 0 8px",
        }}
      >
        Goals
      </h1>
      <p
        style={{
          fontSize: 14,
          color: "var(--text-secondary)",
          margin: "0 0 32px",
        }}
      >
        KPI targets and OKRs for your GTM system
      </p>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: 48,
          borderRadius: 8,
          border: "1px dashed var(--border-default)",
          background: "var(--bg-surface)",
        }}
      >
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 12,
            background: "var(--accent-subtle)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 16,
          }}
        >
          <svg
            width={24}
            height={24}
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--text-tertiary)"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </div>
        <p
          style={{
            fontSize: 14,
            color: "var(--text-tertiary)",
            margin: 0,
            textAlign: "center",
            lineHeight: 1.5,
          }}
        >
          Goals will be configured here. Define KPI targets and OKRs to track
          your GTM performance.
        </p>
      </div>
    </div>
  );
}
