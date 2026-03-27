"use client";

import { useState, useEffect, useCallback } from "react";

interface Contact {
  id: string;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  phone: string | null;
  mobile_phone: string | null;
  email: string | null;
}

interface InitiateCallModalProps {
  onClose: () => void;
  onCallStarted: () => void;
  preselectedContactId?: string;
}

export default function InitiateCallModal({ onClose, onCallStarted, preselectedContactId }: InitiateCallModalProps) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState("");
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [objective, setObjective] = useState("");
  const [callType, setCallType] = useState("discovery");
  const [initiating, setInitiating] = useState(false);
  const [error, setError] = useState("");

  const searchContacts = useCallback(async (q: string) => {
    if (q.length < 2) return;
    try {
      const res = await fetch(`/api/hv/contacts?q=${encodeURIComponent(q)}&per_page=10`);
      if (!res.ok) return;
      const json = await res.json();
      setContacts(json.data ?? []);
    } catch {
      // Search is best-effort
    }
  }, []);

  // Load preselected contact
  useEffect(() => {
    if (preselectedContactId) {
      fetch(`/api/hv/contacts/${preselectedContactId}`)
        .then((r) => r.json())
        .then((json) => {
          if (json.success && json.data) setSelectedContact(json.data);
        })
        .catch(() => {});
    }
  }, [preselectedContactId]);

  useEffect(() => {
    const timeout = setTimeout(() => { if (search) searchContacts(search); }, 300);
    return () => clearTimeout(timeout);
  }, [search, searchContacts]);

  async function handleInitiate() {
    if (!selectedContact) { setError("Select a contact"); return; }
    if (!objective.trim()) { setError("Describe the call objective"); return; }

    const phone = selectedContact.phone ?? selectedContact.mobile_phone;
    if (!phone) { setError("Contact has no phone number"); return; }

    setInitiating(true);
    setError("");

    try {
      const res = await fetch("/api/hv/calls/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact_id: selectedContact.id,
          objective: objective.trim(),
          call_type: callType,
        }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error ?? `Failed to initiate call (${res.status})`);
        return;
      }

      onCallStarted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to initiate call");
    } finally {
      setInitiating(false);
    }
  }

  const contactName = selectedContact
    ? `${selectedContact.first_name ?? ""} ${selectedContact.last_name ?? ""}`.trim()
    : "";
  const contactPhone = selectedContact?.phone ?? selectedContact?.mobile_phone ?? "";

  return (
    <div
      style={{
        position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.25)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="initiate-call-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: "var(--surface-elevated)", borderRadius: "var(--radius-lg)",
          padding: "var(--space-6)", width: 480, boxShadow: "var(--shadow-overlay)",
          maxHeight: "80vh", overflowY: "auto",
        }}
      >
        <h2 id="initiate-call-title" style={{
          fontSize: 18, fontWeight: 600, color: "var(--text-primary)", margin: "0 0 var(--space-4)",
        }}>
          Start AI Call
        </h2>
        <p style={{ fontSize: 13, color: "var(--text-tertiary)", margin: "0 0 var(--space-5)" }}>
          The AI agent will call your prospect, introduce your product, handle objections, and capture the conversation transcript.
        </p>

        {/* Contact selector */}
        <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 6 }}>
          Contact
        </label>
        {selectedContact ? (
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "var(--space-3)", borderRadius: "var(--radius-md)",
            border: "1px solid var(--harvest-green)", backgroundColor: "var(--harvest-green-subtle)",
            marginBottom: "var(--space-4)",
          }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)" }}>{contactName}</div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                {selectedContact.title ?? ""} - {contactPhone}
              </div>
            </div>
            <button
              onClick={() => { setSelectedContact(null); setSearch(""); }}
              style={{
                border: "none", background: "none", color: "var(--text-tertiary)",
                fontSize: 12, cursor: "pointer",
              }}
            >
              Change
            </button>
          </div>
        ) : (
          <div style={{ marginBottom: "var(--space-4)" }}>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search contacts by name..."
              autoFocus
              style={{
                width: "100%", padding: "8px 12px", borderRadius: "var(--radius-md)",
                border: "1px solid var(--border-default)", backgroundColor: "var(--surface-base)",
                color: "var(--text-primary)", fontSize: 13, outline: "none", boxSizing: "border-box",
              }}
            />
            {contacts.length > 0 && (
              <div style={{
                marginTop: 4, border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-md)", backgroundColor: "var(--surface-elevated)",
                maxHeight: 150, overflowY: "auto",
              }}>
                {contacts.map((c) => {
                  const name = `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim();
                  const hasPhone = Boolean(c.phone ?? c.mobile_phone);
                  return (
                    <button
                      key={c.id}
                      onClick={() => { setSelectedContact(c); setContacts([]); setSearch(""); }}
                      disabled={!hasPhone}
                      style={{
                        display: "block", width: "100%", padding: "8px 12px",
                        border: "none", backgroundColor: "transparent", cursor: hasPhone ? "pointer" : "not-allowed",
                        textAlign: "left", fontSize: 13, color: hasPhone ? "var(--text-primary)" : "var(--text-disabled)",
                        borderBottom: "1px solid var(--border-subtle)",
                      }}
                    >
                      <span style={{ fontWeight: 500 }}>{name || c.email}</span>
                      {c.title && <span style={{ color: "var(--text-tertiary)" }}> - {c.title}</span>}
                      {!hasPhone && <span style={{ color: "var(--error)", fontSize: 11, marginLeft: 8 }}>No phone</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Call type */}
        <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 6 }}>
          Call Type
        </label>
        <div style={{ display: "flex", gap: 8, marginBottom: "var(--space-4)" }}>
          {[
            { value: "discovery", label: "Discovery" },
            { value: "follow_up", label: "Follow-up" },
            { value: "demo", label: "Demo invite" },
            { value: "closing", label: "Closing" },
          ].map((type) => (
            <button
              key={type.value}
              onClick={() => setCallType(type.value)}
              style={{
                padding: "6px 14px", borderRadius: "var(--radius-md)", fontSize: 13,
                border: callType === type.value
                  ? "1px solid var(--harvest-green)"
                  : "1px solid var(--border-default)",
                backgroundColor: callType === type.value
                  ? "var(--harvest-green-subtle)"
                  : "transparent",
                color: callType === type.value
                  ? "var(--harvest-green)"
                  : "var(--text-secondary)",
                cursor: "pointer", fontWeight: 500,
              }}
            >
              {type.label}
            </button>
          ))}
        </div>

        {/* Objective */}
        <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 6 }}>
          Call Objective
        </label>
        <textarea
          value={objective}
          onChange={(e) => setObjective(e.target.value)}
          placeholder="e.g. Learn about their current marketing stack and identify pain points with content creation..."
          rows={3}
          style={{
            width: "100%", padding: "8px 12px", borderRadius: "var(--radius-md)",
            border: "1px solid var(--border-default)", backgroundColor: "var(--surface-base)",
            color: "var(--text-primary)", fontSize: 13, outline: "none",
            resize: "vertical", boxSizing: "border-box",
          }}
        />

        {error && (
          <p style={{ fontSize: 13, color: "var(--error)", margin: "var(--space-3) 0 0" }}>{error}</p>
        )}

        {/* Actions */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: "var(--space-5)" }}>
          <button
            onClick={onClose}
            style={{
              padding: "8px 16px", borderRadius: "var(--radius-md)",
              border: "1px solid var(--border-default)", backgroundColor: "transparent",
              color: "var(--text-secondary)", fontSize: 13, cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleInitiate}
            disabled={initiating || !selectedContact || !objective.trim()}
            style={{
              padding: "8px 20px", borderRadius: "var(--radius-md)",
              border: "none", cursor: initiating ? "not-allowed" : "pointer",
              backgroundColor: initiating ? "var(--surface-raised)" : "var(--harvest-green)",
              color: initiating ? "var(--text-tertiary)" : "#fff",
              fontSize: 13, fontWeight: 600,
            }}
          >
            {initiating ? "Initiating..." : "Start AI Call"}
          </button>
        </div>
      </div>
    </div>
  );
}
