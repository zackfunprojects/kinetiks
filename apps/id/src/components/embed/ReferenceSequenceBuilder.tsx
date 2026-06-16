"use client";

import { useState } from "react";
import { Badge, Input, Pill } from "@kinetiks/ui";

/**
 * The minimal-but-representative reference surface (spec §13.1, fidelity:
 * minimal-but-representative). A small sequence-builder stub — a few editable
 * fields, a step list, and selectable segments — fixture-labeled. Rich enough
 * to host the presence layer (8.3) and annotations (8.4) without becoming a
 * second app: every editable element carries `data-component-id` /
 * `data-field-name` so those layers can anchor to it.
 */

const SEGMENTS = [
  { id: "fintech", label: "Fintech CFOs" },
  { id: "healthcare", label: "Healthcare CISOs" },
  { id: "enterprise", label: "Enterprise VPs" },
];

interface Step {
  id: string;
  channel: string;
  label: string;
}

export function ReferenceSequenceBuilder({
  systemName,
  entityId,
}: {
  systemName: string | null;
  entityId: string | null;
}) {
  const [topic, setTopic] = useState("New pricing");
  const [tone, setTone] = useState("Direct, value-led");
  const [segment, setSegment] = useState("fintech");
  const [steps, setSteps] = useState<Step[]>([
    { id: "step-1", channel: "Email", label: "Personalized opener" },
    { id: "step-2", channel: "LinkedIn", label: "Value follow-up" },
    { id: "step-3", channel: "Email", label: "Case-study close" },
  ]);

  const updateStep = (id: string, label: string) =>
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, label } : s)));

  return (
    <div style={{ padding: "var(--kt-s-6)", maxWidth: 560 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--kt-s-2)",
          marginBottom: "var(--kt-s-1)",
        }}
      >
        <span style={{ fontFamily: "var(--kt-font-serif)", fontSize: "var(--kt-fs-17)" }}>
          Sequence
        </span>
        <Badge label="fixture" variant="warning" />
      </div>
      <p
        className="kt-data-inline"
        style={{ margin: "0 0 var(--kt-s-5)", fontSize: "var(--kt-fs-11)", color: "var(--kt-fg-3)", fontFamily: "var(--kt-font-mono)" }}
      >
        {entityId ?? "new"} · {systemName ?? "Kinetiks"} can work here alongside you
      </p>

      {/* Segment selection */}
      <div data-component-id="sequence" data-field-name="segment" style={{ marginBottom: "var(--kt-s-4)" }}>
        <Label>Segment</Label>
        <div style={{ display: "flex", gap: "var(--kt-s-2)", flexWrap: "wrap" }}>
          {SEGMENTS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSegment(s.id)}
              style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}
              aria-pressed={segment === s.id}
            >
              <Pill tone={segment === s.id ? "accent" : "neutral"}>{s.label}</Pill>
            </button>
          ))}
        </div>
      </div>

      {/* Topic + tone */}
      <div data-component-id="sequence" data-field-name="topic" style={{ marginBottom: "var(--kt-s-4)" }}>
        <Label>Topic</Label>
        <Input value={topic} onChange={(e) => setTopic(e.target.value)} aria-label="Topic" />
      </div>
      <div data-component-id="sequence" data-field-name="tone" style={{ marginBottom: "var(--kt-s-5)" }}>
        <Label>Tone</Label>
        <Input value={tone} onChange={(e) => setTone(e.target.value)} aria-label="Tone" />
      </div>

      {/* Steps */}
      <Label>Steps</Label>
      <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "var(--kt-s-2)" }}>
        {steps.map((step) => (
          <li
            key={step.id}
            data-component-id={step.id}
            data-field-name="label"
            style={{ display: "flex", alignItems: "center", gap: "var(--kt-s-2)" }}
          >
            <span style={{ flexShrink: 0, width: 72 }}>
              <Pill tone="neutral">{step.channel}</Pill>
            </span>
            <Input
              value={step.label}
              onChange={(e) => updateStep(step.id, e.target.value)}
              aria-label={`${step.channel} step`}
            />
          </li>
        ))}
      </ol>
    </div>
  );
}

function Label({ children }: { children: string }) {
  return (
    <div
      style={{
        fontSize: "var(--kt-fs-12)",
        color: "var(--kt-fg-3)",
        marginBottom: "var(--kt-s-1)",
        fontWeight: "var(--kt-fw-med)",
      }}
    >
      {children}
    </div>
  );
}
