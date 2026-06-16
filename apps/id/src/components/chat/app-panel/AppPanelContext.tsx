"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { AppPanelOpen } from "@kinetiks/types";

/** The resolved target the split panel mounts (spec §4.2/§4.4). */
export interface AppPanelTarget {
  app: string;
  entity?: string;
  mode: "collaborative";
}

export interface AppPanelContextValue {
  panel: AppPanelTarget | null;
  /** Open the panel for an explicit target (action card "Open", user request). */
  openPanel: (target: AppPanelTarget) => void;
  /** Open from a command-pipeline `panel_open` signal (spec §4.2.1). */
  openFromSignal: (signal: AppPanelOpen) => void;
  closePanel: () => void;
}

const Ctx = createContext<AppPanelContextValue | null>(null);

export function AppPanelProvider({
  value,
  children,
}: {
  value: AppPanelContextValue;
  children: ReactNode;
}) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Returns the panel controller, or null outside a panel-capable layout (no-op). */
export function useAppPanel(): AppPanelContextValue | null {
  return useContext(Ctx);
}
