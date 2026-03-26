"use client";

import { useState, useCallback } from "react";
import MailboxList from "./MailboxList";
import AddMailboxModal from "./AddMailboxModal";
import DomainList from "./DomainList";
import AddDomainModal from "./AddDomainModal";
import WebhookList from "./WebhookList";

type InfraTab = "mailboxes" | "domains" | "webhooks";

const TAB_LABELS: { key: InfraTab; label: string; addLabel: string }[] = [
  { key: "mailboxes", label: "Mailboxes", addLabel: "+ Add Mailbox" },
  { key: "domains", label: "Domains", addLabel: "+ Add Domain" },
  { key: "webhooks", label: "Webhooks", addLabel: "+ Add Webhook" },
];

export default function InfraView() {
  const [activeTab, setActiveTab] = useState<InfraTab>("mailboxes");
  const [showAddMailbox, setShowAddMailbox] = useState(false);
  const [showAddDomain, setShowAddDomain] = useState(false);
  const [showAddWebhook, setShowAddWebhook] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
    setShowAddMailbox(false);
    setShowAddDomain(false);
    setShowAddWebhook(false);
  }, []);

  function handleAddClick() {
    if (activeTab === "mailboxes") setShowAddMailbox(true);
    else if (activeTab === "domains") setShowAddDomain(true);
    else setShowAddWebhook(true);
  }

  const currentTabMeta = TAB_LABELS.find((t) => t.key === activeTab);

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>Infrastructure</h1>
          <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: "4px 0 0" }}>
            Manage mailboxes, domains, and webhooks
          </p>
        </div>
        <button
          onClick={handleAddClick}
          style={{
            padding: "8px 16px", borderRadius: 8, border: "none", cursor: "pointer",
            backgroundColor: "var(--accent-primary)", color: "#0f0f0d", fontSize: 13, fontWeight: 600,
          }}
        >
          {currentTabMeta?.addLabel}
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {TAB_LABELS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: "6px 12px", borderRadius: 6, border: "1px solid var(--border-subtle)",
              backgroundColor: activeTab === tab.key ? "var(--surface-raised)" : "transparent",
              color: activeTab === tab.key ? "var(--text-primary)" : "var(--text-secondary)",
              fontSize: 13, fontWeight: 500, cursor: "pointer",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div key={refreshKey}>
        {activeTab === "mailboxes" && <MailboxList onAddClick={() => setShowAddMailbox(true)} />}
        {activeTab === "domains" && <DomainList onAddClick={() => setShowAddDomain(true)} />}
        {activeTab === "webhooks" && <WebhookList onAddClick={() => setShowAddWebhook(true)} />}
      </div>

      {/* Modals */}
      {showAddMailbox && <AddMailboxModal onClose={() => setShowAddMailbox(false)} onCreated={refresh} />}
      {showAddDomain && <AddDomainModal onClose={() => setShowAddDomain(false)} onCreated={refresh} />}
      {showAddWebhook && <AddWebhookModal onClose={() => setShowAddWebhook(false)} onCreated={refresh} />}
    </div>
  );
}

/** Inline webhook modal - keeps all infra modals in the same component tree */
function AddWebhookModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleCreate() {
    if (!url.trim()) { setError("URL is required"); return; }
    const eventList = events.split(",").map((e) => e.trim()).filter(Boolean);
    if (eventList.length === 0) { setError("At least one event is required"); return; }

    setSaving(true);
    setError("");

    const res = await fetch("/api/hv/webhooks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: url.trim(), events: eventList }),
    });

    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error ?? "Failed to create webhook");
      setSaving(false);
      return;
    }

    onCreated();
  }

  return (
    <div
      style={{
        position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: "var(--surface-raised)", borderRadius: 12,
          padding: 24, width: 440, border: "1px solid var(--border-subtle)",
        }}
      >
        <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 16px" }}>
          Add Webhook
        </h2>

        <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 6 }}>
          Endpoint URL
        </label>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com/webhook"
          autoFocus
          style={{
            width: "100%", padding: "8px 12px", borderRadius: 6, fontSize: 14,
            border: "1px solid var(--border-subtle)", backgroundColor: "var(--surface-base)",
            color: "var(--text-primary)", outline: "none", boxSizing: "border-box", marginBottom: 12,
          }}
        />

        <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 6 }}>
          Events (comma-separated)
        </label>
        <input
          type="text"
          value={events}
          onChange={(e) => setEvents(e.target.value)}
          placeholder="e.g. email.sent, email.opened, email.replied"
          style={{
            width: "100%", padding: "8px 12px", borderRadius: 6, fontSize: 14,
            border: "1px solid var(--border-subtle)", backgroundColor: "var(--surface-base)",
            color: "var(--text-primary)", outline: "none", boxSizing: "border-box",
          }}
        />

        <p style={{ fontSize: 13, color: "var(--text-tertiary)", margin: "8px 0 0" }}>
          A signing secret will be generated automatically.
        </p>

        {error && <p style={{ fontSize: 13, color: "#FF7675", margin: "12px 0 0" }}>{error}</p>}

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
              backgroundColor: "var(--accent-primary)", color: "#0f0f0d", fontSize: 13, fontWeight: 600,
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? "Creating..." : "Add Webhook"}
          </button>
        </div>
      </div>
    </div>
  );
}
