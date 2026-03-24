"use client";

interface FieldEditorProps {
  fieldName: string;
  value: unknown;
  onChange: (value: unknown) => void;
  type?: "string" | "number" | "textarea" | "select";
  options?: string[];
  label?: string;
}

export function FieldEditor({
  fieldName,
  value,
  onChange,
  type = "string",
  options,
  label,
}: FieldEditorProps) {
  const displayLabel = label || fieldName.replace(/_/g, " ");

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: 12,
    fontWeight: 500,
    color: "var(--text-secondary)",
    marginBottom: 4,
    textTransform: "capitalize",
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "8px 10px",
    border: "1px solid var(--border-default)",
    borderRadius: 6,
    fontSize: 13,
    color: "var(--text-primary)",
    background: "var(--bg-surface)",
    boxSizing: "border-box",
  };

  if (type === "select" && options) {
    return (
      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>{displayLabel}</label>
        <select
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          style={inputStyle}
        >
          <option value="">Select...</option>
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (type === "textarea") {
    return (
      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>{displayLabel}</label>
        <textarea
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          rows={4}
          style={{ ...inputStyle, resize: "vertical" }}
        />
      </div>
    );
  }

  if (type === "number") {
    return (
      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>{displayLabel}</label>
        <input
          type="number"
          value={value === null || value === undefined ? "" : Number(value)}
          onChange={(e) =>
            onChange(e.target.value === "" ? null : Number(e.target.value))
          }
          style={inputStyle}
        />
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 12 }}>
      <label style={labelStyle}>{displayLabel}</label>
      <input
        type="text"
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value || null)}
        style={inputStyle}
      />
    </div>
  );
}
