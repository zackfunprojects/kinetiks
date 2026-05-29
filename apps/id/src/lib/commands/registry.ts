/**
 * Command registry for the ⌘K palette and the chat slash-command menu.
 *
 * Two kinds:
 *  - "navigate": jump to a route.
 *  - "chat": pre-fill the Chat composer with a draft (via /chat?draft=...),
 *    so the customer reviews before sending (never auto-sends).
 */
export interface AppCommand {
  id: string;
  label: string;
  /** Slash trigger shown as a hint and matched in the chat menu, e.g. "/brief". */
  slash?: string;
  hint?: string;
  keywords?: string[];
  kind: "navigate" | "chat";
  href?: string;
  prompt?: string;
}

export const COMMANDS: AppCommand[] = [
  // Navigation
  { id: "nav-chat", label: "Go to Chat", slash: "/threads", keywords: ["threads", "messages"], kind: "navigate", href: "/chat" },
  { id: "nav-analytics", label: "Go to Analytics", slash: "/analytics", keywords: ["metrics", "insights", "goals"], kind: "navigate", href: "/analytics" },
  { id: "nav-cortex", label: "Go to Cortex", slash: "/cortex", keywords: ["identity", "context"], kind: "navigate", href: "/cortex/identity" },
  { id: "nav-goals", label: "Goals", slash: "/goals", keywords: ["kpi", "okr", "target"], kind: "navigate", href: "/cortex/goals" },
  { id: "nav-budget", label: "Budget", slash: "/budget", keywords: ["spend", "allocation"], kind: "navigate", href: "/cortex/budget" },
  { id: "nav-patterns", label: "Patterns", slash: "/patterns", keywords: ["evidence"], kind: "navigate", href: "/cortex/patterns" },
  { id: "nav-authority", label: "Authority", slash: "/authority", keywords: ["permissions", "grants"], kind: "navigate", href: "/cortex/authority" },
  { id: "nav-integrations", label: "Integrations", slash: "/integrations", keywords: ["connections", "apps"], kind: "navigate", href: "/cortex/integrations" },
  { id: "nav-ledger", label: "Ledger", slash: "/ledger", keywords: ["history", "audit"], kind: "navigate", href: "/cortex/ledger" },
  { id: "nav-approvals", label: "View approvals", slash: "/approvals", keywords: ["pending", "review"], kind: "navigate", href: "/chat" },

  // Chat quick-actions (pre-fill the composer)
  { id: "chat-brief", label: "Daily brief", slash: "/brief", hint: "/brief", keywords: ["summary", "today"], kind: "chat", prompt: "Give me my daily brief." },
  { id: "chat-status", label: "GTM status", slash: "/status", hint: "/status", keywords: ["overview"], kind: "chat", prompt: "What's the status across my GTM right now?" },
  { id: "chat-goals-review", label: "Review goal pacing", kind: "chat", prompt: "How are my goals pacing, and what's the single highest-impact thing I should do this week?" },
];

function score(cmd: AppCommand, q: string): number {
  const query = q.toLowerCase().trim();
  if (!query) return 1;
  const label = cmd.label.toLowerCase();
  if (label.startsWith(query)) return 3;
  if (label.includes(query)) return 2;
  if (cmd.slash?.toLowerCase().includes(query)) return 2;
  if (cmd.keywords?.some((k) => k.includes(query))) return 1;
  return 0;
}

/** Filter + rank commands for the palette. Empty query returns all in registry order. */
export function filterCommands(query: string): AppCommand[] {
  const q = query.replace(/^\//, "");
  return COMMANDS.map((cmd) => ({ cmd, s: score(cmd, q) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.cmd);
}

/** Slash-menu commands: those with a slash trigger, matched against the typed token. */
export function filterSlashCommands(token: string): AppCommand[] {
  const q = token.toLowerCase();
  return COMMANDS.filter((c) => c.slash && c.slash.toLowerCase().startsWith(q));
}
