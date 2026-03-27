"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { DealStage } from "@/types/pipeline";

interface CreateDealModalProps {
  initialContactId?: string;
  onCreated: () => void;
  onClose: () => void;
}

interface ContactOption {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  org_id: string | null;
  organization?: { id: string; name: string } | null;
}

export function CreateDealModal({ initialContactId, onCreated, onClose }: CreateDealModalProps) {
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [stage, setStage] = useState<DealStage>("prospecting");
  const [notes, setNotes] = useState("");
  const [contactId, setContactId] = useState(initialContactId ?? "");
  const [orgId, setOrgId] = useState("");
  const [contactQuery, setContactQuery] = useState("");
  const [contactResults, setContactResults] = useState<ContactOption[]>([]);
  const [selectedContactName, setSelectedContactName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [searchError, setSearchError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const searchContacts = useCallback(async (q: string) => {
    if (!q.trim()) { setContactResults([]); return; }
    setSearchError(null);
    try {
      const res = await fetch(`/api/hv/contacts?q=${encodeURIComponent(q)}&per_page=6`);
      const data = await res.json();
      if (data.success) {
        setContactResults(data.data);
      } else {
        setSearchError(data.error || "Failed to search contacts");
      }
    } catch (err) {
      console.error("Contact search failed:", err);
      setSearchError("Network error searching contacts");
    }
  }, []);

  // Hydrate contact name + org when initialContactId is provided
  useEffect(() => {
    if (!initialContactId) return;
    (async () => {
      try {
        const res = await fetch(`/api/hv/contacts/${initialContactId}`);
        const data = await res.json();
        if (data.success && data.data) {
          const c = data.data;
          const cName = [c.first_name, c.last_name].filter(Boolean).join(" ");
          setSelectedContactName(cName || c.email || "Unknown");
          if (c.org_id) setOrgId(c.org_id);
        }
      } catch { /* ignore - user can still search manually */ }
    })();
  }, [initialContactId]);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (contactQuery.trim()) {
      debounceRef.current = setTimeout(() => searchContacts(contactQuery), 250);
    } else {
      setContactResults([]);
    }
    return () => clearTimeout(debounceRef.current);
  }, [contactQuery, searchContacts]);

  const handleSubmit = async () => {
    if (!name.trim()) { setError("Deal name is required."); return; }
    setSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/hv/deals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          value: value ? parseInt(value, 10) : null,
          currency,
          stage,
          contact_id: contactId || null,
          org_id: orgId || null,
          notes: notes || null,
        }),
      });
      const data = await res.json();
      if (data.success) {
        onCreated();
      } else {
        setError(data.error || "Failed to create deal");
      }
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "8px 12px",
    borderRadius: "6px",
    border: "1px solid var(--border-default)",
    backgroundColor: "var(--surface-base)",
    color: "var(--text-primary)",
    fontSize: "0.8125rem",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: "0.75rem",
    fontWeight: 500,
    color: "var(--text-secondary)",
    marginBottom: "4px",
    display: "block",
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.25)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby="create-deal-title" style={{ backgroundColor: "var(--surface-elevated)", borderRadius: "12px", padding: "24px", width: "100%", maxWidth: 480, boxShadow: "var(--shadow-overlay)" }}>
        <h2 id="create-deal-title" style={{ fontSize: "1.125rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: "20px" }}>
          Create Deal
        </h2>

        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div>
            <label htmlFor="cd-name" style={labelStyle}>Deal name *</label>
            <input id="cd-name" style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Acme Corp - Enterprise Plan" />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label htmlFor="cd-value" style={labelStyle}>Value</label>
              <input id="cd-value" style={{ ...inputStyle, fontFamily: "var(--font-mono, monospace), monospace" }} type="number" value={value} onChange={(e) => setValue(e.target.value)} placeholder="0" />
            </div>
            <div>
              <label htmlFor="cd-stage" style={labelStyle}>Stage</label>
              <select id="cd-stage" style={inputStyle} value={stage} onChange={(e) => setStage(e.target.value as DealStage)}>
                <option value="prospecting">Prospecting</option>
                <option value="qualified">Qualified</option>
                <option value="proposal">Proposal</option>
                <option value="negotiation">Negotiation</option>
              </select>
            </div>
          </div>

          {/* Contact search */}
          <div style={{ position: "relative" }}>
            <label htmlFor="cd-contact" style={labelStyle}>Contact</label>
            {contactId && selectedContactName ? (
              <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 12px", borderRadius: "6px", backgroundColor: "var(--surface-raised)", border: "1px solid var(--border-default)" }}>
                <span style={{ flex: 1, fontSize: "0.8125rem", color: "var(--text-primary)" }}>{selectedContactName}</span>
                <button onClick={() => { setContactId(""); setSelectedContactName(""); setOrgId(""); }} style={{ background: "none", border: "none", color: "var(--text-tertiary)", cursor: "pointer" }}>×</button>
              </div>
            ) : (
              <>
                <input id="cd-contact" style={inputStyle} value={contactQuery} onChange={(e) => setContactQuery(e.target.value)} placeholder="Search contacts..." />
                {searchError && (
                  <p style={{ margin: "4px 0 0", fontSize: "0.6875rem", color: "var(--error, #d44040)" }}>{searchError}</p>
                )}
                {contactResults.length > 0 && (
                  <div style={{ position: "absolute", top: "100%", left: 0, right: 0, marginTop: "4px", backgroundColor: "var(--surface-elevated)", border: "1px solid var(--border-default)", borderRadius: "6px", boxShadow: "var(--shadow-overlay)", zIndex: 50, maxHeight: 200, overflowY: "auto" }}>
                    {contactResults.map((c) => {
                      const cName = [c.first_name, c.last_name].filter(Boolean).join(" ");
                      return (
                        <button
                          key={c.id}
                          onClick={() => {
                            setContactId(c.id);
                            setSelectedContactName(cName || c.email || "Unknown");
                            if (c.org_id) setOrgId(c.org_id);
                            setContactQuery("");
                            setContactResults([]);
                          }}
                          style={{ display: "block", width: "100%", padding: "8px 12px", border: "none", backgroundColor: "transparent", textAlign: "left", cursor: "pointer", borderBottom: "1px solid var(--border-subtle)", fontSize: "0.8125rem", color: "var(--text-primary)" }}
                        >
                          {cName || "Unknown"} <span style={{ color: "var(--text-tertiary)", fontSize: "0.6875rem" }}>{c.email}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>

          <div>
            <label htmlFor="cd-notes" style={labelStyle}>Notes</label>
            <textarea id="cd-notes" style={{ ...inputStyle, minHeight: 50, resize: "vertical" }} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        {error && <p style={{ color: "var(--error, #d44040)", fontSize: "0.8125rem", marginTop: "12px" }}>{error}</p>}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "20px" }}>
          <button onClick={onClose} style={{ padding: "8px 16px", borderRadius: "6px", border: "1px solid var(--border-default)", backgroundColor: "transparent", color: "var(--text-secondary)", fontSize: "0.8125rem", cursor: "pointer" }}>
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={submitting} style={{ padding: "8px 16px", borderRadius: "6px", border: "none", backgroundColor: "var(--harvest-green)", color: "#fff", fontSize: "0.8125rem", fontWeight: 500, cursor: submitting ? "wait" : "pointer", opacity: submitting ? 0.7 : 1 }}>
            {submitting ? "Creating..." : "Create deal"}
          </button>
        </div>
      </div>
    </div>
  );
}
