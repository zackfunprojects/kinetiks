"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { ContactSelector } from "./ContactSelector";
import { ResearchBriefPanel } from "./ResearchBriefPanel";
import { StyleConfigurator } from "./StyleConfigurator";
import { DraftEditor } from "./DraftEditor";
import { SentinelReviewPanel } from "./SentinelReviewPanel";
import { DEFAULT_STYLE_CONFIG } from "@/lib/composer/styles";
import type { HvContact } from "@/types/contacts";
import type { ResearchBrief, ResearchTier, EmailStyleConfig, StylePreset } from "@/types/composer";

interface ComposeViewProps {
  initialContactId?: string;
}

interface ReviewData {
  review_id: string;
  verdict: "approved" | "flagged" | "held";
  quality_score: number;
  flags: Array<{ category: string; severity: string; detail: string; suggested_action?: string }>;
  compliance: { passed: boolean; rules_checked: Array<{ rule: string; passed: boolean }> } | null;
}

export function ComposeView({ initialContactId }: ComposeViewProps) {
  const [contact, setContact] = useState<HvContact | null>(null);
  const [brief, setBrief] = useState<ResearchBrief | null>(null);
  const [style, setStyle] = useState<EmailStyleConfig>(DEFAULT_STYLE_CONFIG);
  const [presets, setPresets] = useState<StylePreset[]>([]);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [review, setReview] = useState<ReviewData | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);

  const [loadingBrief, setLoadingBrief] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Request version counter to prevent stale responses from overwriting state
  const requestVersion = useRef(0);

  // Load initial contact if provided
  useEffect(() => {
    if (!initialContactId) return;
    fetch(`/api/hv/contacts/${initialContactId}`)
      .then((r) => r.json())
      .then((res) => { if (res.success) setContact(res.data); })
      .catch(() => {});
  }, [initialContactId]);

  // Load style presets
  useEffect(() => {
    fetch("/api/hv/composer/styles")
      .then((r) => r.json())
      .then((res) => {
        if (res.success && res.data.presets) {
          setPresets(res.data.presets);
          const defaultPreset = res.data.presets.find((p: StylePreset) => p.is_default);
          if (defaultPreset) setStyle(defaultPreset.config);
        }
      })
      .catch(() => {});
  }, []);

  // Generate research brief
  const handleGenerateBrief = useCallback(async (tier: ResearchTier) => {
    if (!contact) return;
    const version = ++requestVersion.current;
    setLoadingBrief(true);
    setError(null);
    try {
      const res = await fetch("/api/hv/composer/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact_id: contact.id, tier }),
      });
      const data = await res.json();
      if (version !== requestVersion.current) return; // stale response
      if (data.success) {
        setBrief(data.data.brief);
      } else {
        setError(data.error || "Failed to generate research brief");
      }
    } catch {
      if (version === requestVersion.current) setError("Network error generating brief");
    } finally {
      if (version === requestVersion.current) setLoadingBrief(false);
    }
  }, [contact]);

  // Auto-generate brief when contact is selected
  useEffect(() => {
    if (contact && !brief) {
      handleGenerateBrief("brief");
    }
  }, [contact, brief, handleGenerateBrief]);

  // Generate email draft
  const handleGenerate = async () => {
    if (!contact || !brief) return;
    const version = ++requestVersion.current;
    setGenerating(true);
    setReview(null);
    setError(null);
    try {
      const res = await fetch("/api/hv/composer/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact_id: contact.id,
          research_brief: brief,
          style,
        }),
      });
      const data = await res.json();
      if (version !== requestVersion.current) return;
      if (data.success) {
        setSubject(data.data.subject);
        setBody(data.data.body);
      } else {
        setError(data.error || "Failed to generate email");
      }
    } catch {
      if (version === requestVersion.current) setError("Network error generating email");
    } finally {
      if (version === requestVersion.current) setGenerating(false);
    }
  };

  // Run Sentinel review
  const handleReview = async () => {
    if (!subject || !body) return;
    setReviewing(true);
    setError(null);
    try {
      const res = await fetch("/api/hv/composer/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject,
          body,
          contact_email: contact?.email,
          org_domain: contact?.organization
            ? (contact.organization as { domain?: string }).domain
            : undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setReview(data.data);
      } else {
        setError(data.error || "Sentinel review failed");
      }
    } catch {
      setError("Network error during review");
    } finally {
      setReviewing(false);
    }
  };

  // Save draft
  const handleSave = async () => {
    if (!contact || !subject || !body) return;
    setSaving(true);
    setError(null);
    try {
      const endpoint = draftId
        ? `/api/hv/emails/${draftId}`
        : "/api/hv/emails";
      const method = draftId ? "PATCH" : "POST";

      const payload: Record<string, unknown> = {
        subject,
        body,
        research_brief: brief,
        style_config: style,
        sentinel_verdict: review?.verdict ?? null,
        sentinel_quality_score: review?.quality_score ?? null,
        sentinel_flags: review?.flags ?? null,
      };

      if (!draftId) {
        payload.contact_id = contact.id;
        payload.org_id = contact.org_id;
        payload.status = "draft";
      }

      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        if (!draftId) setDraftId(data.data.id);
      } else {
        setError(data.error || "Failed to save draft");
      }
    } catch {
      setError("Network error saving draft");
    } finally {
      setSaving(false);
    }
  };

  // Save style preset
  const handleSavePreset = async (name: string) => {
    try {
      const res = await fetch("/api/hv/composer/styles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, config: style }),
      });
      const data = await res.json();
      if (data.success) {
        setPresets((prev) => [...prev, data.data.preset]);
      }
    } catch {
      setError("Failed to save preset");
    }
  };

  const hasContent = subject.length > 0 && body.length > 0;
  const canSave = hasContent && contact;

  return (
    <div style={{ display: "flex", gap: "24px" }}>
      {/* Left column - main composer */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "16px" }}>
        <ContactSelector
          selectedContact={contact}
          onSelect={(c) => { setContact(c); setBrief(null); setSubject(""); setBody(""); setReview(null); setDraftId(null); }}
          onClear={() => { setContact(null); setBrief(null); setSubject(""); setBody(""); setReview(null); setDraftId(null); }}
        />

        {error && (
          <div style={{ padding: "10px 14px", borderRadius: "6px", backgroundColor: "rgba(212,64,64,0.1)", border: "1px solid rgba(212,64,64,0.2)", color: "var(--error, #d44040)", fontSize: "0.8125rem" }}>
            {error}
          </div>
        )}

        <DraftEditor
          subject={subject}
          body={body}
          onSubjectChange={(s) => { setSubject(s); setReview(null); }}
          onBodyChange={(b) => { setBody(b); setReview(null); }}
        />

        {/* Action bar */}
        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
          <button
            onClick={handleGenerate}
            disabled={!contact || !brief || generating}
            style={{
              padding: "8px 16px",
              borderRadius: "6px",
              border: "none",
              backgroundColor: !contact || !brief ? "var(--surface-elevated)" : "var(--harvest-green)",
              color: !contact || !brief ? "var(--text-tertiary)" : "#fff",
              fontSize: "0.8125rem",
              fontWeight: 500,
              cursor: !contact || !brief || generating ? "default" : "pointer",
              opacity: !contact || !brief || generating ? 0.5 : 1,
            }}
          >
            {generating ? "Generating..." : "Generate Email"}
          </button>

          <button
            onClick={handleSave}
            disabled={!canSave || saving}
            style={{
              padding: "8px 16px",
              borderRadius: "6px",
              border: "1px solid var(--border-default)",
              backgroundColor: "var(--surface-raised)",
              color: canSave ? "var(--text-primary)" : "var(--text-tertiary)",
              fontSize: "0.8125rem",
              fontWeight: 500,
              cursor: !canSave || saving ? "default" : "pointer",
              opacity: !canSave || saving ? 0.5 : 1,
            }}
          >
            {saving ? "Saving..." : draftId ? "Update Draft" : "Save Draft"}
          </button>
        </div>
      </div>

      {/* Right column - config panels */}
      <div style={{ width: 320, flexShrink: 0, display: "flex", flexDirection: "column", gap: "16px" }}>
        <ResearchBriefPanel
          brief={brief}
          onBriefChange={setBrief}
          onGenerate={handleGenerateBrief}
          loading={loadingBrief}
        />

        <StyleConfigurator
          style={style}
          onChange={setStyle}
          presets={presets}
          onSavePreset={handleSavePreset}
        />

        <SentinelReviewPanel
          review={review}
          loading={reviewing}
          onReview={handleReview}
          disabled={!hasContent}
        />
      </div>
    </div>
  );
}
