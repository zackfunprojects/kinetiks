"use client";

import { useState, useEffect, useCallback } from "react";
import type { CallOutcome } from "@/types/calls";

interface LogCallModalProps {
  onClose: () => void;
  onCreated: () => void;
}

interface ContactOption {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
}

const OUTCOMES: { value: CallOutcome; label: string }[] = [
  { value: "connected", label: "Connected" },
  { value: "voicemail", label: "Voicemail" },
  { value: "no_answer", label: "No Answer" },
  { value: "busy", label: "Busy" },
  { value: "wrong_number", label: "Wrong Number" },
];

export default function LogCallModal({ onClose, onCreated }: LogCallModalProps) {
  const [contactQuery, setContactQuery] = useState("");
  const [contactResults, setContactResults] = useState<ContactOption[]>([]);
  const [selectedContact, setSelectedContact] = useState<ContactOption | null>(null);
  const [phoneFrom, setPhoneFrom] = useState("");
  const [phoneTo, setPhoneTo] = useState("");
  const [outcome, setOutcome] = useState<CallOutcome>("connected");
  const [durationMin, setDurationMin] = useState("");
  const [durationSec, setDurationSec] = useState("");
  const [transcript, setTranscript] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [searching, setSearching] = useState(false);

  const searchContacts = useCallback(async (q: string) => {
    if (q.length < 2) { setContactResults([]); return; }
    setSearching(true);
    try {
      const res = await fetch(`/api/hv/contacts?q=${encodeURIComponent(q)}&per_page=10`);
      if (!res.ok) throw new Error(`Failed to search contacts: ${res.status}`);
      const json = await res.json();
      setContactResults(json.data ?? []);
    } catch (err) {
      console.error("Error searching contacts:", err);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => { searchContacts(contactQuery); }, 300);
    return () => clearTimeout(timer);
  }, [contactQuery, searchContacts]);

  async function handleCreate() {
    if (!selectedContact) { setError("Select a contact"); return; }
    if (!phoneFrom.trim()) { setError("Phone from is required"); return; }
    if (!phoneTo.trim()) { setError("Phone to is required"); return; }

    const minutes = parseInt(durationMin || "0", 10);
    const seconds = parseInt(durationSec || "0", 10);
    const totalSeconds = (Number.isNaN(minutes) ? 0 : minutes) * 60 + (Number.isNaN(seconds) ? 0 : seconds);

    setSaving(true);
    setError("");

    try {
      const res = await fetch("/api/hv/calls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact_id: selectedContact.id,
          phone_from: phoneFrom.trim(),
          phone_to: phoneTo.trim(),
          call_type: "follow_up",
          status: "completed",
          outcome,
          duration_seconds: totalSeconds,
          transcript: transcript.trim() || null,
          notes: [],
        }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error ?? "Failed to log call");
        return;
      }

      onCreated();
    } catch (err) {
      console.error("Error logging call:", err);
      setError("Failed to log call");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.25)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: "var(--surface-elevated)", borderRadius: 12,
          padding: 24, width: 480, boxShadow: "var(--shadow-overlay)",
          maxHeight: "90vh", overflowY: "auto",
        }}
      >
        <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 16px" }}>
          Log Call
        </h2>

        {/* Contact search */}
        <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 6 }}>
          Contact
        </label>
        {selectedContact ? (
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "8px 12px", borderRadius: 6, border: "1px solid var(--border-subtle)",
            backgroundColor: "var(--surface-base)", marginBottom: 12,
          }}>
            <span style={{ fontSize: 14, color: "var(--text-primary)" }}>
              {selectedContact.first_name} {selectedContact.last_name} ({selectedContact.email})
            </span>
            <button
              onClick={() => { setSelectedContact(null); setContactQuery(""); }}
              style={{ border: "none", background: "none", color: "var(--text-tertiary)", cursor: "pointer", fontSize: 13 }}
            >
              Change
            </button>
          </div>
        ) : (
          <div style={{ position: "relative", marginBottom: 12 }}>
            <input
              type="text"
              value={contactQuery}
              onChange={(e) => setContactQuery(e.target.value)}
              placeholder="Search contacts by name or email..."
              autoFocus
              style={{
                width: "100%", padding: "8px 12px", borderRadius: 6, fontSize: 14,
                border: "1px solid var(--border-subtle)", backgroundColor: "var(--surface-base)",
                color: "var(--text-primary)", outline: "none", boxSizing: "border-box",
              }}
            />
            {(contactResults.length > 0 || searching) && (
              <div style={{
                position: "absolute", top: "100%", left: 0, right: 0, zIndex: 10,
                backgroundColor: "var(--surface-raised)", border: "1px solid var(--border-subtle)",
                borderRadius: 6, marginTop: 4, maxHeight: 160, overflowY: "auto",
              }}>
                {searching ? (
                  <div style={{ padding: "8px 12px", fontSize: 13, color: "var(--text-secondary)" }}>Searching...</div>
                ) : (
                  contactResults.map((c) => (
                    <div
                      key={c.id}
                      onClick={() => { setSelectedContact(c); setContactResults([]); }}
                      style={{
                        padding: "8px 12px", fontSize: 13, color: "var(--text-primary)", cursor: "pointer",
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "var(--surface-base)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
                    >
                      {c.first_name} {c.last_name} - {c.email}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {/* Phone fields */}
        <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 6 }}>
              Phone from
            </label>
            <input
              type="tel"
              value={phoneFrom}
              onChange={(e) => setPhoneFrom(e.target.value)}
              placeholder="+1 555-0100"
              style={{
                width: "100%", padding: "8px 12px", borderRadius: 6, fontSize: 14,
                border: "1px solid var(--border-subtle)", backgroundColor: "var(--surface-base)",
                color: "var(--text-primary)", outline: "none", boxSizing: "border-box",
              }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 6 }}>
              Phone to
            </label>
            <input
              type="tel"
              value={phoneTo}
              onChange={(e) => setPhoneTo(e.target.value)}
              placeholder="+1 555-0200"
              style={{
                width: "100%", padding: "8px 12px", borderRadius: 6, fontSize: 14,
                border: "1px solid var(--border-subtle)", backgroundColor: "var(--surface-base)",
                color: "var(--text-primary)", outline: "none", boxSizing: "border-box",
              }}
            />
          </div>
        </div>

        {/* Outcome */}
        <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 6 }}>
          Outcome
        </label>
        <select
          value={outcome}
          onChange={(e) => setOutcome(e.target.value as CallOutcome)}
          style={{
            width: "100%", padding: "8px 12px", borderRadius: 6, fontSize: 14,
            border: "1px solid var(--border-subtle)", backgroundColor: "var(--surface-base)",
            color: "var(--text-primary)", outline: "none", boxSizing: "border-box", marginBottom: 12,
          }}
        >
          {OUTCOMES.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        {/* Duration */}
        <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 6 }}>
          Duration
        </label>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <input
            type="number"
            min={0}
            value={durationMin}
            onChange={(e) => setDurationMin(e.target.value)}
            placeholder="0"
            style={{
              width: 60, padding: "8px 12px", borderRadius: 6, fontSize: 14,
              border: "1px solid var(--border-subtle)", backgroundColor: "var(--surface-base)",
              color: "var(--text-primary)", outline: "none", textAlign: "center",
            }}
          />
          <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>min</span>
          <input
            type="number"
            min={0}
            max={59}
            value={durationSec}
            onChange={(e) => setDurationSec(e.target.value)}
            placeholder="0"
            style={{
              width: 60, padding: "8px 12px", borderRadius: 6, fontSize: 14,
              border: "1px solid var(--border-subtle)", backgroundColor: "var(--surface-base)",
              color: "var(--text-primary)", outline: "none", textAlign: "center",
            }}
          />
          <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>sec</span>
        </div>

        {/* Transcript */}
        <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 6 }}>
          Transcript (optional)
        </label>
        <textarea
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          placeholder="Paste or type call transcript..."
          rows={4}
          style={{
            width: "100%", padding: "8px 12px", borderRadius: 6, fontSize: 14,
            border: "1px solid var(--border-subtle)", backgroundColor: "var(--surface-base)",
            color: "var(--text-primary)", outline: "none", resize: "vertical", boxSizing: "border-box",
          }}
        />

        {error && <p style={{ fontSize: 13, color: "var(--error, #d44040)", margin: "12px 0 0" }}>{error}</p>}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
          <button
            onClick={onClose}
            style={{
              padding: "8px 16px", borderRadius: 6, border: "1px solid var(--border-subtle)",
              backgroundColor: "transparent", color: "var(--text-secondary)", fontSize: 13, cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={saving}
            style={{
              padding: "8px 16px", borderRadius: 6, border: "none", cursor: "pointer",
              backgroundColor: "var(--harvest-green)", color: "#fff", fontSize: 13, fontWeight: 600,
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? "Saving..." : "Log Call"}
          </button>
        </div>
      </div>
    </div>
  );
}
