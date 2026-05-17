"use client";

import {
  useEffect,
  useRef,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "./cn";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  /** When true (default), pressing Escape closes the dialog. */
  closeOnEscape?: boolean;
  /** When true (default), clicking the backdrop closes the dialog. */
  closeOnBackdrop?: boolean;
  /** Accessible label/description for the dialog. */
  ariaLabel?: string;
  ariaLabelledBy?: string;
  className?: string;
  children?: ReactNode;
}

export function Dialog({
  open,
  onClose,
  closeOnEscape = true,
  closeOnBackdrop = true,
  ariaLabel,
  ariaLabelledBy,
  className,
  children,
}: DialogProps) {
  const surfaceRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open || !closeOnEscape) return;
    const handler = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, closeOnEscape, onClose]);

  useEffect(() => {
    if (!open) return;
    const previousActive = document.activeElement as HTMLElement | null;
    surfaceRef.current?.focus();
    return () => previousActive?.focus?.();
  }, [open]);

  if (!open) return null;
  if (typeof window === "undefined") return null;

  const handleBackdropClick = (e: MouseEvent<HTMLDivElement>) => {
    if (!closeOnBackdrop) return;
    if (e.target === e.currentTarget) onClose();
  };

  const handleDialogKey = (e: KeyboardEvent<HTMLDivElement>) => {
    // basic focus-trap stop: prevent Tab from leaving the dialog
    if (e.key !== "Tab" || !surfaceRef.current) return;
    const focusables = surfaceRef.current.querySelectorAll<HTMLElement>(
      'a, button, input, textarea, select, [tabindex]:not([tabindex="-1"])',
    );
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return createPortal(
    <div className="kt-dialog-backdrop" onClick={handleBackdropClick}>
      <div
        ref={surfaceRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        tabIndex={-1}
        onKeyDown={handleDialogKey}
        className={cn("kt-dialog", className)}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function DialogHeader({ children }: { children?: ReactNode }) {
  return <div className="kt-dialog__header">{children}</div>;
}
export function DialogBody({ children }: { children?: ReactNode }) {
  return <div className="kt-dialog__body">{children}</div>;
}
export function DialogFooter({ children }: { children?: ReactNode }) {
  return <div className="kt-dialog__footer">{children}</div>;
}
