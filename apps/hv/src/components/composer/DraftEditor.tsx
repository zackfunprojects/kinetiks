"use client";

interface DraftEditorProps {
  subject: string;
  body: string;
  onSubjectChange: (subject: string) => void;
  onBodyChange: (body: string) => void;
}

export function DraftEditor({ subject, body, onSubjectChange, onBodyChange }: DraftEditorProps) {
  const subjectLength = subject.length;
  const wordCount = body.replace(/<[^>]+>/g, "").split(/\s+/).filter(Boolean).length;

  return (
    <div
      style={{
        backgroundColor: "var(--surface-raised)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "8px",
        overflow: "hidden",
      }}
    >
      {/* Subject */}
      <div style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        <div style={{ display: "flex", alignItems: "center", padding: "0 16px" }}>
          <span style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", flexShrink: 0, marginRight: "8px" }}>
            Subject:
          </span>
          <input
            type="text"
            value={subject}
            onChange={(e) => onSubjectChange(e.target.value)}
            placeholder="Email subject line..."
            style={{
              flex: 1,
              padding: "12px 0",
              border: "none",
              backgroundColor: "transparent",
              color: "var(--text-primary)",
              fontSize: "0.875rem",
              fontWeight: 500,
              outline: "none",
            }}
          />
          <span
            style={{
              fontSize: "0.6875rem",
              fontFamily: "var(--font-mono, monospace), monospace",
              color: subjectLength > 60 ? "var(--error, #d44040)" : "var(--text-tertiary)",
              flexShrink: 0,
            }}
          >
            {subjectLength}/60
          </span>
        </div>
      </div>

      {/* Body */}
      <textarea
        value={body}
        onChange={(e) => onBodyChange(e.target.value)}
        placeholder="Write your email body here..."
        style={{
          width: "100%",
          minHeight: 250,
          padding: "16px",
          border: "none",
          backgroundColor: "transparent",
          color: "var(--text-primary)",
          fontSize: "0.875rem",
          lineHeight: 1.7,
          outline: "none",
          resize: "vertical",
        }}
      />

      {/* Footer */}
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          padding: "6px 16px",
          borderTop: "1px solid var(--border-subtle)",
        }}
      >
        <span
          style={{
            fontSize: "0.6875rem",
            fontFamily: "var(--font-mono, monospace), monospace",
            color: "var(--text-tertiary)",
          }}
        >
          {wordCount} words
        </span>
      </div>
    </div>
  );
}
