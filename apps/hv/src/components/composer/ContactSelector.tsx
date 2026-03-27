"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { HvContact } from "@/types/contacts";

interface ContactSelectorProps {
  selectedContact: HvContact | null;
  onSelect: (contact: HvContact) => void;
  onClear: () => void;
}

export function ContactSelector({ selectedContact, onSelect, onClear }: ContactSelectorProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<HvContact[]>([]);
  const [open, setOpen] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const containerRef = useRef<HTMLDivElement>(null);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return; }
    setSearchError(null);
    try {
      const res = await fetch(`/api/hv/contacts?q=${encodeURIComponent(q)}&per_page=8`);
      const data = await res.json();
      if (data.success) {
        setResults(data.data);
      } else {
        setSearchError(data.error || "Failed to search contacts");
      }
    } catch (err) {
      console.error("Contact search failed:", err);
      setSearchError("Network error searching contacts");
    }
  }, []);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (query.trim()) {
      debounceRef.current = setTimeout(() => search(query), 250);
    } else {
      setResults([]);
    }
    return () => clearTimeout(debounceRef.current);
  }, [query, search]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (selectedContact) {
    const name = [selectedContact.first_name, selectedContact.last_name].filter(Boolean).join(" ");
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "8px 12px",
          borderRadius: "8px",
          backgroundColor: "var(--surface-raised)",
          border: "1px solid var(--border-default)",
        }}
      >
        <div style={{ flex: 1 }}>
          <span style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--text-primary)" }}>{name}</span>
          {selectedContact.title && (
            <span style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", marginLeft: "8px" }}>
              {selectedContact.title}
            </span>
          )}
          {selectedContact.email && (
            <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontFamily: "var(--font-mono, monospace), monospace", marginTop: "2px" }}>
              {selectedContact.email}
            </div>
          )}
        </div>
        <button
          onClick={onClear}
          style={{
            background: "none",
            border: "none",
            color: "var(--text-tertiary)",
            cursor: "pointer",
            fontSize: "1rem",
            padding: "4px",
          }}
        >
          ×
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <input
        type="text"
        placeholder="Search for a contact..."
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => { if (results.length > 0) setOpen(true); }}
        style={{
          width: "100%",
          padding: "10px 12px",
          borderRadius: "8px",
          border: "1px solid var(--border-default)",
          backgroundColor: "var(--surface-raised)",
          color: "var(--text-primary)",
          fontSize: "0.875rem",
          outline: "none",
        }}
      />

      {searchError && (
        <p style={{ margin: "4px 0 0", fontSize: "0.75rem", color: "var(--error, #d44040)" }}>
          {searchError}
        </p>
      )}

      {open && results.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            marginTop: "4px",
            backgroundColor: "var(--surface-elevated)",
            border: "1px solid var(--border-default)",
            borderRadius: "8px",
            boxShadow: "var(--shadow-overlay)",
            zIndex: 50,
            maxHeight: 300,
            overflowY: "auto",
          }}
        >
          {results.map((c) => {
            const name = [c.first_name, c.last_name].filter(Boolean).join(" ");
            return (
              <button
                key={c.id}
                onClick={() => { onSelect(c); setQuery(""); setOpen(false); }}
                style={{
                  display: "block",
                  width: "100%",
                  padding: "10px 12px",
                  border: "none",
                  backgroundColor: "transparent",
                  textAlign: "left",
                  cursor: "pointer",
                  borderBottom: "1px solid var(--border-subtle)",
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "var(--surface-raised)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
              >
                <div style={{ fontSize: "0.8125rem", fontWeight: 500, color: "var(--text-primary)" }}>
                  {name || "Unknown"}
                </div>
                <div style={{ fontSize: "0.6875rem", color: "var(--text-tertiary)", marginTop: "1px" }}>
                  {[c.title, c.email].filter(Boolean).join(" - ")}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
