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

const SHARED_BODY =
  "We'll spend about 15 minutes learning your business - your voice, your customers, your story. Your Kinetiks ID also powers other growth tools you can activate later.";

const DEFAULT_FRAMING = {
  heading: "Build your business identity",
  body: SHARED_BODY,
};

function getFraming(fromApp: string | null): { heading: string; body: string } {
  if (!fromApp) return DEFAULT_FRAMING;
  const displayName = APP_DISPLAY_NAMES[fromApp];
  if (!displayName) return DEFAULT_FRAMING;
  return {
    heading: `Learn your voice for ${displayName}`,
    body: SHARED_BODY,
  };
}

export function EducationScreen({
  fromApp,
  codename,
  onContinue,
}: EducationScreenProps) {
  const framing = getFraming(fromApp);

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div
        className="w-full max-w-lg rounded-xl p-12 text-center"
        style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}
      >
        <div
          className="mb-6 inline-block rounded px-4 py-1.5 text-sm font-semibold"
          style={{
            background: "var(--accent-muted)",
            color: "var(--accent)",
            fontFamily: "var(--font-mono), monospace",
          }}
        >
          {">"} {codename}
        </div>

        <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
          {framing.heading}
        </h1>

        <p className="mt-3 text-[15px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          {framing.body}
        </p>

        <div className="mt-10">
          <button
            onClick={onContinue}
            className="rounded-lg px-8 py-3 text-sm font-semibold transition-colors"
            style={{
              background: "var(--accent-emphasis)",
              color: "var(--text-on-accent)",
            }}
          >
            Let's get started
          </button>
        </div>
      </div>
    </div>
  );
}
