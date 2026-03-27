"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface FieldSummary {
  activeCampaigns: number;
  activeSequences: number;
  pendingDrafts: number;
  unreadInbox: number;
  scheduledCalls: number;
}

export default function FieldPage() {
  const [summary, setSummary] = useState<FieldSummary>({
    activeCampaigns: 0, activeSequences: 0, pendingDrafts: 0,
    unreadInbox: 0, scheduledCalls: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadSummary() {
      try {
        const [campaigns, sequences, drafts, inbox] = await Promise.all([
          fetch("/api/hv/campaigns?status=active&per_page=1").then((r) => r.json()),
          fetch("/api/hv/sequences?status=active&per_page=1").then((r) => r.json()),
          fetch("/api/hv/emails?status=draft&per_page=1").then((r) => r.json()),
          fetch("/api/hv/inbox?per_page=1").then((r) => r.json()),
        ]);
        setSummary({
          activeCampaigns: campaigns.meta?.total ?? 0,
          activeSequences: sequences.meta?.total ?? 0,
          pendingDrafts: drafts.meta?.total ?? 0,
          unreadInbox: inbox.meta?.total ?? 0,
          scheduledCalls: 0,
        });
      } catch {
        console.error("[Field] Failed to load summary");
      } finally {
        setLoading(false);
      }
    }
    loadSummary();
  }, []);

  const cards = [
    { label: "Pending Drafts", value: summary.pendingDrafts, href: "/field/compose", emoji: "✏️" },
    { label: "Active Rows", value: summary.activeSequences, href: "/field/sequences", emoji: "🌾" },
    { label: "Active Plots", value: summary.activeCampaigns, href: "/field/campaigns", emoji: "🗺️" },
    { label: "Inbox", value: summary.unreadInbox, href: "/field/inbox", emoji: "📬" },
  ];

  return (
    <div>
      <div style={{ marginBottom: "var(--space-6)" }}>
        <h1 style={{
          fontSize: 22, fontWeight: 600, color: "var(--text-primary)",
          margin: 0, letterSpacing: "-0.02em",
        }}>
          Field
        </h1>
        <p style={{ fontSize: 14, color: "var(--text-tertiary)", margin: "4px 0 0" }}>
          Compose outreach, manage sequences, and track conversations.
        </p>
      </div>

      {loading ? (
        <p style={{ color: "var(--text-tertiary)", fontSize: 14 }}>Loading...</p>
      ) : (
        <>
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(4, 1fr)",
            gap: "var(--space-4)", marginBottom: "var(--space-8)",
          }}>
            {cards.map((card) => (
              <Link
                key={card.href}
                href={card.href}
                style={{
                  backgroundColor: "var(--surface-elevated)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-md)",
                  padding: "var(--space-5)",
                  textDecoration: "none",
                  transition: "all var(--duration-fast) var(--ease-smooth)",
                }}
              >
                <div style={{ fontSize: 20, marginBottom: "var(--space-2)" }}>{card.emoji}</div>
                <div style={{
                  fontSize: 28, fontWeight: 600, color: "var(--text-primary)",
                  fontFamily: "var(--font-mono)", letterSpacing: "-0.02em",
                }}>
                  {card.value}
                </div>
                <div style={{
                  fontSize: 12, fontWeight: 500, color: "var(--text-tertiary)",
                  textTransform: "uppercase", letterSpacing: "0.04em", marginTop: "var(--space-1)",
                }}>
                  {card.label}
                </div>
              </Link>
            ))}
          </div>

          {/* Quick actions */}
          <div style={{ display: "flex", gap: "var(--space-3)" }}>
            <Link
              href="/field/compose"
              style={{
                padding: "8px 16px", borderRadius: "var(--radius-md)",
                backgroundColor: "var(--harvest-green)", color: "#fff",
                textDecoration: "none", fontSize: 13, fontWeight: 500,
              }}
            >
              New outreach
            </Link>
            <Link
              href="/field/sequences"
              style={{
                padding: "8px 16px", borderRadius: "var(--radius-md)",
                border: "1px solid var(--border-default)", color: "var(--text-secondary)",
                textDecoration: "none", fontSize: 13, fontWeight: 500,
                backgroundColor: "transparent",
              }}
            >
              Create a row
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
