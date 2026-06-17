/**
 * Collaborative Workspace contract types.
 *
 * The shared, app-agnostic data shapes for the split-panel / shared-presence
 * collaborative workspace (`docs/collaborative-workspace-spec.md`). These are
 * pure data contracts: the same types flow over Supabase Realtime channels,
 * through the reference collaborative surface in `apps/id`, and (later) through
 * real suite-app `/embed` surfaces. No app or fixture knowledge lives here.
 *
 * The `CollaborativeSynapse` *handler* interface lives in `@kinetiks/synapse`
 * (it composes with the command handler); it imports these data shapes.
 *
 * Append-only: add fields/types, never repurpose existing ones, without a
 * versioned contract migration.
 */

/** Who is acting on the shared surface. Single-player today: one agent, one user. */
export type CollaborativeParticipant = "agent" | "user";

/** The three collaboration tempos (spec §7.1). */
export type TempoMode = "system_leads" | "user_leads" | "pair";

// ---------------------------------------------------------------------------
// Presence (spec §5) — ephemeral, broadcast only, never persisted.
// ---------------------------------------------------------------------------

export type PresenceEventType =
  | "focus"
  | "blur"
  | "select"
  | "type"
  | "scroll"
  | "hover"
  | "uncertain";

export interface PresenceTarget {
  /** Unique ID of the UI component the participant is acting on. */
  component_id: string;
  /** Specific field within the component, when applicable. */
  field_name?: string;
  /** Cursor position, for cursor_move-style rendering. */
  coordinates?: { x: number; y: number };
}

export interface PresenceMetadata {
  /** Why the agent paused / is uncertain (drives the uncertainty pulse). */
  uncertainty_reason?: string;
  /** Selection extent within a text field. */
  selection_range?: { start: number; end: number };
  /** In-progress typed content, for the live typing indicator preview. */
  typing_content?: string;
}

/** A single presence beat broadcast on `presence:{account_id}:{thread_id}`. */
export interface PresenceEvent {
  participant: CollaborativeParticipant;
  event_type: PresenceEventType;
  target: PresenceTarget;
  metadata?: PresenceMetadata;
  /** ISO-8601. */
  timestamp: string;
}

// ---------------------------------------------------------------------------
// UI state stream (spec §11.1) — emitted by an embedded surface so the
// presence layer can render the agent's cursor/typing in the parent shell.
// ---------------------------------------------------------------------------

export type UIStateChangeType =
  | "field_update"
  | "navigation"
  | "selection"
  | "cursor_move";

export interface UIStateChange {
  change_type: UIStateChangeType;
  component_id: string;
  field_name?: string;
  new_value?: unknown;
  cursor_position?: { x: number; y: number };
}

// ---------------------------------------------------------------------------
// Inline annotations (spec §6) — persisted (kinetiks_annotations) + broadcast.
// ---------------------------------------------------------------------------

export type AnnotationKind =
  | "decision_note"
  | "data_reference"
  | "skip_note"
  | "suggestion";

export type AnnotationPosition = "above" | "below" | "inline" | "tooltip";

/** Where an annotation may anchor on the current view (spec §11.1). */
export interface AnnotationAnchor {
  component_id: string;
  field_name: string;
  position: AnnotationPosition;
  /** Max chip width in px. */
  max_width: number;
}

/** A reply in the micro-conversation attached to an annotation (spec §6.2). */
export interface AnnotationReply {
  id: string;
  participant: CollaborativeParticipant;
  body: string;
  created_at: string;
}

/** Provenance: the Cortex evidence that informed an annotation (spec §6.1). */
export interface AnnotationReference {
  kind: "pattern" | "ledger" | "cortex_layer";
  id: string;
}

export interface Annotation {
  id: string;
  account_id: string;
  thread_id: string;
  kind: AnnotationKind;
  anchor: AnnotationAnchor;
  /** One-line collapsed summary. */
  summary: string;
  /** Full reasoning, shown on expand. */
  body: string;
  pinned: boolean;
  dismissed: boolean;
  replies?: AnnotationReply[];
  references?: AnnotationReference[];
  created_at: string;
  /** v2 multi-user placeholder; always null in v1. */
  team_scope_id: string | null;
}

// ---------------------------------------------------------------------------
// Delegation (spec §7.2) — drag-to-delegate region handed to the agent.
// ---------------------------------------------------------------------------

export interface DelegationRegion {
  /** UI components in the delegated region. */
  component_ids: string[];
  /** Specific fields, when narrower than whole components. */
  field_names?: string[];
  /** What the user was doing when they delegated. */
  context: string;
}

