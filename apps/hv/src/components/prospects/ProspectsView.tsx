"use client";

import { useState, useEffect, useCallback } from "react";
import type { HvContact } from "@/types/contacts";
import ProspectCard from "./ProspectCard";

export default function ProspectsView() {
  const [contacts, setContacts] = useState<HvContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const perPage = 25;

  const fetchProspects = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        suppressed: "false",
        sort_by: "lead_score",
        sort_dir: "desc",
        page: String(page),
        per_page: String(perPage),
      });
      if (search) params.set("q", search);

      const res = await fetch(`/api/hv/contacts?${params}`);
      if (!res.ok) throw new Error(`Failed to fetch prospects: ${res.status}`);
      const json = await res.json();
      setContacts(json.data ?? []);
      setTotal(json.meta?.total ?? 0);
    } catch (err) {
      console.error("Error fetching prospects:", err);
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    fetchProspects();
  }, [fetchProspects]);

  const totalPages = Math.ceil(total / perPage);

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>Prospects</h1>
          <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: "4px 0 0" }}>
            Active contacts sorted by lead score
          </p>
        </div>
      </div>

      {/* Search */}
      <div style={{ marginBottom: 16 }}>
        <input
          type="text"
          placeholder="Search by name or email..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          style={{
            width: "100%",
            maxWidth: 360,
            padding: "8px 12px",
            height: 36,
            borderRadius: "var(--radius-md, 8px)",
            border: "1px solid var(--border-default)",
            backgroundColor: "var(--surface-elevated, #FFFFFF)",
            color: "var(--text-primary)",
            fontSize: 13,
            outline: "none",
            transition: "border-color var(--duration-fast, 150ms) var(--ease-smooth)",
          }}
        />
      </div>

      {/* Cards */}
      {loading ? (
        <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>Loading...</p>
      ) : contacts.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: 60,
            color: "var(--text-secondary)",
            border: "1px dashed var(--border-default)",
            borderRadius: "var(--radius-lg, 12px)",
            backgroundColor: "var(--surface-elevated, #FFFFFF)",
          }}
        >
          <p style={{ fontSize: 15, margin: "0 0 8px" }}>No prospects found</p>
          <p style={{ fontSize: 13, margin: 0 }}>
            {search ? "Try a different search term." : "Enrich contacts to see prospects here."}
          </p>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {contacts.map((c) => (
              <ProspectCard key={c.id} contact={c} />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 24 }}>
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                style={{
                  padding: "6px 12px",
                  borderRadius: "var(--radius-md, 8px)",
                  border: "1px solid var(--border-default)",
                  backgroundColor: "var(--surface-elevated, #FFFFFF)",
                  color: page <= 1 ? "var(--text-tertiary)" : "var(--text-secondary)",
                  fontSize: 13,
                  cursor: page <= 1 ? "default" : "pointer",
                  transition: "background-color var(--duration-fast, 150ms) var(--ease-smooth)",
                }}
              >
                Previous
              </button>
              <span style={{ padding: "6px 12px", fontSize: 13, color: "var(--text-secondary)" }}>
                Page {page} of {totalPages}
              </span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                style={{
                  padding: "6px 12px",
                  borderRadius: "var(--radius-md, 8px)",
                  border: "1px solid var(--border-default)",
                  backgroundColor: "var(--surface-elevated, #FFFFFF)",
                  color: page >= totalPages ? "var(--text-tertiary)" : "var(--text-secondary)",
                  fontSize: 13,
                  cursor: page >= totalPages ? "default" : "pointer",
                  transition: "background-color var(--duration-fast, 150ms) var(--ease-smooth)",
                }}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
