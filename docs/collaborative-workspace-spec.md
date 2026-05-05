# Collaborative Workspace Spec

> **The split-panel, shared-surface interaction model for Kinetiks desktop and web.**
> This spec defines how users and their named system work together on app surfaces in real time - not as a handoff relay, but as co-participants on a shared workspace.
> Depends on: cross-app-command-router-spec.md, approval-system-spec.md, CLAUDE-v2.md (Phase 1 shell, Phase 4 routing)
> Phase: 4+ (after cross-app command routing is solid)

---

## 1. The Problem

Every agent product today treats human-AI collaboration as a relay. The agent does work in a black box, produces output, hands it to the human for review, the human edits and hands it back. The user never sees the agent working. The agent never sees the user working. Trust is built through text descriptions of actions, not through shared presence on the actual work surface.

This creates three failures:

**Opacity.** When the named system says "I've drafted a 3-touch sequence for fintech CFOs," the user reads a text summary in chat. They cannot see the sequence in context, cannot see how it fits alongside other campaigns, cannot compare it against their existing work. The approval decision is made with incomplete visual information.

**Context switching.** To actually review or edit the work, the user must leave chat, navigate to the app, find the entity, load it, make changes, come back to chat, and report what they did. Every context switch is friction. Every friction point is a place users give up and just approve without looking.

**No shared workspace.** The most productive human collaboration happens when both participants are on the same surface - pair programming, whiteboard sessions, shared documents. Agent-human collaboration has no equivalent. The agent works in API calls. The human works in a UI. They never occupy the same space.

---

## 2. The Solution

When the named system begins working in an app, the Kinetiks interface splits to show the app surface alongside the conversation. Both the system and the user have persistent presence on the app surface. The system works, the user watches, intervenes, takes over, or collaborates - all on the same screen, in real time.

This is not "watch mode." This is a shared workspace where the named system and the user are co-participants with equal access to the same tools and surfaces.

---

## 3. Two Product Surfaces

### 3.1 Desktop App (Full Experience)

The Electron desktop app is the primary collaborative workspace. All Kinetiks apps render inside the desktop shell as embedded panels. The user never leaves the desktop app to work in a suite app - the app comes to them.

This transforms the desktop app from "a wrapper around the web app" into **the workspace where a human and their GTM strategist operate together across an entire suite of tools.**

**Why this matters commercially:** Standalone web apps (hv.kinetiks.ai, dm.kinetiks.ai) work great on their own. But the moment a user wants their named system working across apps with shared presence, they need the desktop app. That is a genuine capability unlock, not a paywall.

### 3.2 Web App (Adapted Experience)

The web app at kinetiks.ai supports the split panel in browsers that have sufficient viewport width (>1280px). On narrower viewports, the app panel opens as a slide-over that can be toggled back to chat. The interaction model is identical - just the layout adapts.

---

## 4. The Split Panel

### 4.1 Layout

When the named system invokes an app through the command router, the Chat tab splits:

```
+--------------------------------------------------+
| Chat | Analytics | Cortex            [avatar]     |
+--------------------------------------------------+
| Threads |                    |                    |
| --------|   Chat Panel       |   App Panel        |
| Thread 1|   (conversation)   |   (live app UI)    |
| Thread 2|                    |                    |
| Thread 3|   User: Build a    |   [Harvest]        |
|         |   3-touch sequence |   Sequence Builder  |
| [Apprvl]|   for fintech CFOs |   Step 1: [Email]  |
|         |                    |   Step 2: [LinkedIn]|
|         |   Kit: Working on  |   Step 3: [Email]  |
|         |   it now...        |                    |
|         |                    |   [Agent cursor]   |
|         |                    |   [User cursor]    |
+--------------------------------------------------+
```

