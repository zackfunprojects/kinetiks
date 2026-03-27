"use client";

import { useState } from "react";
import type { SenderProfile } from "@/types/onboarding";

interface SenderProfileStepProps {
  initialProfile: SenderProfile | null;
  submitting: boolean;
  onComplete: (profile: SenderProfile) => void;
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--border-default)",
  backgroundColor: "var(--surface-base)",
  color: "var(--text-primary)",
  fontSize: 13,
  outline: "none",
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  fontWeight: 500,
  color: "var(--text-secondary)",
  marginBottom: 6,
};

export default function SenderProfileStep({ initialProfile, submitting, onComplete }: SenderProfileStepProps) {
  const [profile, setProfile] = useState<SenderProfile>({
    name: initialProfile?.name ?? "",
    title: initialProfile?.title ?? "",
    company: initialProfile?.company ?? "",
    product_description: initialProfile?.product_description ?? "",
    email: initialProfile?.email ?? "",
    phone: initialProfile?.phone ?? null,
    linkedin: initialProfile?.linkedin ?? null,
  });
  const [aiFilling, setAiFilling] = useState(false);

  function update(field: keyof SenderProfile, value: string) {
    setProfile((prev) => ({ ...prev, [field]: value || (field === "phone" || field === "linkedin" ? null : "") }));
  }

  async function handleAiFill() {
    setAiFilling(true);
    try {
      const res = await fetch("/api/hv/icp");
      if (!res.ok) return;
      const json = await res.json();

      // The ICP endpoint also gives us org data via the synapse context.
      // We also try to pull org data directly.
      const orgRes = await fetch("/api/hv/icp");
      let orgData: Record<string, unknown> = {};
      if (orgRes.ok) {
        const orgJson = await orgRes.json();
        orgData = orgJson.data ?? {};
      }

      // Try pulling org context through a different approach - fetch the synapse context
      const ctxRes = await fetch("/api/hv/templates/generate", { method: "OPTIONS" }).catch(() => null);

      // Best effort: pull from what we have
      // The ICP data has personas, but we need org data for company/product
      // Let's try fetching the outreach goal config which may have sender_profile
      const configRes = await fetch("/api/hv/onboarding");
      if (configRes.ok) {
        const configJson = await configRes.json();
        const sp = configJson.data?.sender_profile;
        if (sp) {
          setProfile((prev) => ({
            ...prev,
            name: prev.name || sp.name || "",
            title: prev.title || sp.title || "",
            company: prev.company || sp.company || "",
            product_description: prev.product_description || sp.product_description || "",
            email: prev.email || sp.email || "",
          }));
          return;
        }
      }

      // If no existing sender profile, try to extract from personas
      if (json.data?.personas?.length > 0) {
        // Personas describe the ICP, not the sender - but the org data is useful
        // We don't have direct org access from the client, so just note it
      }
    } catch (err) {
      console.error("AI fill failed:", err);
    } finally {
      setAiFilling(false);
    }
  }

  function handleSubmit() {
    if (!profile.name.trim() || !profile.company.trim() || !profile.email.trim()) return;
    onComplete(profile);
  }

  const isValid = profile.name.trim() && profile.company.trim() && profile.email.trim();

  return (
    <div>
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "var(--space-5)",
      }}>
        <div>
          <h2 style={{
            fontSize: 16,
            fontWeight: 600,
            color: "var(--text-primary)",
            margin: 0,
          }}>
            Sender Profile
          </h2>
          <p style={{ fontSize: 13, color: "var(--text-tertiary)", margin: "4px 0 0" }}>
            Who are you? This information appears in your outreach.
          </p>
        </div>
        <button
          onClick={handleAiFill}
          disabled={aiFilling}
          style={{
            padding: "6px 14px",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--border-default)",
            backgroundColor: "var(--surface-base)",
            color: "var(--text-secondary)",
            fontSize: 12,
            fontWeight: 500,
            cursor: aiFilling ? "not-allowed" : "pointer",
            opacity: aiFilling ? 0.6 : 1,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <span style={{ fontSize: 14 }}>&#10024;</span>
          {aiFilling ? "Pulling..." : "AI Fill"}
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
        {/* Name */}
        <div>
          <label style={labelStyle}>Full Name *</label>
          <input
            type="text"
            value={profile.name}
            onChange={(e) => update("name", e.target.value)}
            placeholder="Jane Smith"
            style={inputStyle}
          />
        </div>

        {/* Title */}
        <div>
          <label style={labelStyle}>Title</label>
          <input
            type="text"
            value={profile.title}
            onChange={(e) => update("title", e.target.value)}
            placeholder="VP of Sales"
            style={inputStyle}
          />
        </div>

        {/* Company */}
        <div>
          <label style={labelStyle}>Company *</label>
          <input
            type="text"
            value={profile.company}
            onChange={(e) => update("company", e.target.value)}
            placeholder="Acme Corp"
            style={inputStyle}
          />
        </div>

        {/* Product Description */}
        <div>
          <label style={labelStyle}>Product Description</label>
          <textarea
            value={profile.product_description}
            onChange={(e) => update("product_description", e.target.value)}
            placeholder="Brief description of what you sell and who you sell to"
            rows={3}
            style={{
              ...inputStyle,
              resize: "vertical",
              fontFamily: "inherit",
            }}
          />
        </div>

        {/* Email */}
        <div>
          <label style={labelStyle}>Email *</label>
          <input
            type="email"
            value={profile.email}
            onChange={(e) => update("email", e.target.value)}
            placeholder="jane@acme.com"
            style={inputStyle}
          />
        </div>

        {/* Phone (optional) */}
        <div>
          <label style={labelStyle}>Phone (optional)</label>
          <input
            type="tel"
            value={profile.phone ?? ""}
            onChange={(e) => update("phone", e.target.value)}
            placeholder="+1 (555) 123-4567"
            style={inputStyle}
          />
        </div>

        {/* LinkedIn (optional) */}
        <div>
          <label style={labelStyle}>LinkedIn (optional)</label>
          <input
            type="url"
            value={profile.linkedin ?? ""}
            onChange={(e) => update("linkedin", e.target.value)}
            placeholder="https://linkedin.com/in/janesmith"
            style={inputStyle}
          />
        </div>
      </div>

      {/* Continue button */}
      <div style={{ marginTop: "var(--space-6)", display: "flex", justifyContent: "flex-end" }}>
        <button
          onClick={handleSubmit}
          disabled={!isValid || submitting}
          style={{
            padding: "10px 24px",
            borderRadius: "var(--radius-md)",
            border: "none",
            backgroundColor: isValid ? "var(--harvest-green)" : "var(--border-default)",
            color: isValid ? "#fff" : "var(--text-tertiary)",
            fontSize: 14,
            fontWeight: 600,
            cursor: isValid && !submitting ? "pointer" : "not-allowed",
            transition: "all 0.2s",
          }}
        >
          {submitting ? "Saving..." : "Continue"}
        </button>
      </div>
    </div>
  );
}
