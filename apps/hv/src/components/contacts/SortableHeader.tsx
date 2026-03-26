"use client";

import type { ContactSort } from "@/types/contacts";

interface SortableHeaderProps {
  label: string;
  field: ContactSort["field"];
  currentSort: ContactSort;
  onSort: (sort: ContactSort) => void;
  style?: React.CSSProperties;
}

export function SortableHeader({ label, field, currentSort, onSort, style }: SortableHeaderProps) {
  const isActive = currentSort.field === field;

  const handleClick = () => {
    if (isActive) {
      onSort({ field, direction: currentSort.direction === "asc" ? "desc" : "asc" });
    } else {
      onSort({ field, direction: field === "first_name" ? "asc" : "desc" });
    }
  };

  return (
    <th
      onClick={handleClick}
      style={{
        padding: "8px 12px",
        fontSize: "0.6875rem",
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        color: isActive ? "var(--text-primary)" : "var(--text-tertiary)",
        cursor: "pointer",
        userSelect: "none",
        textAlign: "left",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {label}
      {isActive && (
        <span style={{ marginLeft: "4px", fontSize: "0.625rem" }}>
          {currentSort.direction === "asc" ? "↑" : "↓"}
        </span>
      )}
    </th>
  );
}
