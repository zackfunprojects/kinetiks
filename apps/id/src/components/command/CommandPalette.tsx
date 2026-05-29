"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Input } from "@kinetiks/ui";
import { filterCommands, type AppCommand } from "@/lib/commands/registry";

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => filterCommands(query), [query]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      // focus after paint
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  if (!open || typeof document === "undefined") return null;

  function run(cmd: AppCommand | undefined) {
    if (!cmd) return;
    if (cmd.kind === "navigate" && cmd.href) {
      router.push(cmd.href);
    } else if (cmd.kind === "chat" && cmd.prompt) {
      router.push(`/chat?draft=${encodeURIComponent(cmd.prompt)}`);
    }
    onClose();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      run(results[active]);
    }
  }

  return createPortal(
    <div
      style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", justifyContent: "center", alignItems: "flex-start", paddingTop: "12vh" }}
      onMouseDown={onClose}
    >
      <div style={{ position: "absolute", inset: 0, background: "var(--kt-backdrop)" }} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          position: "relative",
          width: "min(560px, calc(100vw - var(--kt-s-6)))",
          background: "var(--kt-bg-elevated)",
          border: "1px solid var(--kt-border-1)",
          borderRadius: "var(--kt-radius-3)",
          boxShadow: "var(--kt-shadow-lg)",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "var(--kt-s-3)", borderBottom: "1px solid var(--kt-border-1)" }}>
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search commands, or type / for quick actions"
            aria-label="Search commands"
          />
        </div>
        <ul role="listbox" style={{ listStyle: "none", margin: 0, padding: "var(--kt-s-1)", maxHeight: 360, overflowY: "auto" }}>
          {results.length === 0 ? (
            <li className="kt-small" style={{ padding: "var(--kt-s-3)" }}>No matching commands.</li>
          ) : (
            results.map((cmd, i) => (
              <li
                key={cmd.id}
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onClick={() => run(cmd)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "var(--kt-s-3)",
                  padding: "var(--kt-s-2) var(--kt-s-3)",
                  borderRadius: "var(--kt-radius-1)",
                  cursor: "pointer",
                  background: i === active ? "var(--kt-accent-soft)" : "transparent",
                  color: "var(--kt-fg-1)",
                  fontSize: "var(--kt-fs-14)",
                }}
              >
                <span>{cmd.label}</span>
                {cmd.hint || cmd.slash ? <span className="kt-data-inline" style={{ color: "var(--kt-fg-3)" }}>{cmd.hint ?? cmd.slash}</span> : null}
              </li>
            ))
          )}
        </ul>
      </div>
    </div>,
    document.body,
  );
}
