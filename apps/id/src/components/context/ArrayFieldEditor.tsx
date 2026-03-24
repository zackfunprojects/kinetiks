"use client";

import { useState } from "react";
import { FieldEditor } from "./FieldEditor";

interface ArrayFieldEditorProps {
  fieldName: string;
  items: Record<string, unknown>[];
  itemFields: Array<{
    name: string;
    type?: "string" | "number" | "textarea" | "select";
    options?: string[];
  }>;
  onChange: (items: Record<string, unknown>[]) => void;
  label?: string;
}

export function ArrayFieldEditor({
  fieldName,
  items,
  itemFields,
  onChange,
  label,
}: ArrayFieldEditorProps) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const displayLabel = label || fieldName.replace(/_/g, " ");

  function handleItemChange(
    index: number,
    field: string,
    value: unknown
  ) {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    onChange(updated);
  }

  function addItem() {
    const emptyItem: Record<string, unknown> = {};
    for (const field of itemFields) {
      emptyItem[field.name] = field.type === "number" ? null : "";
    }
    onChange([...items, emptyItem]);
    setExpandedIndex(items.length);
  }

  function removeItem(index: number) {
    onChange(items.filter((_, i) => i !== index));
    if (expandedIndex === index) setExpandedIndex(null);
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <label
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: "var(--text-secondary)",
            textTransform: "capitalize",
          }}
        >
          {displayLabel} ({items.length})
        </label>
        <button
          onClick={addItem}
          style={{
            padding: "4px 10px",
            background: "var(--accent-muted)",
            color: "var(--accent)",
            border: "none",
            borderRadius: 4,
            fontSize: 12,
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          + Add
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {items.map((item, index) => {
          const isExpanded = expandedIndex === index;
          const title =
            String(item.name || item.topic || item.angle || item.context || `Item ${index + 1}`);

          return (
            <div
              key={index}
              style={{
                border: "1px solid var(--border-default)",
                borderRadius: 8,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0 12px 0 0",
                  background: "var(--bg-base)",
                }}
              >
                <button
                  type="button"
                  onClick={() => setExpandedIndex(isExpanded ? null : index)}
                  aria-expanded={isExpanded}
                  aria-controls={`array-item-${fieldName}-${index}`}
                  style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "8px 12px",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: 500,
                    color: "var(--text-secondary)",
                    textAlign: "left",
                    fontFamily: "inherit",
                  }}
                >
                  <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                    {isExpanded ? "\u25B2" : "\u25BC"}
                  </span>
                  {title}
                </button>
                <button
                  type="button"
                  onClick={() => removeItem(index)}
                  style={{
                    padding: "2px 6px",
                    background: "none",
                    border: "1px solid #FCA5A5",
                    borderRadius: 4,
                    color: "var(--error)",
                    fontSize: 11,
                    cursor: "pointer",
                  }}
                >
                  Remove
                </button>
              </div>
              {isExpanded && (
                <div id={`array-item-${fieldName}-${index}`} style={{ padding: 12 }}>
                  {itemFields.map((field) => (
                    <FieldEditor
                      key={field.name}
                      fieldName={field.name}
                      value={item[field.name]}
                      onChange={(v) => handleItemChange(index, field.name, v)}
                      type={field.type}
                      options={field.options}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
