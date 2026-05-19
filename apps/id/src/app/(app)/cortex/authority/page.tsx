import { Pill } from "@kinetiks/ui";

export const dynamic = "force-dynamic";

export default function AuthorityPage() {
  return (
    <div>
      <h1
        style={{
          fontSize: "var(--kt-fs-24)",
          fontWeight: "var(--kt-fw-bold)",
          color: "var(--kt-fg-1)",
          margin: "0 0 var(--kt-s-2)",
        }}
      >
        Authority
      </h1>
      <p
        style={{
          fontSize: "var(--kt-fs-14)",
          color: "var(--kt-fg-2)",
          margin: "0 0 var(--kt-s-6)",
        }}
      >
        Review and approve what your system can do on your behalf
      </p>

      <div
        style={{
          border: "1px solid var(--kt-border-2)",
          borderRadius: "var(--kt-radius-2)",
          padding: "var(--kt-s-5)",
          background: "var(--kt-bg-subtle)",
          maxWidth: 720,
        }}
      >
        <div style={{ marginBottom: "var(--kt-s-3)" }}>
          <Pill tone="neutral">Coming in Phase 4</Pill>
        </div>
        <h2
          style={{
            fontSize: "var(--kt-fs-17)",
            fontWeight: "var(--kt-fw-semi)",
            color: "var(--kt-fg-1)",
            margin: "0 0 var(--kt-s-2)",
          }}
        >
          Scoped, time-bounded permissions
        </h2>
        <p
          style={{
            fontSize: "var(--kt-fs-14)",
            lineHeight: "var(--kt-lh-body)",
            color: "var(--kt-fg-2)",
            margin: "0 0 var(--kt-s-3)",
          }}
        >
          This is where you&apos;ll review and approve what your system can do for you: which actions, in
          what context, against which limits, and for how long. Every proposal is written in plain language and
          backed by the evidence your system has gathered about your operation.
        </p>
        <p
          style={{
            fontSize: "var(--kt-fs-14)",
            lineHeight: "var(--kt-lh-body)",
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
