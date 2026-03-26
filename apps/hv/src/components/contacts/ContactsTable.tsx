"use client";

import { useState, useEffect, useCallback } from "react";
import { ScoreBadge } from "./ScoreBadge";
import { VerificationBadge } from "./VerificationBadge";
import { SortableHeader } from "./SortableHeader";
import { Pagination } from "./Pagination";
import { BulkActionBar } from "./BulkActionBar";
import { EmptyState } from "./EmptyState";
import { ContactFilters } from "./ContactFilters";
import { AddContactModal } from "./AddContactModal";
import { EnrichDomainModal } from "./EnrichDomainModal";
import type { HvContact, ContactFilters as FilterState, ContactSort } from "@/types/contacts";

export function ContactsTable() {
  const [contacts, setContacts] = useState<HvContact[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [perPage] = useState(25);
  const [sort, setSort] = useState<ContactSort>({ field: "lead_score", direction: "desc" });
  const [filters, setFilters] = useState<FilterState>({});
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEnrichModal, setShowEnrichModal] = useState(false);

  const fetchContacts = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("per_page", String(perPage));
    params.set("sort_by", sort.field);
    params.set("sort_dir", sort.direction);

    if (filters.q) params.set("q", filters.q);
    if (filters.source) params.set("source", filters.source);
    if (filters.seniority) params.set("seniority", filters.seniority);
    if (filters.verification_grade) params.set("verification_grade", filters.verification_grade);
    if (filters.tags?.length) params.set("tags", filters.tags.join(","));
    if (filters.suppressed) params.set("suppressed", "true");
    if (filters.score_min !== undefined) params.set("score_min", String(filters.score_min));
    if (filters.score_max !== undefined) params.set("score_max", String(filters.score_max));

    try {
      const res = await fetch(`/api/hv/contacts?${params}`);
      const data = await res.json();
      if (data.success) {
        setContacts(data.data);
        setTotal(data.meta?.total ?? 0);
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, [page, perPage, sort, filters]);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  const handleFiltersChange = (f: FilterState) => {
    setFilters(f);
    setPage(1);
    setSelectedIds(new Set());
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === contacts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(contacts.map((c) => c.id)));
    }
  };

  const thStyle: React.CSSProperties = {
    padding: "8px 12px",
    fontSize: "0.6875rem",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    color: "var(--text-tertiary)",
    textAlign: "left",
  };

  const isFiltersEmpty = !filters.q && !filters.source && !filters.seniority &&
    !filters.verification_grade && !filters.tags?.length && filters.suppressed === undefined &&
    filters.score_min === undefined && filters.score_max === undefined;

  if (!loading && contacts.length === 0 && isFiltersEmpty) {
    return (
      <>
        <EmptyState
          onAddContact={() => setShowAddModal(true)}
          onEnrichDomain={() => setShowEnrichModal(true)}
        />
        {showAddModal && (
          <AddContactModal onCreated={() => { setShowAddModal(false); fetchContacts(); }} onClose={() => setShowAddModal(false)} />
        )}
        {showEnrichModal && (
          <EnrichDomainModal onComplete={fetchContacts} onClose={() => setShowEnrichModal(false)} />
        )}
      </>
    );
  }

  return (
    <>
      {/* Action buttons */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <ContactFilters initialFilters={filters} onFiltersChange={handleFiltersChange} />
        <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
          <button
            onClick={() => setShowAddModal(true)}
            style={{
              padding: "7px 14px",
              borderRadius: "6px",
              border: "1px solid var(--border-default)",
              backgroundColor: "var(--surface-raised)",
              color: "var(--text-primary)",
              fontSize: "0.8125rem",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Add contact
          </button>
          <button
            onClick={() => setShowEnrichModal(true)}
            style={{
              padding: "7px 14px",
              borderRadius: "6px",
              border: "none",
              backgroundColor: "var(--accent-primary)",
              color: "#fff",
              fontSize: "0.8125rem",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Enrich domain
          </button>
        </div>
      </div>

      {/* Table */}
      <div
        style={{
          backgroundColor: "var(--surface-raised)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "8px",
          overflow: "hidden",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
              <th style={{ ...thStyle, width: 40 }}>
                <input
                  type="checkbox"
                  checked={contacts.length > 0 && selectedIds.size === contacts.length}
                  onChange={toggleSelectAll}
                  style={{ accentColor: "var(--accent-primary)" }}
                />
              </th>
              <SortableHeader label="Name" field="first_name" currentSort={sort} onSort={setSort} />
              <SortableHeader label="Email" field="email" currentSort={sort} onSort={setSort} />
              <th style={thStyle}>Company</th>
              <SortableHeader label="Title" field="title" currentSort={sort} onSort={setSort} />
              <SortableHeader label="Score" field="lead_score" currentSort={sort} onSort={setSort} style={{ textAlign: "center" }} />
              <th style={{ ...thStyle, textAlign: "center" }}>Verified</th>
              <th style={thStyle}>Source</th>
              <SortableHeader label="Added" field="created_at" currentSort={sort} onSort={setSort} />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} style={{ padding: "40px", textAlign: "center", color: "var(--text-tertiary)", fontSize: "0.8125rem" }}>
                  Loading...
                </td>
              </tr>
            ) : contacts.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ padding: "40px", textAlign: "center", color: "var(--text-tertiary)", fontSize: "0.8125rem" }}>
                  No contacts match your filters.
                </td>
              </tr>
            ) : (
              contacts.map((contact) => {
                const org = contact.organization;
                const name = [contact.first_name, contact.last_name].filter(Boolean).join(" ") || "Unknown";
                const created = new Date(contact.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" });

                return (
                  <tr
                    key={contact.id}
                    style={{
                      borderBottom: "1px solid var(--border-subtle)",
                      cursor: "pointer",
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "var(--surface-elevated, rgba(255,255,255,0.02))"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
                  >
                    <td style={{ padding: "10px 12px" }} onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(contact.id)}
                        onChange={() => toggleSelect(contact.id)}
                        style={{ accentColor: "var(--accent-primary)" }}
                      />
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <a
                        href={`/contacts/${contact.id}`}
                        style={{ color: "var(--text-primary)", textDecoration: "none", fontWeight: 500, fontSize: "0.8125rem" }}
                      >
                        {name}
                      </a>
                    </td>
                    <td style={{ padding: "10px 12px", fontFamily: "var(--font-mono, monospace), monospace", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                      {contact.email || "-"}
                    </td>
                    <td style={{ padding: "10px 12px", fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                      {org?.name || "-"}
                    </td>
                    <td style={{ padding: "10px 12px", fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                      {contact.title || "-"}
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "center" }}>
                      <ScoreBadge score={contact.lead_score} />
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "center" }}>
                      <VerificationBadge grade={contact.verification_grade} />
                    </td>
                    <td style={{ padding: "10px 12px", fontSize: "0.75rem", color: "var(--text-tertiary)" }}>
                      {contact.source}
                    </td>
                    <td style={{ padding: "10px 12px", fontSize: "0.75rem", color: "var(--text-tertiary)", fontFamily: "var(--font-mono, monospace), monospace" }}>
                      {created}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <Pagination page={page} perPage={perPage} total={total} onPageChange={setPage} />

      <BulkActionBar
        selectedCount={selectedIds.size}
        selectedIds={Array.from(selectedIds)}
        onComplete={() => { setSelectedIds(new Set()); fetchContacts(); }}
        onClear={() => setSelectedIds(new Set())}
      />

      {showAddModal && (
        <AddContactModal onCreated={() => { setShowAddModal(false); fetchContacts(); }} onClose={() => setShowAddModal(false)} />
      )}
      {showEnrichModal && (
        <EnrichDomainModal onComplete={fetchContacts} onClose={() => setShowEnrichModal(false)} />
      )}
    </>
  );
}
