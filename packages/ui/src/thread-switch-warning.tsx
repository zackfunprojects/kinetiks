"use client";

import { useEffect, useRef } from "react";
import { Button } from "./button";

export interface ThreadSwitchWarningProps {
  /** e.g. "Kit is still working on the fintech sequence — leave anyway?" */
  message: string;
  onStay: () => void;
  onLeave: () => void;
}

function WarnIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M8 2.5 L14.5 13.5 H1.5 Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path d="M8 6.5 V9.5 M8 11.5 H8.01" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

/**
 * The thread-switch / close-panel warning (spec §16.3): an amber floating bar
 * shown when the user tries to leave while the system is mid-task. Stay is the
 * primary (dark-filled) action; Leave is secondary. Token-only; light + dark.
 *
 * It is a transient non-modal bar, so it uses `role="alert"` (not alertdialog,
 * which implies a focus-trapped modal) and moves focus to the safe default
 * (Stay) so keyboard/screen-reader users don't miss it.
 */
export function ThreadSwitchWarning({ message, onStay, onLeave }: ThreadSwitchWarningProps) {
  const stayRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    stayRef.current?.focus();
  }, []);

  return (
    <div
      className="kt-floating-bar kt-floating-bar--warning"
      role="alert"
      aria-live="assertive"
      aria-label="Leave while working?"
    >
      <span className="kt-floating-bar__icon">
        <WarnIcon />
      </span>
      <span className="kt-floating-bar__body" style={{ fontSize: "var(--kt-fs-13)", color: "var(--kt-fg-1)" }}>
        {message}
      </span>
      <span className="kt-floating-bar__actions">
        <Button variant="secondary" size="sm" onClick={onLeave}>
          Leave
        </Button>
        <Button ref={stayRef} variant="primary" size="sm" onClick={onStay}>
          Stay
        </Button>
      </span>
    </div>
  );
}
