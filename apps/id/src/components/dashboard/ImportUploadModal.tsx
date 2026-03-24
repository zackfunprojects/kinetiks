"use client";

import { useState, useRef } from "react";
import type { ImportType } from "@kinetiks/types";

interface ImportUploadModalProps {
  onClose: () => void;
  onUploadComplete: () => void;
}

const IMPORT_TYPES: Array<{ value: ImportType; label: string }> = [
  { value: "content_library", label: "Content Library" },
  { value: "contacts", label: "Contacts" },
  { value: "brand_assets", label: "Brand Assets" },
  { value: "media_list", label: "Media List" },
];

const TARGET_APPS = [
  { value: "dark_madder", label: "Dark Madder" },
  { value: "harvest", label: "Harvest" },
  { value: "hypothesis", label: "Hypothesis" },
  { value: "litmus", label: "Litmus" },
];

const ACCEPTED_FORMATS = ".csv,.json,.pdf,.docx";

export function ImportUploadModal({
  onClose,
  onUploadComplete,
}: ImportUploadModalProps) {
  const [importType, setImportType] = useState<ImportType | "">("");
  const [targetApp, setTargetApp] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) setFile(dropped);
  }

  async function handleUpload() {
    if (!importType || !file) return;
    setUploading(true);
    setError(null);

    try {
      // Create a FormData to upload via the imports API
      const formData = new FormData();
      formData.append("file", file);
      formData.append("import_type", importType);
      if (targetApp) formData.append("target_app", targetApp);

      const res = await fetch("/api/imports", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Upload failed");
      }

      onUploadComplete();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  const selectStyle: React.CSSProperties = {
    width: "100%",
    padding: "8px 10px",
    border: "1px solid #E5E7EB",
    borderRadius: 6,
    fontSize: 13,
    color: "#1a1a2e",
    background: "#fff",
    boxSizing: "border-box",
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 12,
          padding: 24,
          width: 440,
          maxWidth: "90vw",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ margin: "0 0 16px", fontSize: 18, fontWeight: 600, color: "#1a1a2e" }}>
          Upload Import
        </h3>

        {/* Import type */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#6B7280", marginBottom: 4 }}>
            Import Type
          </label>
          <select
            value={importType}
            onChange={(e) => setImportType(e.target.value as ImportType)}
            style={selectStyle}
          >
            <option value="">Select type...</option>
            {IMPORT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        {/* Target app (optional) */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#6B7280", marginBottom: 4 }}>
            Target App (optional)
          </label>
          <select
            value={targetApp}
            onChange={(e) => setTargetApp(e.target.value)}
            style={selectStyle}
          >
            <option value="">None - general import</option>
            {TARGET_APPS.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
        </div>

        {/* File upload zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          style={{
            border: `2px dashed ${dragOver ? "#6C5CE7" : "#E5E7EB"}`,
            borderRadius: 8,
            padding: "24px 16px",
            textAlign: "center",
            cursor: "pointer",
            background: dragOver ? "#F0EDFF" : "#FAFAFA",
            transition: "border-color 0.15s, background 0.15s",
            marginBottom: 16,
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_FORMATS}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            style={{ display: "none" }}
          />
          {file ? (
            <div>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: "#1a1a2e" }}>
                {file.name}
              </p>
              <p style={{ margin: "4px 0 0", fontSize: 12, color: "#999" }}>
                {(file.size / 1024).toFixed(1)} KB
              </p>
            </div>
          ) : (
            <div>
              <p style={{ margin: 0, fontSize: 14, color: "#666" }}>
                Drop a file here or click to browse
              </p>
              <p style={{ margin: "4px 0 0", fontSize: 12, color: "#999" }}>
                Accepts CSV, JSON, PDF, DOCX
              </p>
            </div>
          )}
        </div>

        {error && (
          <p style={{ margin: "0 0 12px", fontSize: 13, color: "#EF4444" }}>{error}</p>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{
              padding: "8px 16px",
              background: "#fff",
              color: "#374151",
              border: "1px solid #E5E7EB",
              borderRadius: 6,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleUpload}
            disabled={!importType || !file || uploading}
            style={{
              padding: "8px 16px",
              background: importType && file ? "#6C5CE7" : "#E5E7EB",
              color: importType && file ? "#fff" : "#999",
              border: "none",
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 500,
              cursor: importType && file && !uploading ? "pointer" : "not-allowed",
            }}
          >
            {uploading ? "Uploading..." : "Upload & Process"}
          </button>
        </div>
      </div>
    </div>
  );
}
