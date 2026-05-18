export const dynamic = "force-dynamic";

export default function AuthorityPage() {
  return (
    <div>
      <h1
        style={{
          fontSize: 24,
          fontWeight: 700,
          color: "var(--kt-fg-1)",
          margin: "0 0 8px",
        }}
      >
        Authority
      </h1>
      <p
        style={{
          fontSize: 14,
          color: "var(--kt-fg-2)",
          margin: "0 0 32px",
        }}
      >
        Review and approve what your system can do on your behalf
      </p>

      <div
        style={{
          border: "1px solid var(--kt-border-2)",
          borderRadius: 8,
          padding: "24px 28px",
          background: "var(--kt-bg-subtle)",
          maxWidth: 720,
        }}
      >
        <div
          style={{
            display: "inline-block",
            fontSize: 10,
            fontWeight: 500,
            letterSpacing: 0.4,
            textTransform: "uppercase",
            color: "var(--kt-fg-3)",
            fontFamily: "var(--font-mono), monospace",
            border: "1px solid var(--kt-border-2)",
            borderRadius: 4,
            padding: "2px 8px",
            marginBottom: 14,
          }}
        >
          Coming in Phase 4
        </div>
        <h2
          style={{
            fontSize: 16,
            fontWeight: 600,
            color: "var(--kt-fg-1)",
            margin: "0 0 10px",
          }}
        >
          Scoped, time-bounded permissions
        </h2>
        <p
          style={{
            fontSize: 14,
            lineHeight: 1.55,
            color: "var(--kt-fg-2)",
            margin: "0 0 12px",
          }}
        >
          This is where you&apos;ll review and approve what your system can do for you &mdash; which actions, in
          what context, against which limits, and for how long. Every proposal is written in plain language and
          backed by the evidence your system has gathered about your operation.
        </p>
        <p
          style={{
            fontSize: 14,
            lineHeight: 1.55,
            color: "var(--kt-fg-2)",
            margin: 0,
          }}
        >
          You&apos;ll be able to pause, narrow, or revoke any permission at any moment. Nothing is ever active
          without your explicit approval.
        </p>
      </div>
    </div>
  );
}