// ---------------------------------------------------------------------------
// Shared undo stack (spec §7.3) — persisted (kinetiks_workspace_actions).
// ---------------------------------------------------------------------------

export type WorkspaceActionType =
  | "field_update"
  | "entity_create"
  | "entity_delete"
  | "reorder"
  | "configuration";

export interface WorkspaceAction {
  id: string;
  participant: CollaborativeParticipant;
  action_type: WorkspaceActionType;
  /** Component/field ID the action targeted. */
  target: string;
  previous_value: unknown;
  new_value: unknown;
  /** Linked annotation, if the action carried one. */
  annotation_id?: string;
  /** Causal ordering within a thread. */
  sequence_index: number;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Task drawer (spec §8) — persisted (kinetiks_active_tasks), one active per thread.
// ---------------------------------------------------------------------------

export type ActiveTaskStatus = "active" | "paused" | "killed" | "completed";

export type ActiveTaskStepStatus =
  | "queued"
  | "working"
  | "done"
  | "skipped"
  | "failed";

/** A step in a (possibly multi-app) orchestrated task (spec §8.4). */
export interface ActiveTaskStep {
  index: number;
  app_name: string;
  label: string;
  status: ActiveTaskStepStatus;
}

export interface ActiveTask {
  id: string;
  account_id: string;
  thread_id: string;
  name: string;
  description?: string;
  app_name: string;
  status: ActiveTaskStatus;
  /** 0-100. */
  progress: number;
  current_step_index: number;
  steps: ActiveTaskStep[];
  started_at: string;
  /** v2 multi-user placeholder; always null in v1. */
  team_scope_id: string | null;
}

/** Reasons captured by the "What went wrong?" kill prompt (spec §8.3). */
export type KillReasonCode =
  | "wrong_tone"
  | "wrong_data"
  | "wrong_approach"
  | "wrong_target"
  | "other";

export interface KillSignal {
  task_id: string;
  reason_code: KillReasonCode;
  feedback?: string;
}

// ---------------------------------------------------------------------------
// Panel activation / embed (spec §4.2, §4.4).
// ---------------------------------------------------------------------------

/** Emitted on a CommandResponse to tell the shell to mount the app panel. */
export interface AppPanelOpen {
  app_name: string;
  entity_id?: string;
  /** Pre-built deep link, when the source already has one (e.g. an approval). */
  deep_link?: string;
  mode: "collaborative";
}

/** Parsed target for an embed surface (`/embed?...`). */
export interface EmbedTarget {
  app_name: string;
  entity_id?: string;
  thread_id: string;
  account_id: string;
  mode: "collaborative" | "standalone";
}

// ---------------------------------------------------------------------------
// Shell ↔ embed coordination (spec §4.4, §10.4) — the desktop webview and the
// web iframe both speak this contract. Web uses parent↔iframe postMessage;
// desktop uses <webview> host↔guest IPC. Per Phase 8.7 D1 the embed does its
// own Realtime + API directly (authenticated by the mirrored session); these
// messages carry COORDINATION only, never the bulk presence/annotation data.
// ---------------------------------------------------------------------------

/** Tag on every panel message; rejected if absent (origin + source double-check). */
export const PANEL_MESSAGE_SOURCE = "kinetiks-embed" as const;

export type PanelMessageType =
  | "ready" // guest → host: the embed mounted
  | "init" // host → guest: (re)provide context without a reload
  | "focus" // host → guest: focus a field
  | "delegate" // host → guest: hand over a drag-to-delegate region
  | "visibility" // host → guest: this frame is active/suspended (§14.3)
  | "ui_state"; // guest → host: a UI state change the shell may react to

export type PanelMessage =
  | { source: typeof PANEL_MESSAGE_SOURCE; type: "ready"; entity_id: string | null; thread_id: string | null }
  | { source: typeof PANEL_MESSAGE_SOURCE; type: "init"; account_id: string; thread_id: string | null; entity_id: string | null }
  | { source: typeof PANEL_MESSAGE_SOURCE; type: "focus"; component_id: string; field_name?: string }
  | { source: typeof PANEL_MESSAGE_SOURCE; type: "delegate"; region: DelegationRegion }
  | { source: typeof PANEL_MESSAGE_SOURCE; type: "visibility"; visible: boolean }
  | { source: typeof PANEL_MESSAGE_SOURCE; type: "ui_state"; change: UIStateChange };
