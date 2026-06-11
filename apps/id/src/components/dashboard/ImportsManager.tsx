"use client";

import { useState } from "react";
import type { ImportRecord } from "@kinetiks/types";
import { Card, Badge, EmptyState } from "@kinetiks/ui";
import { ImportUploadModal } from "./ImportUploadModal";

interface ImportsManagerProps {
  initialImports: ImportRecord[];
}

const TYPE_LABELS: Record<string, string> = {
  content_library: "Content Library",
  contacts: "Contacts",
  brand_assets: "Brand Assets",
  media_list: "Media List",
};

const STATUS_VARIANTS: Record<string, "default" | "success" | "warning" | "error" | "accent"> = {
  pending: "default",
  processing: "accent",
  complete: "success",
  error: "error",
};

export function ImportsManager({ initialImports }: ImportsManagerProps) {
  const [imports, setImports] = useState(initialImports);
  const [showUpload, setShowUpload] = useState(false);

  async function refreshImports() {
    try {
      const res = await fetch("/api/imports");
      if (res.ok) {
        const data = await res.json();
        setImports(data.imports ?? []);
      }
    } catch {
      // Refresh failed silently
    }
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
        <button
          onClick={() => setShowUpload(true)}
          style={{
            padding: "8px 16px",
            background: "var(--kt-accent-hover)",
            color: "var(--kt-fg-on-inverse)",
            border: "none",
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          Upload New
        </button>
      </div>

      {imports.length === 0 ? (
        <EmptyState
          title="No imports yet"
          body="Upload content libraries, contacts, brand assets, or media lists to enrich your Kinetiks ID."
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {imports.map((imp) => (
            <Card key={imp.id}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Badge
                    label={TYPE_LABELS[imp.import_type] || imp.import_type}
                    variant="accent"
                  />
                  <Badge
                    label={imp.status}
                    variant={STATUS_VARIANTS[imp.status] || "default"}
                  />
                  {imp.target_app && (
                    <span style={{ fontSize: 12, color: "var(--kt-fg-3)" }}>
                      for {imp.target_app.replace("_", " ")}
                    </span>
                  )}
                </div>
                <span style={{ fontSize: 11, color: "var(--kt-fg-3)", fontFamily: "var(--font-mono), monospace" }}>
                  {new Date(imp.created_at).toLocaleDateString()}
                </span>
              </div>

              {imp.file_path && (
                <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--kt-fg-2)", fontFamily: "var(--font-mono), monospace" }}>
                  {imp.file_path.split("/").pop()}
                </p>
              )}

              {imp.stats && Object.keys(imp.stats).length > 0 && (
                <div style={{ display: "flex", gap: 16, marginTop: 8 }}>
                  {imp.stats.total !== undefined && (
                    <span style={{ fontSize: 12, color: "var(--kt-fg-2)" }}>
                      Total: <strong>{imp.stats.total}</strong>
                    </span>
                  )}
                  {imp.stats.imported !== undefined && (
                    <span style={{ fontSize: 12, color: "var(--kt-success)" }}>
                      Imported: <strong>{imp.stats.imported}</strong>
                    </span>
                  )}
                  {imp.stats.duplicates !== undefined && imp.stats.duplicates > 0 && (
                    <span style={{ fontSize: 12, color: "var(--kt-warning)" }}>
                      Duplicates: <strong>{imp.stats.duplicates}</strong>
                    </span>
                  )}
                  {imp.stats.errors !== undefined && imp.stats.errors > 0 && (
                    <span style={{ fontSize: 12, color: "var(--kt-danger)" }}>
                      Errors: <strong>{imp.stats.errors}</strong>
                    </span>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {showUpload && (
        <ImportUploadModal
          onClose={() => setShowUpload(false)}
          onUploadComplete={refreshImports}
        />
      )}
    </div>
  );
}
