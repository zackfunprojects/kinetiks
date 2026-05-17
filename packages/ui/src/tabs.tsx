"use client";

import {
  createContext,
  useContext,
  useId,
  useMemo,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { cn } from "./cn";

interface TabsContextValue {
  value: string;
  onValueChange: (next: string) => void;
  baseId: string;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsCtx(): TabsContextValue {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error("Tabs components must be used inside <Tabs>");
  return ctx;
}

export interface TabsProps {
  value: string;
  onValueChange: (next: string) => void;
  children: ReactNode;
  className?: string;
}

export function Tabs({ value, onValueChange, children, className }: TabsProps) {
  const baseId = useId();
  const ctx = useMemo(() => ({ value, onValueChange, baseId }), [value, onValueChange, baseId]);
  return (
    <TabsContext.Provider value={ctx}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

export function TabList({ children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div role="tablist" className={cn("kt-tabs", rest.className)} {...rest}>
      {children}
    </div>
  );
}

export interface TabTriggerProps extends HTMLAttributes<HTMLButtonElement> {
  value: string;
}

export function TabTrigger({ value, children, className, ...rest }: TabTriggerProps) {
  const ctx = useTabsCtx();
  const selected = ctx.value === value;
  const id = `${ctx.baseId}-trigger-${value}`;
  const panelId = `${ctx.baseId}-panel-${value}`;
  return (
    <button
      type="button"
      role="tab"
      id={id}
      aria-selected={selected}
      aria-controls={panelId}
      tabIndex={selected ? 0 : -1}
      onClick={() => ctx.onValueChange(value)}
      className={cn("kt-tab", className)}
      {...rest}
    >
      {children}
    </button>
  );
}

export interface TabPanelProps extends HTMLAttributes<HTMLDivElement> {
  value: string;
}

export function TabPanel({ value, children, ...rest }: TabPanelProps) {
  const ctx = useTabsCtx();
  if (ctx.value !== value) return null;
  const id = `${ctx.baseId}-panel-${value}`;
  const triggerId = `${ctx.baseId}-trigger-${value}`;
  return (
    <div role="tabpanel" id={id} aria-labelledby={triggerId} {...rest}>
      {children}
    </div>
  );
}
