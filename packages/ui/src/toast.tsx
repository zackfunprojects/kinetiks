"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Button } from "./button";
import { cn } from "./cn";

export type ToastTone = "neutral" | "success" | "warning" | "danger";

/** The action affordance on the right of an agent-action toast (§16.2). */
export interface ToastAction {
  label: ReactNode;
  onClick: () => void;
  /** outline = Undo / Retry; primary = dark-filled CTA (§16.6). Default outline. */
  variant?: "outline" | "primary";
}

export interface ToastInput {
  id?: string;
  title?: ReactNode;
  body?: ReactNode;
  tone?: ToastTone;
  /** ms; default 5000. Set 0 to keep until dismissed. */
  duration?: number;
  /** Right-side action (Undo, Retry, CTA). Running it also dismisses the toast. */
  action?: ToastAction;
}

interface InternalToast extends Required<Omit<ToastInput, "duration" | "title" | "body" | "action">> {
  title?: ReactNode;
  body?: ReactNode;
  duration: number;
  action?: ToastAction;
}

interface ToastContextValue {
  push: (input: ToastInput) => string;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

/** Tone icon (§16.5 anatomy: icon on the left). Colored via .kt-toast__icon. */
function ToastIcon({ tone }: { tone: ToastTone }) {
  const path =
    tone === "success"
      ? "M3.5 7.5 L6 10 L10.5 4.5" // check
      : tone === "warning"
        ? "M7 4 V8 M7 10 H7.01" // exclamation
        : tone === "danger"
          ? "M4.5 4.5 L9.5 9.5 M9.5 4.5 L4.5 9.5" // x
          : "M7 6.5 V10 M7 4 H7.01"; // info
  return (
    <span className="kt-toast__icon" aria-hidden="true">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        {tone !== "warning" ? (
          <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.25" opacity="0.4" />
        ) : null}
        <path d={path} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<InternalToast[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (input: ToastInput) => {
      const id = input.id ?? Math.random().toString(36).slice(2, 10);
      const t: InternalToast = {
        id,
        tone: input.tone ?? "neutral",
        title: input.title,
        body: input.body,
        duration: input.duration ?? 5000,
        action: input.action,
      };
      setToasts((prev) => [...prev, t]);
      if (t.duration > 0) {
        setTimeout(() => dismiss(id), t.duration);
      }
      return id;
    },
    [dismiss],
  );

  const value = useMemo(() => ({ push, dismiss }), [push, dismiss]);

  const region =
    mounted && typeof window !== "undefined"
      ? createPortal(
          <div className="kt-toast-region" aria-live="polite">
            {toasts.map((t) => (
              <div
                key={t.id}
                className={cn(
                  "kt-toast",
                  t.tone !== "neutral" ? `kt-toast--${t.tone}` : "",
                )}
                role="status"
              >
                <ToastIcon tone={t.tone} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  {t.title ? <div className="kt-toast__title">{t.title}</div> : null}
                  {t.body ? <div className="kt-toast__body">{t.body}</div> : null}
                </div>
                {t.action ? (
                  <Button
                    className="kt-toast__action"
                    variant={t.action.variant === "primary" ? "primary" : "secondary"}
                    size="sm"
                    onClick={() => {
                      t.action?.onClick();
                      dismiss(t.id);
                    }}
                  >
                    {t.action.label}
                  </Button>
                ) : null}
                <button
                  type="button"
                  onClick={() => dismiss(t.id)}
                  aria-label="Dismiss notification"
                  className="kt-btn kt-btn--ghost kt-btn--sm"
                >
                  ×
                </button>
              </div>
            ))}
          </div>,
          document.body,
        )
      : null;

  return (
    <ToastContext.Provider value={value}>
      {children}
      {region}
    </ToastContext.Provider>
  );
}
