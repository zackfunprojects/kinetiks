"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function DashboardHome() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    async function checkOnboarding() {
      try {
        const res = await fetch("/api/hv/onboarding");
        if (res.ok) {
          const json = await res.json();
          if (json.data && !json.data.completed) {
            setShowBanner(true);
          } else {
            router.replace("/greenhouse");
            return;
          }
        } else {
          router.replace("/greenhouse");
          return;
        }
      } catch {
        router.replace("/greenhouse");
        return;
      } finally {
        setChecking(false);
      }
    }
    checkOnboarding();
  }, [router]);

  if (checking) {
    return (
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "60vh",
        color: "var(--text-tertiary)",
        fontSize: 14,
      }}>
        Loading...
      </div>
    );
  }

  if (showBanner) {
    return (
      <div>
        {/* Onboarding banner */}
        <div style={{
          padding: "var(--space-5) var(--space-6)",
          borderRadius: "var(--radius-lg, 12px)",
          border: "1px solid var(--harvest-green)",
          backgroundColor: "var(--harvest-green-subtle)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "var(--space-6)",
        }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>
              Finish setting up Harvest
            </div>
            <div style={{ fontSize: 13, color: "var(--text-tertiary)" }}>
              Complete the setup wizard to configure your sender profile, outreach goals, and generate your first templates.
            </div>
          </div>
          <a
            href="/onboarding"
            style={{
              padding: "10px 24px",
              borderRadius: "var(--radius-md)",
              border: "none",
              backgroundColor: "var(--harvest-green)",
              color: "#fff",
              fontSize: 14,
              fontWeight: 600,
              textDecoration: "none",
              whiteSpace: "nowrap",
              flexShrink: 0,
              marginLeft: "var(--space-4)",
            }}
          >
            Continue Setup
          </a>
        </div>

        {/* Still show greenhouse content below */}
        <div style={{
          fontSize: 22,
          fontWeight: 600,
          color: "var(--text-primary)",
          margin: 0,
          letterSpacing: "-0.02em",
          marginBottom: "var(--space-4)",
        }}>
          Contacts
        </div>
        <div style={{
          padding: "var(--space-8)",
          borderRadius: "var(--radius-lg, 12px)",
          border: "1px dashed var(--border-default)",
          backgroundColor: "var(--surface-elevated)",
          textAlign: "center",
        }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>🌱</div>
          <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 4 }}>
            Your greenhouse is empty
          </div>
          <div style={{ fontSize: 13, color: "var(--text-tertiary)" }}>
            Complete the setup wizard to get started with Harvest.
          </div>
        </div>
      </div>
    );
  }

  return null;
}
