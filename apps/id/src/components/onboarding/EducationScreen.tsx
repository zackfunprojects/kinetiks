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
  valueProps: string[];
  cta: string;
}

function getFraming(fromApp: string | null): Framing {
  const displayName = fromApp ? APP_DISPLAY_NAMES[fromApp] : null;
  const appDesc = fromApp ? APP_DESCRIPTIONS[fromApp] : null;

  if (displayName && appDesc) {
    return {
      heading: `${displayName} is powered by your Kinetiks ID`,
      subheading: `${displayName} ${appDesc}. To do that well, Kinetiks AI needs to understand your business.`,
      valueProps: [
        "Teach it once, use everywhere - your voice, customers, and story power every tool",
        "It gets smarter over time as you use the platform",
        "Skip any section and come back later",
      ],
      cta: `Build my ID, take me to ${displayName}`,
    };
  }

  return {
    heading: "Your Kinetiks ID",
    subheading: "A single business identity that powers every growth tool in the Kinetiks ecosystem. Kinetiks AI will learn your voice, products, customers, and story - then use that understanding across every tool.",
    valueProps: [
      "Teach it once, use everywhere - your voice, customers, and story power every tool",
      "It gets smarter over time as you use the platform",
      "Skip any section and come back later",
    ],
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
    <div
      className="flex items-center justify-center px-4"
      style={{ minHeight: "calc(100vh - 80px)" }}
    >
      <div
        className="w-full max-w-lg rounded-xl p-8"
        style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}
      >
        {/* Codename */}
        <div
          className="mb-4 inline-block rounded px-3 py-1 text-xs font-medium"
          style={{
            background: "var(--accent-muted)",
            color: "var(--accent)",
            fontFamily: "var(--font-mono), monospace",
          }}
        >
          {">"} {codename}
        </div>

        {/* Heading + subheading */}
        <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>
          {framing.heading}
        </h1>
        <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          {framing.subheading}
        </p>

        {/* Value props - compact inline list */}
        <ul className="mt-5 space-y-2">
          {framing.valueProps.map((prop) => (
            <li key={prop} className="flex items-start gap-2 text-sm" style={{ color: "var(--text-secondary)" }}>
              <span style={{ color: "var(--text-tertiary)", marginTop: 1 }}>-</span>
              {prop}
            </li>
          ))}
        </ul>

        {/* CTA */}
        <button
          onClick={onContinue}
          className="mt-6 w-full rounded-lg px-8 py-3 text-sm font-semibold transition-colors"
          style={{
            background: "var(--accent-emphasis)",
            color: "var(--text-on-accent)",
          }}
        >
          {framing.cta}
        </button>
        <p className="mt-2 text-center text-xs" style={{ color: "var(--text-tertiary)" }}>
          About 15 minutes. Skip anything, come back anytime.
        </p>
      </div>
    </div>
  );
}
