"use client";

import { useState } from "react";
import { TagPill } from "./TagPill";

interface TagManagerProps {
  contactId: string;
  tags: string[];
  onTagsChange: (tags: string[]) => void;
}

export function TagManager({ contactId, tags, onTagsChange }: TagManagerProps) {
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [tagError, setTagError] = useState<string | null>(null);

  const addTag = async (tag: string) => {
    const trimmed = tag.trim().toLowerCase();
    if (!trimmed || tags.includes(trimmed)) return;

    setSaving(true);
    setTagError(null);
    try {
      const res = await fetch(`/api/hv/contacts/${contactId}/tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add", tags: [trimmed] }),
      });
      const data = await res.json();
      if (data.success) {
        onTagsChange(data.data.tags);
      } else {
        setTagError(data.error || "Failed to add tag");
      }
    } catch (err) {
      console.error("Failed to add tag:", err);
      setTagError("Network error adding tag");
    } finally {
      setSaving(false);
      setInput("");
    }
  };

  const removeTag = async (tag: string) => {
    setSaving(true);
    setTagError(null);
    try {
      const res = await fetch(`/api/hv/contacts/${contactId}/tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove", tags: [tag] }),
      });
      const data = await res.json();
      if (data.success) {
        onTagsChange(data.data.tags);
      } else {
        setTagError(data.error || "Failed to remove tag");
      }
    } catch (err) {
      console.error("Failed to remove tag:", err);
      setTagError("Network error removing tag");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginBottom: tags.length > 0 ? "8px" : "0" }}>
        {tags.map((tag) => (
          <TagPill key={tag} tag={tag} onRemove={removeTag} />
        ))}
      </div>
      <input
        type="text"
        placeholder="Add tag..."
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && input.trim()) {
            e.preventDefault();
            addTag(input);
          }
        }}
        disabled={saving}
        style={{
          width: "100%",
          padding: "6px 10px",
          borderRadius: "4px",
          border: "1px solid var(--border-subtle)",
          backgroundColor: "var(--surface-base)",
          color: "var(--text-primary)",
          fontSize: "0.75rem",
          outline: "none",
        }}
      />
      {tagError && (
        <p style={{ margin: "4px 0 0", fontSize: "0.6875rem", color: "var(--error, #d44040)" }}>
          {tagError}
        </p>
      )}
    </div>
  );
}
