"use client";

import { useEffect, useState } from "react";
import type { KinetiksDesktopBridge } from "@kinetiks/types";

declare global {
  interface Window {
    /** Present only when running inside the Kinetiks desktop shell. */
    electron?: KinetiksDesktopBridge;
  }
}

/** Non-React reader: true when running inside the desktop shell. */
export function isDesktop(): boolean {
  return typeof window !== "undefined" && window.electron?.isDesktop === true;
}

/** The desktop bridge, or null in a browser. */
export function getDesktopBridge(): KinetiksDesktopBridge | null {
  if (typeof window !== "undefined" && window.electron?.isDesktop) {
    return window.electron;
  }
  return null;
}

/**
 * React hook: whether the app is running inside the desktop shell.
 * Returns false on the server and on the first client render to avoid a
 * hydration mismatch, then resolves to the real value after mount.
 */
export function useIsDesktop(): boolean {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    setDesktop(isDesktop());
  }, []);
  return desktop;
}
