"use client";

interface EducationScreenProps {
  fromApp: string | null;
  codename: string;
  onContinue: () => void;
}

const APP_DISPLAY_NAMES: Record<string, string> = {
  dark_madder: "Dark Madder",
  harvest: "Harvest",
  hypothesis: "Hypothesis",
  litmus: "Litmus",
};

const APP_DESCRIPTIONS: Record<string, string> = {
  dark_madder: "creates content that sounds like you, not AI",
  harvest: "sends outreach that connects with the right people",
  hypothesis: "builds landing pages that speak to your audience",
  litmus: "pitches journalists with stories they actually want to cover",
};

interface Framing {
  heading: string;
  subheading: string;
  explanation: string;
  valueProps: Array<{ icon: string; title: string; description: string }>;
  cta: string;
}

function getFraming(fromApp: string | null): Framing {
  const displayName = fromApp ? APP_DISPLAY_NAMES[fromApp] : null;
  const appDesc = fromApp ? APP_DESCRIPTIONS[fromApp] : null;

  const sharedValueProps = [
    {
      icon: "M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z",
      title: "Teach it once, use everywhere",
      description: "Your voice, customers, story, and brand - captured once, powering every tool in the ecosystem.",
    },
    {
      icon: "M13 10V3L4 14h7v7l9-11h-7z",
      title: "It gets smarter over time",
      description: "Every piece of content created, every outreach sent, every result tracked - feeds back into your ID automatically.",
    },
    {
      icon: "M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z",
      title: "One identity, many tools",
      description: "Content, outbound, landing pages, PR - all powered by the same understanding of your business.",
    },
  ];

  if (displayName && appDesc) {
    return {
      heading: `${displayName} is powered by your Kinetiks ID`,
      subheading: `${displayName} ${appDesc}. But first, it needs to understand your business.`,
      explanation: "Your Kinetiks ID is a living profile of your company - your voice, products, customers, narrative, and brand. We'll build it together in about 15 minutes, and it powers everything from here.",
      valueProps: sharedValueProps,
      cta: `Build my ID, then take me to ${displayName}`,
    };
  }

  return {
    heading: "Your Kinetiks ID",
    subheading: "A single business identity that powers every growth tool in the Kinetiks ecosystem.",
    explanation: "We'll spend about 15 minutes learning your business - crawling your website, asking a few questions, and calibrating your voice. The result is a living profile that gets smarter over time and makes every tool in the platform sound like you.",
    valueProps: sharedValueProps,
    cta: "Build my Kinetiks ID",
  };
}

export function EducationScreen({
  fromApp,
  codename,
  onContinue,
}: EducationScreenProps) {
  const framing = getFraming(fromApp);

  return (
    <div className="flex min-h-[60vh] items-center justify-center py-12">
      <div
        className="w-full max-w-2xl rounded-xl p-10"
        style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}
      >
        {/* Codename badge */}
        <div
          className="mb-6 inline-block rounded px-3 py-1 text-xs font-medium"
          style={{
            background: "var(--accent-muted)",
            color: "var(--accent)",
            fontFamily: "var(--font-mono), monospace",
          }}
        >
          {">"} {codename}
        </div>

        {/* Heading */}
        <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
          {framing.heading}
        </h1>

        <p className="mt-2 text-[15px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          {framing.subheading}
        </p>

        {/* Explanation */}
        <p className="mt-4 text-sm leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
          {framing.explanation}
        </p>

        {/* Value props */}
        <div className="mt-8 space-y-4">
          {framing.valueProps.map((prop) => (
            <div
              key={prop.title}
              className="flex gap-4 rounded-lg p-4"
              style={{ background: "var(--bg-surface-raised)" }}
            >
              <div className="flex-shrink-0 mt-0.5">
                <svg
                  width={20}
                  height={20}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--text-secondary)"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d={prop.icon} />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                  {prop.title}
                </h3>
                <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                  {prop.description}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* What we'll do */}
        <div
          className="mt-8 rounded-lg p-4"
          style={{ border: "1px solid var(--border-muted)" }}
        >
          <p
            className="mb-3 text-xs font-semibold uppercase tracking-wide"
            style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono), monospace" }}
          >
            What happens next
          </p>
          <div className="flex gap-6">
            {[
              { step: "1", label: "We crawl your website" },
              { step: "2", label: "We ask a few questions" },
              { step: "3", label: "We calibrate your voice" },
            ].map((item) => (
              <div key={item.step} className="flex items-center gap-2">
                <span
                  className="flex h-5 w-5 items-center justify-center rounded text-[10px] font-semibold"
                  style={{
                    background: "var(--accent-muted)",
                    color: "var(--accent)",
                    fontFamily: "var(--font-mono), monospace",
                  }}
                >
                  {item.step}
                </span>
                <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                  {item.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="mt-8">
          <button
            onClick={onContinue}
            className="w-full rounded-lg px-8 py-3 text-sm font-semibold transition-colors"
            style={{
              background: "var(--accent-emphasis)",
              color: "var(--text-on-accent)",
            }}
          >
            {framing.cta}
          </button>
          <p className="mt-3 text-center text-xs" style={{ color: "var(--text-tertiary)" }}>
            Takes about 15 minutes. You can skip sections and come back later.
          </p>
        </div>
      </div>
    </div>
  );
}
