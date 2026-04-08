import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6 py-16">
      <p
        className="mb-3 text-xs font-medium uppercase tracking-widest"
        style={{ color: "var(--text-tertiary)" }}
      >
        DeskOf
      </p>
      <h1
        className="mb-4 text-4xl font-semibold leading-tight"
        style={{ color: "var(--text-primary)" }}
      >
        AI-powered discovery,
        <br />
        human-only publishing.
      </h1>
      <p
        className="mb-10 text-lg leading-relaxed"
        style={{ color: "var(--text-secondary)" }}
      >
        DeskOf finds the conversations on Reddit and Quora where your
        expertise is the right answer, then helps you show up effectively
        and tracks the compounding value of your contributions.
      </p>
      <div className="flex gap-3">
        <Link
          href="/onboarding"
          className="rounded-full px-5 py-2.5 text-sm font-medium"
          style={{
            background: "var(--accent)",
            color: "#ffffff",
          }}
        >
          Get started
        </Link>
        <Link
          href="/write"
          className="rounded-full border px-5 py-2.5 text-sm font-medium"
          style={{
            borderColor: "var(--border)",
            color: "var(--text-primary)",
          }}
        >
          Open Write tab
        </Link>
      </div>
      <p
        className="mt-12 text-xs"
        style={{ color: "var(--text-tertiary)" }}
      >
        Phase 1 scaffold. The full Write loop ships in Phase 2.
      </p>
    </main>
  );
}
