"use client";

import { useState, useRef, useEffect, useCallback } from "react";
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
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Focus management: capture previous focus, move into dialog, restore on close
  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();

    return () => {
      previousFocusRef.current?.focus();
    };
  }, []);

  // Escape to close + focus trap
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }

      if (e.key === "Tab" && dialogRef.current) {
        const all = dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"]):not([aria-hidden="true"])'
        );
        const focusable = Array.from(all).filter(
          (el) => el.offsetParent !== null
        );
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    },
    [onClose]
  );

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) setFile(dropped);
  }

  function openFilePicker() {
    fileInputRef.current?.click();
  }

  async function handleUpload() {
    if (!importType || !file) return;
    setUploading(true);
    setError(null);

    try {
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
    border: "1px solid var(--border-default)",
    borderRadius: 6,
    fontSize: 13,
    color: "var(--text-primary)",
    background: "var(--bg-surface)",
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
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Upload Import"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        style={{
          background: "var(--bg-surface)",
          borderRadius: 12,
          padding: 24,
          width: 440,
          maxWidth: "90vw",
          outline: "none",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3
          id="import-modal-title"
          style={{ margin: "0 0 16px", fontSize: 18, fontWeight: 600, color: "var(--text-primary)" }}
        >
          Upload Import
        </h3>

        {/* Import type */}
        <div style={{ marginBottom: 12 }}>
          <label
            htmlFor="import-type-select"
            style={{ display: "block", fontSize: 12, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 4 }}
          >
            Import Type
          </label>
          <select
            id="import-type-select"
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
          <label
            htmlFor="target-app-select"
            style={{ display: "block", fontSize: 12, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 4 }}
          >
            Target App (optional)
          </label>
          <select
            id="target-app-select"
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

        {/* File upload zone - using a button for keyboard accessibility */}
        <button
          type="button"
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={openFilePicker}
          aria-label={file ? `Selected file: ${file.name}. Click to change.` : "Choose a file to upload"}
          style={{
            display: "block",
            width: "100%",
            border: `2px dashed ${dragOver ? "var(--accent)" : "var(--border-default)"}`,
            borderRadius: 8,
            padding: "24px 16px",
            textAlign: "center",
            cursor: "pointer",
            background: dragOver ? "var(--accent-muted)" : "var(--bg-base)",
            transition: "border-color 0.15s, background 0.15s",
            marginBottom: 16,
            font: "inherit",
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_FORMATS}
            aria-hidden="true"
            tabIndex={-1}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            style={{ display: "none" }}
          />
          {file ? (
            <div>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: "var(--text-primary)" }}>
                {file.name}
              </p>
              <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--text-tertiary)" }}>
                {(file.size / 1024).toFixed(1)} KB
              </p>
            </div>
          ) : (
            <div>
              <p style={{ margin: 0, fontSize: 14, color: "var(--text-secondary)" }}>
                Drop a file here or click to browse
              </p>
              <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--text-tertiary)" }}>
                Accepts CSV, JSON, PDF, DOCX
              </p>
            </div>
          )}
        </button>

        {error && (
          <p role="alert" style={{ margin: "0 0 12px", fontSize: 13, color: "var(--error)" }}>
            {error}
          </p>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{
              padding: "8px 16px",
              background: "var(--bg-surface)",
              color: "var(--text-secondary)",
              border: "1px solid var(--border-default)",
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
              background: importType && file ? "var(--accent-emphasis)" : "var(--border-default)",
              color: importType && file ? "var(--text-on-accent)" : "var(--text-tertiary)",
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
