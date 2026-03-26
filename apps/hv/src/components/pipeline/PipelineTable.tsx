"use client";

import { useState, useEffect, useCallback } from "react";
import { Pagination } from "@/components/contacts/Pagination";
import type { HvDeal, DealSort, DealStage } from "@/types/pipeline";
import { getStageConfig, formatCurrency, getDealAge } from "@/types/pipeline";

interface PipelineTableProps {
  onDealClick: (dealId: string) => void;
  refreshKey?: number;
}

export function PipelineTable({ onDealClick, refreshKey }: PipelineTableProps) {
  const [deals, setDeals] = useState<HvDeal[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [perPage] = useState(25);
  const [sort, setSort] = useState<DealSort>({ field: "created_at", direction: "desc" });
  const [stageFilter, setStageFilter] = useState<DealStage | "">("");
  const [loading, setLoading] = useState(true);

  const fetchDeals = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      view: "table",
      page: String(page),
      per_page: String(perPage),
      sort_by: sort.field,
      sort_dir: sort.direction,
    });
    if (stageFilter) params.set("stage", stageFilter);

    try {
      const res = await fetch(`/api/hv/deals?${params}`);
      const data = await res.json();
      if (data.success) {
        setDeals(data.data);
        setTotal(data.meta?.total ?? 0);
      }
    } catch {
      console.error("Failed to fetch deals");
    } finally {
      setLoading(false);
    }
  }, [page, perPage, sort, stageFilter, refreshKey]);

  useEffect(() => {
    fetchDeals();
  }, [fetchDeals]);

  const toggleSort = (field: DealSort["field"]) => {
    setSort((prev) => ({
      field,
      direction: prev.field === field && prev.direction === "desc" ? "asc" : "desc",
    }));
    setPage(1);
  };

  const thStyle: React.CSSProperties = {
    padding: "8px 12px",
    fontSize: "0.6875rem",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    color: "var(--text-tertiary)",
    textAlign: "left",
    cursor: "pointer",
    userSelect: "none",
    whiteSpace: "nowrap",
  };

  const selectStyle: React.CSSProperties = {
    padding: "5px 8px",
    borderRadius: "6px",
    border: "1px solid var(--border-default)",
    backgroundColor: "var(--surface-raised)",
    color: "var(--text-primary)",
    fontSize: "0.75rem",
    marginBottom: "12px",
  };

  return (
    <>
      <div>
        <select
          value={stageFilter}
          onChange={(e) => { setStageFilter(e.target.value as DealStage | ""); setPage(1); }}
          style={selectStyle}
          aria-label="Filter by stage"
        >
          <option value="">All stages</option>
          <option value="prospecting">Prospecting</option>
          <option value="qualified">Qualified</option>
          <option value="proposal">Proposal</option>
          <option value="negotiation">Negotiation</option>
          <option value="closed_won">Closed Won</option>
          <option value="closed_lost">Closed Lost</option>
        </select>
      </div>

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
              <th style={thStyle} onClick={() => toggleSort("name")}>
                Name {sort.field === "name" && (sort.direction === "asc" ? "↑" : "↓")}
              </th>
              <th style={{ ...thStyle, cursor: "default" }}>Contact</th>
              <th style={{ ...thStyle, cursor: "default" }}>Organization</th>
              <th style={{ ...thStyle, cursor: "default" }}>Stage</th>
              <th style={thStyle} onClick={() => toggleSort("value")}>
                Value {sort.field === "value" && (sort.direction === "asc" ? "↑" : "↓")}
              </th>
              <th style={{ ...thStyle, cursor: "default" }}>Age</th>
              <th style={thStyle} onClick={() => toggleSort("updated_at")}>
                Updated {sort.field === "updated_at" && (sort.direction === "asc" ? "↑" : "↓")}
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} style={{ padding: "40px", textAlign: "center", color: "var(--text-tertiary)", fontSize: "0.8125rem" }}>
                  Loading...
                </td>
              </tr>
            ) : deals.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: "40px", textAlign: "center", color: "var(--text-tertiary)", fontSize: "0.8125rem" }}>
                  No deals found.
                </td>
              </tr>
            ) : (
              deals.map((deal) => {
                const stageConfig = getStageConfig(deal.stage);
                const contactName = deal.contact
                  ? [deal.contact.first_name, deal.contact.last_name].filter(Boolean).join(" ")
                  : "-";
                const age = getDealAge(deal.created_at);
                const updated = new Date(deal.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric" });

                return (
                  <tr
                    key={deal.id}
                    tabIndex={0}
                    role="button"
                    aria-label={`Deal: ${deal.name}`}
                    onClick={() => onDealClick(deal.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onDealClick(deal.id);
                      }
                    }}
                    style={{ borderBottom: "1px solid var(--border-subtle)", cursor: "pointer" }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "var(--surface-elevated, rgba(255,255,255,0.02))"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
                  >
                    <td style={{ padding: "10px 12px", fontSize: "0.8125rem", fontWeight: 500, color: "var(--text-primary)" }}>
                      {deal.name}
                    </td>
                    <td style={{ padding: "10px 12px", fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                      {contactName}
                    </td>
                    <td style={{ padding: "10px 12px", fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                      {deal.organization?.name ?? "-"}
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                          fontSize: "0.6875rem",
                          fontWeight: 500,
                          color: stageConfig.color,
                        }}
                      >
                        <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: stageConfig.color }} />
                        {stageConfig.label}
                      </span>
                    </td>
                    <td style={{ padding: "10px 12px", fontSize: "0.8125rem", fontFamily: "var(--font-mono, monospace), monospace", color: "var(--text-primary)" }}>
                      {deal.value != null ? formatCurrency(deal.value, deal.currency) : "-"}
                    </td>
                    <td style={{ padding: "10px 12px", fontSize: "0.75rem", fontFamily: "var(--font-mono, monospace), monospace", color: "var(--text-tertiary)" }}>
                      {age}d
                    </td>
                    <td style={{ padding: "10px 12px", fontSize: "0.75rem", fontFamily: "var(--font-mono, monospace), monospace", color: "var(--text-tertiary)" }}>
                      {updated}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <Pagination page={page} perPage={perPage} total={total} onPageChange={setPage} />
    </>
  );
}
