"use client";

/**
 * GA4 property picker — rendered after GA4 OAuth completes with
 * ?ga4_pick=1 in the URL.
 *
 * A GA4 OAuth connection grants access to a Google account; under that
 * account the user may have multiple Analytics properties (marketing
 * site, product app, separate brands). The ga4_query tool always
 * targets exactly one property. This modal fetches the user's accessible
 * properties via the Admin API and persists the selection to
 * kinetiks_connections.metadata.property_id.
 *
 * States:
 *   loading — fetching the property list
 *   empty   — Admin API returned zero properties (no access, or none exist)
 *   error   — fetch failed (offers re-authorize / retry)
 *   ready   — list rendered; user selects + confirms
 *   saving  — selection POST in flight
 */

import { useCallback, useEffect, useState } from "react";
import { Button } from "@kinetiks/ui";

interface Ga4Property {
  property_id: string;
  display_name: string;
  account_display_name: string;
  currency_code: string | null;
  time_zone: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onPicked: (propertyId: string) => void;
}

type FetchState =
  | { kind: "loading" }
  | { kind: "ready"; properties: Ga4Property[] }
  | { kind: "empty" }
  | { kind: "error"; code: string; message: string };

export function Ga4PropertyPicker({ open, onClose, onPicked }: Props) {
  const [fetchState, setFetchState] = useState<FetchState>({ kind: "loading" });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const loadProperties = useCallback(async () => {
    setFetchState({ kind: "loading" });
    setSaveError(null);
    try {
      const res = await fetch("/api/connections/ga4/properties");
      const json = await res.json();
      if (!res.ok) {
        setFetchState({
          kind: "error",
          code: typeof json.error === "string" ? json.error : "unknown",
          message:
            typeof json.message === "string"
              ? json.message
              : "Failed to load properties",
        });
        return;
      }
      const properties = (json.properties ?? []) as Ga4Property[];
      if (properties.length === 0) {
        setFetchState({ kind: "empty" });
      } else {
        setFetchState({ kind: "ready", properties });
        setSelectedId(properties[0].property_id);
      }
    } catch (err) {
      setFetchState({
        kind: "error",
        code: "network",
        message: err instanceof Error ? err.message : "Network error",
      });
    }
  }, []);

  useEffect(() => {
    if (open) void loadProperties();
  }, [open, loadProperties]);

  const handleConfirm = useCallback(async () => {
    if (!selectedId) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/connections/ga4/select-property", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ property_id: selectedId }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setSaveError(
          typeof json.message === "string" ? json.message : "Failed to save"
        );
        return;
      }
      onPicked(selectedId);
      onClose();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Network error");
    } finally {
      setSaving(false);
    }
  }, [selectedId, onPicked, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Pick a Google Analytics property"
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--kt-backdrop)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
      }}
    >
      <div
        style={{
          width: "min(560px, 90vw)",
          maxHeight: "80vh",
          background: "var(--kt-bg-1)",
          border: "1px solid var(--kt-border-1)",
          borderRadius: "var(--kt-radius-2)",
          boxShadow: "var(--kt-shadow-3)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <header
          style={{
            padding: "20px 24px 12px",
            borderBottom: "1px solid var(--kt-border-1)",
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: 17,
              fontWeight: 600,
              color: "var(--kt-fg-1)",
            }}
          >
            Pick a Google Analytics property
          </h2>
          <p
            style={{
              margin: "6px 0 0",
              fontSize: 13,
              color: "var(--kt-fg-3)",
            }}
          >
            Marcus will query this property when answering traffic questions.
            You can change it any time from the connections page.
          </p>
        </header>

        <div style={{ flex: 1, overflowY: "auto", padding: "12px 8px" }}>
          {fetchState.kind === "loading" && (
            <p
              style={{
                padding: 24,
                textAlign: "center",
                color: "var(--kt-fg-3)",
                fontSize: 13,
              }}
              aria-live="polite"
              aria-busy="true"
            >
              Loading your Analytics properties...
            </p>
          )}

          {fetchState.kind === "empty" && (
            <div style={{ padding: 24 }}>
              <p style={{ margin: 0, color: "var(--kt-fg-1)", fontSize: 14 }}>
                No Google Analytics properties were found for this account.
              </p>
              <p
                style={{
                  margin: "8px 0 0",
                  color: "var(--kt-fg-3)",
                  fontSize: 13,
                }}
              >
                You may need view access to a property to see it here. Set up a
                property in Google Analytics and then re-connect.
              </p>
            </div>
          )}

          {fetchState.kind === "error" && (
            <div style={{ padding: 24 }}>
              <p
                style={{
                  margin: 0,
                  color: "var(--kt-fg-1)",
                  fontSize: 14,
                  fontWeight: 600,
                }}
              >
                Couldn&rsquo;t load your properties
              </p>
              <p
                style={{
                  margin: "8px 0 0",
                  color: "var(--kt-fg-3)",
                  fontSize: 13,
                }}
              >
                {fetchState.code === "reauthorize_required"
                  ? "Your Google session expired. Reconnect GA4 from the connections page."
                  : fetchState.message}
              </p>
              <div style={{ marginTop: 12 }}>
                <Button onClick={() => void loadProperties()} variant="secondary">
                  Try again
                </Button>
              </div>
            </div>
          )}

          {fetchState.kind === "ready" && (
            <ul
              role="listbox"
              aria-label="GA4 properties"
              style={{
                listStyle: "none",
                margin: 0,
                padding: 0,
              }}
            >
              {fetchState.properties.map((p) => {
                const checked = selectedId === p.property_id;
                return (
                  <li key={p.property_id}>
                    <label
                      style={{
                        display: "flex",
                        gap: 12,
                        padding: "10px 16px",
                        cursor: "pointer",
                        alignItems: "flex-start",
                        background: checked
                          ? "var(--kt-bg-2)"
                          : "transparent",
                      }}
                    >
                      <input
                        type="radio"
                        name="ga4_property"
                        value={p.property_id}
                        checked={checked}
                        onChange={() => setSelectedId(p.property_id)}
                        style={{ marginTop: 3 }}
                      />
                      <span style={{ flex: 1 }}>
                        <span
                          style={{
                            display: "block",
                            fontSize: 14,
                            color: "var(--kt-fg-1)",
                            fontWeight: 500,
                          }}
                        >
                          {p.display_name}
                        </span>
                        <span
                          style={{
                            display: "block",
                            fontSize: 12,
                            color: "var(--kt-fg-3)",
                            marginTop: 2,
                          }}
                        >
                          {p.account_display_name} · property {p.property_id}
                          {p.time_zone ? ` · ${p.time_zone}` : ""}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {saveError && (
          <p
            style={{
              margin: 0,
              padding: "0 24px 8px",
              color: "var(--kt-fg-danger)",
              fontSize: 13,
            }}
          >
            {saveError}
          </p>
        )}

        <footer
          style={{
            padding: "12px 24px",
            borderTop: "1px solid var(--kt-border-1)",
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
          }}
        >
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={
              saving || fetchState.kind !== "ready" || selectedId === null
            }
          >
            {saving ? "Saving..." : "Use this property"}
          </Button>
        </footer>
      </div>
    </div>
  );
}
