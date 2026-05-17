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
import { cn } from "./cn";

export type ToastTone = "neutral" | "success" | "warning" | "danger";

export interface ToastInput {
  id?: string;
  title?: ReactNode;
  body?: ReactNode;
  tone?: ToastTone;
  /** ms; default 5000. Set 0 to keep until dismissed. */
  duration?: number;
}

interface InternalToast extends Required<Omit<ToastInput, "duration" | "title" | "body">> {
  title?: ReactNode;
  body?: ReactNode;
  duration: number;
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
                <div style={{ flex: 1 }}>
                  {t.title ? <div className="kt-toast__title">{t.title}</div> : null}
                  {t.body ? <div className="kt-toast__body">{t.body}</div> : null}
                </div>
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
