"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { ContactFilters as FilterState } from "@/types/contacts";

interface ContactFiltersProps {
  initialFilters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
}

interface FilterOptions {
  sources: string[];
  tags: string[];
  seniorities: string[];
  verification_grades: string[];
}

export function ContactFilters({ initialFilters, onFiltersChange }: ContactFiltersProps) {
  const [filters, setFilters] = useState<FilterState>(initialFilters);
  const [options, setOptions] = useState<FilterOptions>({
    sources: [],
    tags: [],
    seniorities: [],
    verification_grades: [],
  });
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Load filter options on mount
  useEffect(() => {
    fetch("/api/hv/contacts/filters")
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setOptions(res.data);
      })
      .catch(() => {});
  }, []);

  const emitChange = useCallback(
    (updated: FilterState) => {
      setFilters(updated);
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => onFiltersChange(updated), 300);
    },
    [onFiltersChange]
  );

  const selectStyle: React.CSSProperties = {
    padding: "8px 10px",
    height: 36,
    borderRadius: "var(--radius-md, 8px)",
    border: "1px solid var(--border-default)",
    backgroundColor: "var(--surface-elevated, #FFFFFF)",
    color: "var(--text-primary)",
    fontSize: "0.8125rem",
    outline: "none",
    minWidth: 100,
    transition: "border-color var(--duration-fast, 150ms) var(--ease-smooth)",
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        flexWrap: "wrap",
        padding: "12px 0",
      }}
    >
      {/* Search */}
      <div style={{ position: "relative", flex: "1 1 200px", maxWidth: 320 }}>
        <input
          type="text"
          placeholder="Search name, email..."
          value={filters.q ?? ""}
          onChange={(e) => emitChange({ ...filters, q: e.target.value || undefined })}
          style={{
            width: "100%",
            padding: "8px 12px 8px 32px",
            height: 36,
            borderRadius: "var(--radius-md, 8px)",
            border: "1px solid var(--border-default)",
            backgroundColor: "var(--surface-elevated, #FFFFFF)",
            color: "var(--text-primary)",
            fontSize: "0.8125rem",
            outline: "none",
            transition: "border-color var(--duration-fast, 150ms) var(--ease-smooth)",
          }}
        />
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--text-tertiary)"
          strokeWidth="2"
          style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }}
        >
          <circle cx="11" cy="11" r="8" />
          <path d="M21 21l-4.35-4.35" />
        </svg>
      </div>

      {/* Source dropdown */}
      <select
        value={filters.source ?? ""}
        onChange={(e) => emitChange({ ...filters, source: e.target.value || undefined })}
        style={selectStyle}
      >
        <option value="">All sources</option>
        {options.sources.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>

      {/* Seniority dropdown */}
      <select
        value={filters.seniority ?? ""}
        onChange={(e) => emitChange({ ...filters, seniority: e.target.value || undefined })}
        style={selectStyle}
      >
        <option value="">All seniority</option>
        {options.seniorities.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>

      {/* Verification dropdown */}
      <select
        value={filters.verification_grade ?? ""}
        onChange={(e) => emitChange({ ...filters, verification_grade: e.target.value || undefined })}
        style={selectStyle}
      >
        <option value="">All grades</option>
        {options.verification_grades.map((g) => (
          <option key={g} value={g}>{g}</option>
        ))}
      </select>

      {/* Suppressed toggle */}
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: "4px",
          fontSize: "0.8125rem",
          color: "var(--text-secondary)",
          cursor: "pointer",
        }}
      >
        <input
          type="checkbox"
          checked={filters.suppressed === true}
          onChange={(e) =>
            emitChange({ ...filters, suppressed: e.target.checked ? true : undefined })
          }
          style={{ accentColor: "var(--harvest-green, #3D7C47)" }}
        />
        Suppressed
      </label>

      {/* Clear */}
      {Object.values(filters).some((v) => v !== undefined) && (
        <button
          onClick={() => emitChange({})}
          style={{
            padding: "6px 12px",
            height: 36,
            borderRadius: "var(--radius-md, 8px)",
            border: "1px solid var(--border-default)",
            backgroundColor: "var(--surface-elevated, #FFFFFF)",
            color: "var(--text-secondary)",
            fontSize: "0.75rem",
            cursor: "pointer",
            transition: "background-color var(--duration-fast, 150ms) var(--ease-smooth)",
          }}
        >
          Clear
        </button>
      )}
    </div>
  );
}
