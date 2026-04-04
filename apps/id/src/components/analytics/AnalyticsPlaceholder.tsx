export function AnalyticsPlaceholder() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "calc(100vh - 200px)",
        textAlign: "center",
      }}
    >
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: 16,
          background: "var(--accent-subtle)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 20,
        }}
      >
        <svg
          width={32}
          height={32}
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
      <h2
        style={{
          fontSize: 20,
          fontWeight: 600,
          color: "var(--text-primary)",
          margin: "0 0 8px",
        }}
      >
        Analytics
      </h2>
      <p
        style={{
          fontSize: 14,
          color: "var(--text-tertiary)",
          margin: 0,
          maxWidth: 400,
          lineHeight: 1.5,
        }}
      >
        Cross-app performance dashboard powered by the Oracle. Goal tracking,
        trend visualization, and actionable insights - coming soon.
      </p>
    </div>
  );
}
