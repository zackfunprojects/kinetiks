"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { AppPanelOpen } from "@kinetiks/types";

/** A step in a multi-app orchestration (spec §10.4). */
export interface PanelStep {
  app: string;
  entity?: string;
  status: "done" | "active" | "queued";
}

/** The resolved target the split panel mounts (spec §4.2/§4.4). */
export interface AppPanelTarget {
  app: string;
  entity?: string;
  mode: "collaborative";
  /** Multi-app orchestration sequence; when present (>1) the panel shows a
   *  breadcrumb and supports side-by-side (spec §10.4). */
  steps?: PanelStep[];
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