**Left third:** Sidebar (thread history or approvals - unchanged from current spec)
**Center:** Chat panel (narrows from full-width to roughly half)
**Right:** App panel (mounts the target app's UI)

### 4.2 Panel Activation

The app panel activates when:

1. **Command dispatch.** Marcus fires a SynapseCommand through the cross-app command router. The `target_app` field determines which app UI to mount.
2. **User request.** The user says "show me Harvest" or "open the sequence builder" - an explicit request to bring an app surface into view.
3. **Approval context.** The user taps an approval card that has a `deep_link`. Instead of opening the app in a new tab, the app panel mounts with the entity loaded.
4. **Chat action card.** Rich response components (action cards, app cards) include an "Open" affordance that mounts the app panel.

### 4.3 Panel Deactivation

The app panel closes when:

- The user clicks a close button on the panel
- The user says "close Harvest" or similar
- The named system completes the task and the user hasn't interacted with the panel
- The user switches to Analytics or Cortex tab
- The user starts a new chat thread (panel resets; does not persist across threads)

### 4.4 App Mounting

Each Kinetiks app exposes an embeddable mode via a query parameter or route:

```
hv.kinetiks.ai/embed?entity=sequence_abc123&mode=collaborative
dm.kinetiks.ai/embed?entity=article_xyz789&mode=collaborative
ht.kinetiks.ai/embed?entity=page_456&mode=collaborative
```

In the desktop app, this is an Electron webview. In the web app, this is an iframe with postMessage communication. The `mode=collaborative` flag tells the app to:

- Hide its own top navigation (the Kinetiks shell provides that)
- Enable the presence layer (cursor tracking, annotation anchors)
- Expose the intervention API (for drag-to-delegate, shared undo, etc.)
- Stream UI state changes over the Supabase Realtime channel

**Authentication:** The shared `.kinetiks.ai` session cookie handles auth automatically. The embedded app reads the same session - no re-authentication needed.

---

## 5. Presence Layer

Both the named system and the user are visible participants on the app surface.

### 5.1 Agent Presence

The named system's actions in the app are visualized as a cursor-like presence indicator:

- **Active cursor.** A labeled dot (with the system's name, e.g. "Kit") that moves to the field or component the system is currently operating on. Smooth animation between positions. Color matches the system's brand color (derived from the Kinetiks design system accent).
- **Uncertainty pulse.** When the system is uncertain about a decision, its cursor pauses on the relevant field and pulses with a subtle glow. This is a richer signal than a text prompt - the user can see exactly what the system is unsure about and intervene precisely.
- **Selection highlight.** When the system selects content (a prospect, a section of copy, a sequence step), the selection is highlighted with a translucent overlay in the system's color.
- **Typing indicator.** When the system is generating text in a field (email copy, subject line, blog paragraph), the text appears character-by-character with a cursor, mimicking human typing at accelerated speed. This gives the user time to read along and interrupt.

### 5.2 User Presence

The user interacts with the app panel exactly as they would with the standalone app - clicking, typing, scrolling. Their actions are tracked as presence events so the system can respond:

- The system sees which field the user is focused on
- The system sees when the user starts editing a field it was about to touch
- The system sees scroll position (knows what the user is looking at)
- The system sees hover events (knows what the user is considering)

### 5.3 Presence Communication

Presence state is communicated over Supabase Realtime on a dedicated channel:

```
Channel: presence:{account_id}:{thread_id}
```

```typescript
interface PresenceEvent {
  participant: 'agent' | 'user';
  event_type: 'focus' | 'blur' | 'select' | 'type' | 'scroll' | 'hover' | 'uncertain';
  target: {
    component_id: string;      // Unique ID of the UI component
    field_name?: string;       // Specific field within the component
    coordinates?: { x: number; y: number };  // For cursor position
  };
  metadata?: {
    uncertainty_reason?: string;   // Why the agent is uncertain
    selection_range?: { start: number; end: number };
    typing_content?: string;       // What's being typed (for preview)
  };
  timestamp: string;
}
```

---

## 6. Inline Annotations

The named system doesn't just fill in fields - it explains its reasoning directly on the UI surface.

### 6.1 Annotation Types

**Decision note.** Attached to a field the system has filled. Explains why it made that choice. Example: "Chose this subject line because your voice profile emphasizes directness over curiosity hooks."

**Data reference.** Points to specific Cortex data that informed a decision. Example: "This segment matches 34 prospects in your ICP - highest concentration in Series B fintech."

**Skip note.** Explains why the system left a field empty or skipped a step. Example: "Skipped LinkedIn touch - your engagement data shows email outperforms LinkedIn 3:1 for this persona."

**Suggestion.** A non-blocking recommendation the system is less confident about. Example: "Consider adding a P.S. with the case study link - similar sequences saw 12% higher reply rates with a P.S."

### 6.2 Annotation UX

Annotations appear as small, labeled chips anchored to the relevant UI element. They are:

- **Dismissible.** User clicks X to remove. The system learns that annotation type was unwanted in this context.
- **Pinnable.** User can pin an annotation so it persists even after the panel closes. Pinned annotations become part of the entity's context in the Learning Ledger.
- **Replyable.** User can reply directly to an annotation, creating a micro-conversation attached to the field. "Why not the curiosity hook approach?" - and the system responds inline.
- **Collapsible.** By default, annotations show a one-line summary. Tap to expand for full reasoning.

### 6.3 Annotation Density Control

Too many annotations clutter the surface. The system calibrates annotation density based on:

- **Autonomy level.** In Human Drive mode, more annotations (the system is teaching). In Autopilot, fewer (the user trusts the system's judgment).
- **User behavior.** If the user consistently dismisses a type of annotation, frequency decreases for that type.
- **Decision stakes.** High-stakes decisions (first cold email to a new segment, budget changes) always get annotations regardless of density settings.

---

## 7. Collaboration Modes

### 7.1 Tempo Control

A control in the app panel header lets the user set the collaboration dynamic:

**System Leads** (default when system initiates the work)
The named system moves through the workflow autonomously. The user watches, reads annotations, and intervenes only when they want to. The system proceeds unless the user grabs a field or says "wait."

**User Leads** (default when user opens the app panel manually)
The user works normally. The system provides contextual suggestions on the elements the user is touching - inline autocomplete, data lookups, recommendation chips next to fields. The system never fills a field unless the user explicitly invites it.

**Pair Mode** (toggled explicitly)
Both work simultaneously. The system handles the parts of the workflow it's confident about. The user handles the parts they want control over. Contested fields (both want to work on the same thing) are resolved by a brief negotiation: the system pauses and says "I was going to [action] - want me to, or do you want to handle this?"

### 7.2 Drag-to-Delegate

The user can select a region of the UI (a form section, a group of fields, a step in a sequence) and drag it toward the system's presence indicator (or press a keyboard shortcut). This signals: "You handle this part."

The system picks up from exactly that point, on exactly those fields, leaving the rest to the user.

The inverse works too. The system is auto-filling and the user clicks into a field the system was about to touch. The system immediately yields that field and moves to the next one. No confirmation dialog needed - the click is the signal.

### 7.3 Shared Undo Stack

Both agent and human actions live in the same history. The undo stack tracks:

```typescript
interface WorkspaceAction {
  id: string;
  participant: 'agent' | 'user';
  action_type: 'field_update' | 'entity_create' | 'entity_delete' | 'reorder' | 'configuration';
  target: string;               // Component/field ID
  previous_value: any;
  new_value: any;
  annotation_id?: string;       // If this action had an associated annotation
  timestamp: string;
}
```

The user can:
- Undo the system's last N actions without losing their own
- Undo their own last N actions without losing the system's
- Undo all actions (both participants) in reverse chronological order
- See the history as an expandable timeline showing who did what

Keyboard shortcuts:
- `Cmd/Ctrl + Z` - undo last action (either participant, most recent)
- `Cmd/Ctrl + Shift + Z` - undo last system action only
- `Cmd/Ctrl + Alt + Z` - open undo timeline panel

---

## 8. Task Drawer

### 8.1 Purpose

When the named system is actively working in the app panel, a collapsible drawer anchored to the bottom of the panel shows what's happening. This gives the user a control surface over the system's active work - visibility into the current task, the ability to kill it, and a structured feedback path when something goes wrong.

### 8.2 Layout

```
+----------------------------------------------+
|  App Panel (Harvest Sequence Builder)         |
|                                               |
|  [Agent cursor working on Step 2...]          |
|                                               |
+----------------------------------------------+
| v  Active Task                    [Kill Task] |
|    Building 3-touch fintech CFO sequence      |
|    Step 2 of 4: Drafting email 2              |
|    ████████░░░░░░░░  45%                      |
+----------------------------------------------+
```

The drawer is collapsed by default to a single line showing the task name and a progress indicator. Expanding it shows:

- **Task name and description** (from the SynapseCommand)
- **Current step** (from CommandProgress streaming)
- **Progress bar** (from the progress percentage)
- **App badge** (which app is being used)
- **Kill Task button** (red, always visible even in collapsed state)
- **Elapsed time**

### 8.3 Kill Task Flow

When the user hits Kill Task:

1. The system immediately stops its current action. Any in-progress field updates are reverted via the undo stack.
2. A feedback prompt appears in the drawer: **"What went wrong?"** with a text field and optional quick-select reasons (wrong tone, wrong data, wrong approach, wrong target, other).
3. The user's response is logged as a **kill signal** in the Learning Ledger - a stronger negative signal than a standard rejection. Kill signals carry 2x the weight of a rejection for confidence recalculation in that action category.
4. The system acknowledges in chat: "Got it - I stopped the sequence build. [Summary of feedback]. I'll factor this in next time."
5. Trust contraction rules from the Approval System apply. A kill is treated as a rejection for threshold purposes.

### 8.4 Multi-Step Task Visibility

For orchestrated commands that span multiple steps (e.g., "blog post then sequence then PR pitch"), the drawer shows the full plan with current position:

```
| v  Active Task                         [Kill] |
|    Launch fintech security campaign            |
|    1. Draft blog post (Dark Madder)    [done]  |
|    2. Build sequence (Harvest)     [working...]|
|    3. Draft PR pitch (Litmus)        [queued]  |
+------------------------------------------------+
```

The user can kill the entire orchestration or kill just the current step ("Skip this step, move to the next one").

---

## 9. Approval System Integration

The collaborative workspace transforms how approvals feel.

### 9.1 Visual Approval

Instead of a text card in the sidebar saying "Approve this follow-up email to Jane at Acme?", the user sees:

- The email in the Harvest compose view, in the app panel
- The system's cursor resting on the "Send" button
- An annotation on the subject line explaining the choice
- An annotation on the recipient showing enrichment data
- A translucent overlay on the email body with a subtle "Approve" / "Edit" / "Reject" bar at the bottom of the panel

The user can:
- Read the email in full context (seeing the sequence, the prospect profile, the send schedule around it)
- Edit directly in the compose view (the system watches and learns from every edit)
- Approve with a single click on the overlay bar
- Reject with a reason that the system processes as a learning signal

### 9.2 Trust Through Tempo

The Approval System's confidence-based autonomy maps naturally to the presence model:

**Low confidence (always ask).** The system works slowly and visibly. Every field gets an annotation. The system pauses at each decision point and waits for the user to observe before proceeding.

**Medium confidence.** The system works at moderate speed. Key decisions get annotations. The system pauses only at fields it's uncertain about.

**High confidence (approaching auto-approve).** The system works quickly. Minimal annotations - only on novel decisions. The system shows a brief summary of what it did rather than walking through each step. The user can expand to see the full history if they want.

**Auto-approved.** The work happens in the background. No panel opens. A notification appears in the sidebar: "Kit auto-approved and sent 3 follow-up emails. [Review]" Tapping "Review" opens the panel with a retrospective view of what happened.

### 9.3 Intervention as Trust Signal

In the collaborative workspace, intervention replaces permission dialogs:

- The user grabs a field the system was about to fill = "I don't trust you on this one"
- The user lets the system work through a section without touching it = "I trust you on this"
- The user edits a field the system filled = a training signal (same as edit-before-approve)
- The user undoes a system action = a weak rejection signal

These implicit trust signals feed into the confidence model alongside explicit approvals. Over time, the system learns which fields the user always takes over (low confidence in that area) and which they never touch (high confidence).

---

## 10. The App-First Upgrade Story

### 10.1 Standalone Users

Users of standalone apps (hv.kinetiks.ai, dm.kinetiks.ai) work in their app normally. No collaborative workspace. The floating pill in the corner is their connection to Kinetiks - showing their system's name, pending approvals, and quick-chat if they've set up Kinetiks.

### 10.2 The Discovery Moment

When a standalone user sets up Kinetiks and downloads the desktop app, they discover that every app they already use now lives inside the desktop app. Their named system can work alongside them in any of those apps. This is the "aha" moment.

### 10.3 The Orchestration Moment

The second "aha" is when the user asks their system to do something that spans multiple apps. "Launch a campaign with a blog post, outbound sequence, and PR pitch." The desktop app orchestrates all three - potentially showing multiple app panels in sequence as the system works through each one, or showing a primary app panel with status indicators for the others.

### 10.4 Multi-App Panel Behavior

When a command spans multiple apps (orchestration):

**Sequential display.** The app panel shows the current active app. As the system moves from Dark Madder (drafting the blog) to Harvest (building the sequence), the panel transitions between apps. A breadcrumb bar at the top of the panel shows the orchestration progress:

```
[Dark Madder: Blog Post] > [Harvest: Sequence] > [Litmus: PR Pitch]
     (complete)              (in progress)          (queued)
```

The user can click any step to view that app's work, even if the system has moved on.

**Side-by-side (desktop only, wide viewports).** For two-app orchestrations where the apps reference each other (e.g., "build a sequence that references this blog post"), the panel can split into two sub-panels showing both apps simultaneously. This is opt-in via a toggle: "Show both."

---

## 11. Synapse Extensions

### 11.1 Collaborative Mode Interface

Each app Synapse must implement an extended interface for collaborative mode:

```typescript
interface CollaborativeSynapse extends SynapseCommandHandler {
  // Stream UI state changes for the presence layer
  subscribeToUIState(callback: (state: UIStateChange) => void): void;

  // Receive user presence events
  handleUserPresence(event: PresenceEvent): void;

  // Get available annotation anchors for the current view
  getAnnotationAnchors(): AnnotationAnchor[];

  // Handle drag-to-delegate regions
  handleDelegation(region: DelegationRegion): Promise<void>;

  // Get undo stack for the current session
  getUndoStack(): WorkspaceAction[];

  // Apply undo
  applyUndo(action_id: string): Promise<void>;
}

interface UIStateChange {
  change_type: 'field_update' | 'navigation' | 'selection' | 'cursor_move';
  component_id: string;
  field_name?: string;
  new_value?: any;
  cursor_position?: { x: number; y: number };
}

interface AnnotationAnchor {
  component_id: string;
  field_name: string;
  position: 'above' | 'below' | 'inline' | 'tooltip';
  max_width: number;
}

interface DelegationRegion {
  component_ids: string[];          // UI components in the delegated region
  field_names?: string[];           // Specific fields (if not entire components)
  context: string;                  // What the user was doing when they delegated
}
```

### 11.2 Embed Route

Each app adds an `/embed` route that renders the app in collaborative mode:

```typescript
// apps/hv/src/app/embed/page.tsx
// apps/dm/src/app/embed/page.tsx
// apps/ht/src/app/embed/page.tsx
// apps/lt/src/app/embed/page.tsx

export default function EmbedPage({
  searchParams
}: {
  searchParams: { entity?: string; mode?: string }
}) {
  const isCollaborative = searchParams.mode === 'collaborative';

  return (
    <CollaborativeProvider enabled={isCollaborative}>
      <AppContent entity={searchParams.entity} hideNav={isCollaborative} />
    </CollaborativeProvider>
  );
}
```

### 11.3 CollaborativeProvider

A shared package (`packages/collaborative/`) provides the React context and hooks:

```typescript
// packages/collaborative/src/provider.tsx
interface CollaborativeContextValue {
  isCollaborative: boolean;
  agentPresence: PresenceEvent | null;
  userPresence: PresenceEvent | null;
  annotations: Annotation[];
  undoStack: WorkspaceAction[];
  tempoMode: 'system_leads' | 'user_leads' | 'pair';
  delegate: (region: DelegationRegion) => void;
  undo: (actionId: string) => void;
  addAnnotation: (annotation: Annotation) => void;
  dismissAnnotation: (annotationId: string) => void;
}

// Hooks for app components
export function useAgentPresence(): PresenceEvent | null;
export function useFieldAnnotations(fieldName: string): Annotation[];
export function useIsAgentFocused(componentId: string): boolean;
export function useDelegateRegion(): (componentIds: string[]) => void;
```

---

## 12. Realtime Channels

The collaborative workspace uses three Supabase Realtime channels per session:

| Channel | Purpose | Direction |
|---------|---------|-----------|
| `presence:{account_id}:{thread_id}` | Cursor positions, focus, hover, selection | Bidirectional |
| `annotations:{account_id}:{thread_id}` | Annotation CRUD, replies, dismissals | Bidirectional |
| `workspace:{account_id}:{thread_id}` | Undo stack, delegation events, tempo changes | Bidirectional |

These are in addition to the existing `synapse:{app_name}:{account_id}` channel used by the command router for command dispatch and progress streaming.

---

## 13. Phased Implementation

This system builds incrementally on existing infrastructure.

### 13.1 Phase 4a: Basic Split Panel

**Prerequisite:** Phase 4 command router dispatching commands to Synapses.

- App panel renders as an embedded webview/iframe when a command is dispatched
- Panel shows the target app's UI with the entity loaded via deep link
- No presence layer yet - just the split layout
- Panel close/open controls
- Approval cards in the sidebar link to the app panel instead of opening a new tab

**This alone is a significant UX improvement.** Users can see the work the system is doing in context without leaving chat.

### 13.2 Phase 4b: Presence Layer

- Agent cursor visualization (labeled dot, smooth animation)
- Agent typing indicator in text fields
- Progress streaming from Synapse renders as cursor movement in the app panel
- Uncertainty pulse on fields where the system pauses
- User click-to-intervene (user clicks a field, system yields it)

### 13.3 Phase 4c: Annotations

- Annotation rendering anchored to UI components
- Dismiss, pin, collapse interactions
- Annotation density control based on approval mode
- Decision notes generated by the system during work

### 13.4 Phase 4d: Full Collaboration

- Tempo control (System Leads / User Leads / Pair Mode)
- Drag-to-delegate
- Shared undo stack
- Annotation replies
- Implicit trust signals feeding the confidence model
- Multi-app panel transitions for orchestrated commands

### 13.5 Dependencies

| Component | Depends On |
|-----------|-----------|
| Basic split panel | Phase 4 command router, app embed routes |
| Presence layer | Split panel, Supabase Realtime channels |
| Annotations | Presence layer, Cortex data for reasoning context |
| Full collaboration | All of the above, Approval System (Phase 2) |
| Multi-app panels | Cross-app orchestration (Phase 4 dispatch plans) |
| Implicit trust signals | Approval confidence model (Phase 2) |

---

## 14. Performance Constraints

### 14.1 Presence Latency

Presence events must render within 100ms of occurrence. This is the threshold for feeling "live." Supabase Realtime over WebSocket should achieve this. If latency exceeds 150ms, the cursor animation interpolates to smooth the gap.

### 14.2 App Panel Load Time

The embedded app must reach interactive within 2 seconds of panel activation. Strategies:

- **Preloading.** When the system begins processing a command (before results are ready), the app panel can begin loading the target app's embed route in a hidden webview.
- **Entity prefetch.** The command includes the entity ID. The embed route can start loading entity data before the full command result arrives.
- **Skeleton UI.** The app renders a skeleton immediately, populates fields as the system works.

### 14.3 Memory

The desktop app may have multiple app webviews loaded (if the user switches between apps frequently). Limit to 3 cached webviews. Least-recently-used eviction. The current active panel is always live; the other 2 are cached but suspended.

---

## 15. What This Changes About the Product

This spec redefines what the Kinetiks desktop app is. It is not a wrapper around a web app. It is not a chat interface with a sidebar. It is **a collaborative workspace where a human and their named GTM strategist operate together across an entire suite of tools.**

No product in the market offers this interaction model. Agent products today are either chat-first (you talk, it does, you review) or tool-first (you use the tool, AI assists in the margins). This is neither. This is shared-surface, shared-presence, co-creation - where the conversation and the work happen simultaneously on the same screen, and both participants can see and respond to each other in real time.

The conversation is not a proxy for work. The conversation happens alongside the work. The work is visible, tangible, and jointly owned.

---

## 16. Design Direction

The collaborative workspace UI draws from the **floating bar / pill pattern** used in modern bulk-action panels and notification systems. The reference point is Dmitry Sergushkin's Bulk Action Panel system - pill-shaped bars that float above content, contain contextual actions, and dismiss cleanly.

### 16.1 Task Drawer as Floating Bar

The task drawer (Section 8) is not a traditional drawer or sidebar. It is a **floating pill anchored to the bottom of the app panel**, visually consistent with the notification and action bars used across the Kinetiks design system.

**Collapsed state:** A single-line floating pill with rounded corners and a subtle shadow. Left side: system name + current step label. Right side: progress indicator + kill button (red text, no fill - matching the "Delete" treatment in the reference). The pill hovers above the app content with comfortable spacing, never docked to the edge.

**Expanded state:** The pill grows vertically to reveal the full task plan (for multi-step orchestrations), elapsed time, and step-level controls. Same rounded corners, same floating treatment. Expansion is animated, not a jump cut.

### 16.2 Agent Action Toasts

Every agent action in the app panel produces a **floating toast notification** in the same visual language:

- **Success (green icon):** "Subject line updated" with an **Undo** button. Appears after the system fills a field. Auto-dismisses after 5 seconds unless the user hovers. This is the primary undo affordance - not a menu, not a shortcut hint, but a visible button on the toast itself.
- **Warning (amber icon):** "Kit is uncertain about this field" - appears when the system's uncertainty pulse activates. Dismissible. Tapping it scrolls to the uncertain field and expands the annotation.
- **Error (red icon):** "Couldn't load prospect data - check connection" - appears when a Synapse call fails mid-task. Dismissible with an optional "Retry" action button.
- **Info (neutral):** "Your trial expires in 3 days / Upgrade" style - used for system-level notices that aren't tied to a specific agent action (seeds balance low, app update available).

### 16.3 Thread-Switch Warning

When the user tries to switch threads or close the app panel while the system is mid-task, a **warning toast** appears: "Kit is still working on the fintech sequence - leave anyway?" with "Stay" (primary) and "Leave" (secondary) actions. Same floating pill, amber warning treatment.

### 16.4 Bulk Selection in App Panel

When the user selects multiple entities in the app panel (prospects in Harvest, articles in Dark Madder), a **floating action bar** appears at the top of the panel - identical to the bulk action reference. Left side: selection count + "Select all N" link. Right side: contextual actions (Change Status, Export, Duplicate, Delete). The system can also trigger this bar when it selects multiple entities during orchestration ("I've identified 47 prospects - review the selection").

### 16.5 Visual Principles

All floating elements in the collaborative workspace follow these rules:

- **Pill-shaped with generous border-radius.** Never sharp rectangles. The roundedness signals transience - these elements come and go.
- **Subtle shadow, no hard borders.** The floating bar sits above content via elevation (shadow), not via outline strokes.
- **Icon + label + action.** Every bar follows the same anatomy: a status icon on the left, descriptive text in the center, and an action affordance on the right (button, dismiss X, or overflow menu).
- **Consistent dismiss pattern.** X on the left for persistent bars (task drawer, bulk actions). X on the right for transient toasts (notifications, warnings). This matches the reference exactly.
- **Red text for destructive actions.** Kill Task, Delete, and Reject use red text without a red background - same as the reference's Delete treatment. Never a red filled button for destructive actions in floating bars.
- **Dark filled button for primary CTAs.** Upgrade, Approve, and other primary actions use a dark filled button (black or near-black) - same as the reference's Upgrade treatment.

### 16.6 Color Mapping

| Element | Icon Color | Text | Action |
|---------|-----------|------|--------|
| Agent success | Green (#00CEC9 teal from brand) | Default | Undo (outline button) |
| Agent warning / uncertainty | Amber | Default | Dismiss X |
| Agent error / task failure | Red | Default | Retry (outline) or Dismiss X |
| System info | Neutral gray | Default | CTA (dark filled) or Dismiss X |
| Kill task | - | Red text | Red text, no fill |
| Approve | - | Default | Dark filled button |

---

## 17. Resolved Decisions

1. **Panel is thread-scoped.** The app panel resets when the user switches threads. A single thread can include the system switching between multiple apps during an orchestrated task - the panel transitions between apps within that thread's context. No cross-thread panel persistence.

2. **Task drawer with kill switch.** When the system is working in the panel, a collapsible drawer shows the current active task (what the system is doing, which app, which entity). The user can kill the task at any time from this drawer. Killing a task triggers a feedback prompt: "What went wrong?" The user's response is a high-weight learning signal - stronger than a rejection, because the user witnessed the mistake happening in real time. The system acknowledges the feedback, reverts its changes via the undo stack, and logs the incident in the Learning Ledger with full context. This is a trust contraction event per the Approval System spec.

3. **Desktop only.** No mobile experience for the collaborative workspace. Kinetiks is desktop-app-first. Mobile may come later but is not in scope for this spec.

4. **First-party apps only.** The app panel only embeds Kinetiks suite apps (Harvest, Dark Madder, Hypothesis, Litmus, Adventure, the ads app). External tool integrations (Google Workspace, Slack, calendar) from Phase 6 are data connections, not embedded surfaces. The panel shows the work the system is doing in Kinetiks tools, not third-party UIs.

5. **Single-player.** Kinetiks is built for solo founders and builders launching products with Claude Code. Multiplayer presence is not a priority. The Realtime architecture could support it later, but no UX work or implementation effort should be spent on multi-user collaboration.
