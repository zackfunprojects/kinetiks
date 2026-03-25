"use client";

import { useState } from "react";

interface EducationScreenProps {
  fromApp: string | null;
  codename: string;
  bootstrapKey: string | null;
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
  bootstrapKey,
  onContinue,
}: EducationScreenProps) {
  const framing = getFraming(fromApp);
  const [showAgentSection, setShowAgentSection] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const mcpConfig = bootstrapKey
    ? JSON.stringify(
        {
          mcpServers: {
            kinetiks: {
              command: "npx",
              args: ["-y", "@kinetiks/mcp"],
              env: {
                KINETIKS_API_KEY: bootstrapKey,
                KINETIKS_API_URL: "https://id.kinetiks.ai",
              },
            },
          },
        },
        null,
        2
      )
    : null;

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

        {/* Agent access section */}
        {bootstrapKey && (
          <div className="mt-6" style={{ borderTop: "1px solid var(--border-muted)", paddingTop: 16 }}>
            <button
              onClick={() => setShowAgentSection(!showAgentSection)}
              className="flex w-full items-center justify-between text-xs"
              style={{ background: "none", border: "none", color: "var(--text-tertiary)", cursor: "pointer", padding: 0 }}
            >
              <span>Want an AI agent to do this for you?</span>
              <span style={{ fontSize: 10, transform: showAgentSection ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>
                ▼
              </span>
            </button>

            {showAgentSection && (
              <div className="mt-3 space-y-3">
                <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                  Add this key to your Claude Code MCP config. The agent can then run the entire onboarding for you.
                </p>

                {/* API Key */}
                <div>
                  <div className="mb-1 text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                    Your API key
                    <span className="ml-2 font-normal" style={{ color: "var(--error, #EF4444)" }}>
                      shown once - copy now
                    </span>
                  </div>
                  <div
                    className="flex items-center justify-between rounded px-3 py-2"
                    style={{
                      background: "var(--bg-inset)",
                      border: "1px solid var(--border-muted)",
                      fontFamily: "var(--font-mono), monospace",
                      fontSize: 11,
                    }}
                  >
                    <code style={{ color: "var(--text-primary)", wordBreak: "break-all" }}>{bootstrapKey}</code>
                    <button
                      onClick={() => handleCopy(bootstrapKey)}
                      className="ml-2 shrink-0 rounded px-2 py-1 text-xs"
                      style={{
                        background: copied ? "var(--success, #10B981)" : "var(--accent-muted)",
                        color: copied ? "#fff" : "var(--accent)",
                        border: "none",
                        cursor: "pointer",
                      }}
                    >
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </div>
                </div>

                {/* MCP Config */}
                {mcpConfig && (
                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                        Claude Code config
                      </span>
                      <button
                        onClick={() => handleCopy(mcpConfig)}
                        className="rounded px-2 py-0.5 text-xs"
                        style={{
                          background: "var(--accent-muted)",
                          color: "var(--accent)",
                          border: "none",
                          cursor: "pointer",
                        }}
                      >
                        Copy config
                      </button>
                    </div>
                    <pre
                      className="overflow-x-auto rounded p-3"
                      style={{
                        background: "var(--bg-inset)",
                        border: "1px solid var(--border-muted)",
                        fontSize: 10,
                        lineHeight: 1.5,
                        color: "var(--text-secondary)",
                        fontFamily: "var(--font-mono), monospace",
                        margin: 0,
                      }}
                    >
                      {mcpConfig}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
