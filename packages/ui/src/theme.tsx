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

export type Theme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (next: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}

export interface ThemeProviderProps {
  /**
   * Initial theme. Falls back to the pre-paint document attribute, then to
   * the system preference. Useful for SSR scenarios where the server can
   * pass a stored preference.
   */
  initialTheme?: Theme;
  /**
   * Called whenever the theme changes (initial mount and subsequent toggles).
   * Use this to persist the choice to a backend (e.g. Supabase user profile).
   * The provider already writes to localStorage; this callback is in addition.
   */
  onThemeChange?: (next: Theme) => void | Promise<void>;
  children: ReactNode;
}

const STORAGE_KEY = "kt-theme";

function readSystemTheme(): Theme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function readInitialTheme(initial?: Theme): Theme {
  if (initial) return initial;
  if (typeof document === "undefined") return "light";
  const attr = document.documentElement.getAttribute("data-theme");
  if (attr === "light" || attr === "dark") return attr;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    /* localStorage unavailable */
  }
  return readSystemTheme();
}

function applyTheme(next: Theme): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", next);
}

export function ThemeProvider({ initialTheme, onThemeChange, children }: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(() => readInitialTheme(initialTheme));

  // Apply on mount + whenever theme changes
  useEffect(() => {
    applyTheme(theme);
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  // Follow OS preference when user hasn't made an explicit choice
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = (() => {
      try {
        return window.localStorage.getItem(STORAGE_KEY);
      } catch {
        return null;
      }
    })();
    if (stored === "light" || stored === "dark") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      setThemeState(e.matches ? "dark" : "light");
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const setTheme = useCallback(
    (next: Theme) => {
      setThemeState(next);
      // Fire-and-forget; surface errors to console (Sentry capture is the app's responsibility).
      if (onThemeChange) {
        Promise.resolve(onThemeChange(next)).catch((err) => {
          // eslint-disable-next-line no-console
          console.error("[ThemeProvider] onThemeChange failed", err);
        });
      }
    },
    [onThemeChange],
  );

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      if (onThemeChange) {
        Promise.resolve(onThemeChange(next)).catch((err) => {
          // eslint-disable-next-line no-console
          console.error("[ThemeProvider] onThemeChange failed", err);
        });
      }
      return next;
    });
  }, [onThemeChange]);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, setTheme, toggleTheme }),
    [theme, setTheme, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
