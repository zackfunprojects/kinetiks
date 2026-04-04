# Marcus Conversation Quality Overhaul - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix six critical failures in Marcus's conversation engine so responses are evidence-grounded, concise, honest about data gaps, and match the stoic voice spec instead of behaving like a generic chatbot wrapper.

**Architecture:** This plan modifies Marcus's conversation pipeline across four layers: (1) context assembly injects a structured data availability manifest into every response generation call, (2) the system prompt is rewritten with hard constraints on verbosity, evidence citation, and anti-sycophancy rules, (3) a post-generation validation step enforces evidence requirements before responses reach the user, and (4) connection status awareness is built into the context assembly so Marcus never makes promises about disconnected systems.

**Tech Stack:** TypeScript, Claude Sonnet API (response generation), Claude Haiku API (validation + extraction), Supabase (connection status queries), Next.js API routes

**Root problem:** Marcus's system prompt lacks enforcement mechanisms. The voice principles exist as guidelines but nothing in the pipeline verifies compliance. This plan adds both prompt-level constraints AND pipeline-level validation.

---

## File Structure

```
apps/id/src/lib/marcus/
  engine.ts                    # MODIFY - Add post-generation validation step
  context-assembly.ts          # MODIFY - Add data availability manifest + connection status
  prompts/
    marcus-system.ts           # MODIFY - Rewrite system prompt with hard constraints
    marcus-evidence-rules.ts   # CREATE - Evidence citation rules injected per response
    marcus-validation.ts       # CREATE - Post-generation validation prompt (Haiku)
  validators/
    response-validator.ts      # CREATE - Validates responses before delivery
    evidence-checker.ts        # CREATE - Checks claims against available data
    verbosity-checker.ts       # CREATE - Enforces length constraints per intent type
  types.ts                     # MODIFY - Add DataAvailabilityManifest, ConnectionStatus types

apps/id/src/lib/marcus/__tests__/
  response-validator.test.ts   # CREATE
  evidence-checker.test.ts     # CREATE
  verbosity-checker.test.ts    # CREATE
  context-assembly.test.ts     # MODIFY - Add manifest generation tests
```

---

## Task 1: Define Data Availability Types

The foundation. Every Marcus response needs to know what data it has, what it doesn't have, and what systems are connected vs disconnected. Without these types, everything else is guesswork.

**Files:**
- Modify: `apps/id/src/lib/marcus/types.ts`
- Test: `apps/id/src/lib/marcus/__tests__/types.test.ts`

- [ ] **Step 1: Write the type definitions**

Add these types to the existing `types.ts` file. Find the existing type block and append after it:

```typescript
// --- Data Availability Manifest ---
// Injected into every Marcus response generation call.
// Marcus MUST reference this manifest when making claims.

export interface DataAvailabilityManifest {
  // What Cortex layers have data vs are empty/sparse
  cortex_coverage: CortexCoverage;
  // Which app Synapses are connected and reporting data
  connections: ConnectionStatus[];
  // What metrics/data points are actually available right now
  available_data: AvailableDataPoint[];
  // What data Marcus does NOT have that would help
  known_gaps: DataGap[];
  // Timestamp of last data sync per source
  data_freshness: DataFreshness[];
}

export interface CortexCoverage {
  overall_confidence: number; // 0-100
  layers: CortexLayerCoverage[];
}

export interface CortexLayerCoverage {
  layer_name: string; // 'voice' | 'customers' | 'products' | 'narrative' | 'competitive' | 'market' | 'brand' | 'content'
  confidence: number; // 0-100
  has_data: boolean;
  field_count: number; // How many fields are populated
  total_fields: number; // How many fields exist
  last_updated: string | null; // ISO timestamp
  source: 'user_explicit' | 'ai_generated' | 'mixed' | 'empty';
}

export interface ConnectionStatus {
  app_name: string; // 'harvest' | 'dark_madder' | 'hypothesis' | 'litmus'
  connected: boolean;
  synapse_healthy: boolean; // Is the Synapse responding?
  last_sync: string | null; // ISO timestamp of last successful data exchange
  capabilities_available: string[]; // What this connection CAN do when healthy
  capabilities_broken: string[]; // What's currently non-functional
}

export interface AvailableDataPoint {
  category: string; // 'outbound_metrics' | 'content_metrics' | 'pipeline' | 'revenue' | etc.
  source_app: string;
  data_type: 'metric' | 'count' | 'list' | 'status';
  description: string; // Human-readable: "Reply rates for active sequences"
  freshness: 'live' | 'recent' | 'stale' | 'unavailable'; // live = <1hr, recent = <24hr, stale = >24hr
  value_summary?: string; // Optional quick summary: "14% avg reply rate across 3 sequences"
}

export interface DataGap {
  category: string;
  what_is_missing: string; // "Close rate history - no historical close data available"
  why_it_matters: string; // "Cannot validate conversion rate assumptions without this"
  how_to_fill: string; // "Connect CRM or manually log deal outcomes in Harvest"
}

export interface DataFreshness {
  source: string;
  last_sync: string | null;
  sync_status: 'healthy' | 'stale' | 'disconnected' | 'never_synced';
}
```

- [ ] **Step 2: Write a type guard for the manifest**

Still in `types.ts`, add:

```typescript
export function isManifestComplete(manifest: DataAvailabilityManifest): boolean {
  return (
    manifest.cortex_coverage.layers.length > 0 &&
    manifest.connections.length >= 0 && // 0 is valid - no apps connected
    Array.isArray(manifest.available_data) &&
    Array.isArray(manifest.known_gaps)
  );
}
```

- [ ] **Step 3: Write a basic validation test**

Create `apps/id/src/lib/marcus/__tests__/types.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { isManifestComplete, type DataAvailabilityManifest } from '../types';

describe('DataAvailabilityManifest', () => {
  it('validates a complete manifest', () => {
    const manifest: DataAvailabilityManifest = {
      cortex_coverage: {
        overall_confidence: 67,
        layers: [
          {
            layer_name: 'voice',
            confidence: 82,
            has_data: true,
            field_count: 8,
            total_fields: 12,
            last_updated: '2026-04-01T10:00:00Z',
            source: 'mixed',
          },
        ],
      },
      connections: [
        {
          app_name: 'harvest',
          connected: false,
          synapse_healthy: false,
          last_sync: null,
          capabilities_available: ['create_sequence', 'query_pipeline'],
          capabilities_broken: ['create_sequence', 'query_pipeline'],
        },
      ],
      available_data: [],
      known_gaps: [
        {
          category: 'outbound_metrics',
          what_is_missing: 'No outbound performance data available',
          why_it_matters: 'Cannot make data-grounded outreach recommendations',
          how_to_fill: 'Connect Harvest to enable pipeline visibility',
        },
      ],
      data_freshness: [],
    };

    expect(isManifestComplete(manifest)).toBe(true);
  });

  it('rejects manifest with no cortex layers', () => {
    const manifest: DataAvailabilityManifest = {
      cortex_coverage: { overall_confidence: 0, layers: [] },
      connections: [],
      available_data: [],
      known_gaps: [],
      data_freshness: [],
    };

    expect(isManifestComplete(manifest)).toBe(false);
  });
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/id && pnpm vitest run src/lib/marcus/__tests__/types.test.ts`
Expected: 2 tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/id/src/lib/marcus/types.ts apps/id/src/lib/marcus/__tests__/types.test.ts
git commit -m "feat(marcus): add DataAvailabilityManifest types for evidence-grounded responses"
```

---

## Task 2: Build the Data Availability Manifest Generator

This is the core of the fix. Before every response generation, Marcus assembles a manifest of what data it actually has. This manifest gets injected into the system prompt so Marcus can cite real data or explicitly flag gaps.

**Files:**
- Modify: `apps/id/src/lib/marcus/context-assembly.ts`
- Test: `apps/id/src/lib/marcus/__tests__/context-assembly.test.ts`

**Context:** The existing `context-assembly.ts` loads token-budgeted context per intent type. We're adding a new function that builds the DataAvailabilityManifest by querying Cortex layers, checking Synapse connection status, and identifying gaps. This manifest is added to the context payload alongside existing context.

- [ ] **Step 1: Write the failing test for manifest generation**

Add to `apps/id/src/lib/marcus/__tests__/context-assembly.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { buildDataAvailabilityManifest } from '../context-assembly';
import type { DataAvailabilityManifest } from '../types';

// Mock Supabase client
const mockSupabase = {
  from: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  single: vi.fn(),
  order: vi.fn().mockReturnThis(),
};

describe('buildDataAvailabilityManifest', () => {
  it('returns manifest with disconnected app when no Synapse exists', async () => {
    // Mock: Cortex has voice layer data, no Synapses registered
    mockSupabase.single.mockResolvedValueOnce({
      data: {
        account_id: 'test-account',
        overall_confidence: 67,
      },
      error: null,
    });

    // Mock: Context layers query
    mockSupabase.single.mockResolvedValueOnce({
      data: { confidence: 82, updated_at: '2026-04-01T10:00:00Z' },
      error: null,
    });

    // Mock: Synapses query - empty
    mockSupabase.select.mockResolvedValueOnce({
      data: [],
      error: null,
    });

    const manifest = await buildDataAvailabilityManifest('test-account', mockSupabase as any);

    expect(manifest.cortex_coverage.overall_confidence).toBe(67);
    expect(manifest.connections.every((c) => !c.connected || !c.synapse_healthy)).toBe(true);
    expect(manifest.known_gaps.length).toBeGreaterThan(0);
  });

  it('identifies data gaps when Cortex layers are empty', async () => {
    mockSupabase.single.mockResolvedValueOnce({
      data: { account_id: 'test-account', overall_confidence: 12 },
      error: null,
    });

    // All layers return null/empty
    mockSupabase.single.mockResolvedValue({ data: null, error: null });
    mockSupabase.select.mockResolvedValueOnce({ data: [], error: null });

    const manifest = await buildDataAvailabilityManifest('test-account', mockSupabase as any);

    expect(manifest.cortex_coverage.overall_confidence).toBe(12);
    expect(manifest.known_gaps.length).toBeGreaterThan(0);
    // Should flag that most Cortex layers are empty
    const cortexGaps = manifest.known_gaps.filter((g) => g.category.startsWith('cortex_'));
    expect(cortexGaps.length).toBeGreaterThan(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/id && pnpm vitest run src/lib/marcus/__tests__/context-assembly.test.ts`
Expected: FAIL with "buildDataAvailabilityManifest is not a function" or "not exported"

- [ ] **Step 3: Implement buildDataAvailabilityManifest**

Add to `apps/id/src/lib/marcus/context-assembly.ts`:

```typescript
import type {
  DataAvailabilityManifest,
  CortexLayerCoverage,
  ConnectionStatus,
  DataGap,
  AvailableDataPoint,
  DataFreshness,
} from './types';

const CORTEX_LAYERS = [
  'voice', 'customers', 'products', 'narrative',
  'competitive', 'market', 'brand', 'content',
] as const;

const CORTEX_LAYER_TABLES: Record<string, string> = {
  voice: 'kinetiks_voice',
  customers: 'kinetiks_customers',
  products: 'kinetiks_products',
  narrative: 'kinetiks_narrative',
  competitive: 'kinetiks_competitive',
  market: 'kinetiks_market',
  brand: 'kinetiks_brand',
  content: 'kinetiks_content',
};

// Field counts per layer (total possible fields)
const LAYER_FIELD_COUNTS: Record<string, number> = {
  voice: 12, customers: 15, products: 10, narrative: 8,
  competitive: 12, market: 10, brand: 14, content: 8,
};

export async function buildDataAvailabilityManifest(
  accountId: string,
  supabase: any
): Promise<DataAvailabilityManifest> {
  // 1. Get overall Cortex confidence
  const { data: cortexData } = await supabase
    .from('kinetiks_context_confidence')
    .select('overall_confidence')
    .eq('account_id', accountId)
    .single();

  const overallConfidence = cortexData?.overall_confidence ?? 0;

  // 2. Check each Cortex layer
  const layerCoverages: CortexLayerCoverage[] = await Promise.all(
    CORTEX_LAYERS.map(async (layerName) => {
      const tableName = CORTEX_LAYER_TABLES[layerName];
      const { data: layerData } = await supabase
        .from(tableName)
        .select('*')
        .eq('account_id', accountId)
        .single();

      if (!layerData) {
        return {
          layer_name: layerName,
          confidence: 0,
          has_data: false,
          field_count: 0,
          total_fields: LAYER_FIELD_COUNTS[layerName] ?? 10,
          last_updated: null,
          source: 'empty' as const,
        };
      }

      // Count non-null, non-empty fields (exclude metadata fields)
      const metadataFields = ['id', 'account_id', 'created_at', 'updated_at'];
      const dataFields = Object.entries(layerData).filter(
        ([key, val]) =>
          !metadataFields.includes(key) &&
          val !== null &&
          val !== '' &&
          !(Array.isArray(val) && val.length === 0)
      );

      const totalFields = LAYER_FIELD_COUNTS[layerName] ?? 10;

      return {
        layer_name: layerName,
        confidence: layerData.confidence ?? Math.round((dataFields.length / totalFields) * 100),
        has_data: dataFields.length > 0,
        field_count: dataFields.length,
        total_fields: totalFields,
        last_updated: layerData.updated_at ?? null,
        source: layerData.source ?? 'mixed' as const,
      };
    })
  );

  // 3. Check Synapse connections
  const { data: synapses } = await supabase
    .from('kinetiks_synapses')
    .select('*')
    .eq('account_id', accountId);

  const knownApps = ['harvest', 'dark_madder', 'hypothesis', 'litmus'];
  const connectedAppNames = (synapses ?? []).map((s: any) => s.app_name);

  const connections: ConnectionStatus[] = knownApps.map((appName) => {
    const synapse = (synapses ?? []).find((s: any) => s.app_name === appName);
    if (!synapse) {
      return {
        app_name: appName,
        connected: false,
        synapse_healthy: false,
        last_sync: null,
        capabilities_available: getAppCapabilities(appName),
        capabilities_broken: getAppCapabilities(appName),
      };
    }
    const isHealthy = synapse.status === 'healthy' || synapse.status === 'active';
    return {
      app_name: appName,
      connected: true,
      synapse_healthy: isHealthy,
      last_sync: synapse.last_sync_at ?? null,
      capabilities_available: synapse.capabilities ?? getAppCapabilities(appName),
      capabilities_broken: isHealthy ? [] : (synapse.capabilities ?? getAppCapabilities(appName)),
    };
  });

  // 4. Build available data points from connected + healthy apps
  const availableData: AvailableDataPoint[] = [];
  for (const conn of connections) {
    if (conn.connected && conn.synapse_healthy) {
      availableData.push(...getAvailableDataForApp(conn.app_name, conn.last_sync));
    }
  }

  // Add Cortex-derived data points
  for (const layer of layerCoverages) {
    if (layer.has_data) {
      availableData.push({
        category: `cortex_${layer.layer_name}`,
        source_app: 'kinetiks',
        data_type: 'status',
        description: `${layer.layer_name} layer: ${layer.field_count}/${layer.total_fields} fields populated (${layer.confidence}% confidence)`,
        freshness: getFreshness(layer.last_updated),
      });
    }
  }

  // 5. Identify gaps
  const knownGaps: DataGap[] = [];

  // Cortex gaps
  for (const layer of layerCoverages) {
    if (!layer.has_data || layer.confidence < 40) {
      knownGaps.push({
        category: `cortex_${layer.layer_name}`,
        what_is_missing: `${layer.layer_name} layer is ${layer.has_data ? 'sparse' : 'empty'} (${layer.field_count}/${layer.total_fields} fields, ${layer.confidence}% confidence)`,
        why_it_matters: getLayerImportance(layer.layer_name),
        how_to_fill: `Complete the ${layer.layer_name} section in Cortex, or provide this information in conversation`,
      });
    }
  }

  // App connection gaps
  for (const conn of connections) {
    if (!conn.connected) {
      knownGaps.push({
        category: `app_${conn.app_name}`,
        what_is_missing: `${conn.app_name} is not connected - no ${getAppDataDescription(conn.app_name)} available`,
        why_it_matters: `Cannot provide data-grounded advice about ${getAppDomain(conn.app_name)} without this connection`,
        how_to_fill: `Activate ${conn.app_name} in the Integrations view`,
      });
    } else if (!conn.synapse_healthy) {
      knownGaps.push({
        category: `app_${conn.app_name}`,
        what_is_missing: `${conn.app_name} Synapse is unhealthy - data may be stale or unavailable`,
        why_it_matters: `Recommendations about ${getAppDomain(conn.app_name)} may not reflect current state`,
        how_to_fill: `Check ${conn.app_name} connection in Integrations`,
      });
    }
  }

  // 6. Data freshness
  const freshness: DataFreshness[] = [
    {
      source: 'cortex',
      last_sync: layerCoverages.reduce((latest, l) => {
        if (!l.last_updated) return latest;
        if (!latest) return l.last_updated;
        return l.last_updated > latest ? l.last_updated : latest;
      }, null as string | null),
      sync_status: overallConfidence > 0 ? 'healthy' : 'never_synced',
    },
    ...connections.map((c) => ({
      source: c.app_name,
      last_sync: c.last_sync,
      sync_status: !c.connected
        ? ('disconnected' as const)
        : !c.synapse_healthy
          ? ('stale' as const)
          : c.last_sync
            ? ('healthy' as const)
            : ('never_synced' as const),
    })),
  ];

  return {
    cortex_coverage: { overall_confidence: overallConfidence, layers: layerCoverages },
    connections,
    available_data: availableData,
    known_gaps: knownGaps,
    data_freshness: freshness,
  };
}

// --- Helper functions ---

function getAppCapabilities(appName: string): string[] {
  const caps: Record<string, string[]> = {
    harvest: ['create_sequence', 'query_pipeline', 'manage_prospects', 'send_outreach', 'track_replies'],
    dark_madder: ['draft_content', 'query_performance', 'manage_editorial', 'publish_content'],
    hypothesis: ['create_landing_page', 'run_ab_test', 'query_conversions'],
    litmus: ['pitch_journalists', 'track_mentions', 'manage_media_list'],
  };
  return caps[appName] ?? [];
}

function getAvailableDataForApp(appName: string, lastSync: string | null): AvailableDataPoint[] {
  const freshness = getFreshness(lastSync);
  const appData: Record<string, AvailableDataPoint[]> = {
    harvest: [
      { category: 'outbound_metrics', source_app: 'harvest', data_type: 'metric', description: 'Reply rates, open rates, sequence performance', freshness },
      { category: 'pipeline', source_app: 'harvest', data_type: 'status', description: 'Active prospects, pipeline stages, deal status', freshness },
    ],
    dark_madder: [
      { category: 'content_metrics', source_app: 'dark_madder', data_type: 'metric', description: 'Traffic, engagement, topic performance', freshness },
      { category: 'editorial', source_app: 'dark_madder', data_type: 'status', description: 'Draft queue, publishing schedule, content backlog', freshness },
    ],
    hypothesis: [
      { category: 'conversion_metrics', source_app: 'hypothesis', data_type: 'metric', description: 'Landing page conversions, A/B test results', freshness },
    ],
    litmus: [
      { category: 'pr_metrics', source_app: 'litmus', data_type: 'metric', description: 'Media mentions, pitch success rates, journalist engagement', freshness },
    ],
  };
  return appData[appName] ?? [];
}

function getFreshness(timestamp: string | null): 'live' | 'recent' | 'stale' | 'unavailable' {
  if (!timestamp) return 'unavailable';
  const age = Date.now() - new Date(timestamp).getTime();
  const oneHour = 60 * 60 * 1000;
  const oneDay = 24 * oneHour;
  if (age < oneHour) return 'live';
  if (age < oneDay) return 'recent';
  return 'stale';
}

function getLayerImportance(layerName: string): string {
  const importance: Record<string, string> = {
    voice: 'Without voice data, generated content and messaging lacks brand consistency',
    customers: 'Without customer data, targeting recommendations are generic guesses',
    products: 'Without product data, value propositions and positioning are vague',
    narrative: 'Without narrative data, strategic direction is ungrounded',
    competitive: 'Without competitive data, differentiation claims are unsupported',
    market: 'Without market data, market sizing and opportunity assessment is speculation',
    brand: 'Without brand data, visual and tonal consistency cannot be enforced',
    content: 'Without content data, editorial strategy has no performance baseline',
  };
  return importance[layerName] ?? 'Missing data reduces recommendation quality';
}

function getAppDataDescription(appName: string): string {
  const descriptions: Record<string, string> = {
    harvest: 'outbound metrics, pipeline data, or prospect intelligence',
    dark_madder: 'content performance, editorial calendar, or topic analytics',
    hypothesis: 'landing page conversions or A/B test results',
    litmus: 'media mentions, pitch performance, or journalist engagement data',
  };
  return descriptions[appName] ?? 'app-specific data';
}

function getAppDomain(appName: string): string {
  const domains: Record<string, string> = {
    harvest: 'outbound and pipeline',
    dark_madder: 'content strategy',
    hypothesis: 'conversion optimization',
    litmus: 'PR and media relations',
  };
  return domains[appName] ?? appName;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/id && pnpm vitest run src/lib/marcus/__tests__/context-assembly.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/id/src/lib/marcus/context-assembly.ts apps/id/src/lib/marcus/__tests__/context-assembly.test.ts
git commit -m "feat(marcus): build data availability manifest generator for evidence-grounded responses"
```

---

## Task 3: Rewrite Marcus System Prompt with Hard Constraints

The current system prompt has voice guidelines but no enforcement. This task rewrites the prompt to include: (a) the data availability manifest as structured context, (b) hard rules about evidence citation, (c) length constraints per intent type, (d) anti-sycophancy rules, (e) anti-restatement rules, and (f) connection awareness rules.

**Files:**
- Create: `apps/id/src/lib/marcus/prompts/marcus-system.ts`
- Create: `apps/id/src/lib/marcus/prompts/marcus-evidence-rules.ts`

- [ ] **Step 1: Create the evidence rules module**

Create `apps/id/src/lib/marcus/prompts/marcus-evidence-rules.ts`:

```typescript
/**
 * Evidence citation rules injected into every Marcus response generation call.
 * These are HARD CONSTRAINTS, not guidelines. The validation step (Task 5)
 * checks responses against these rules and rewrites violations.
 */
export const EVIDENCE_RULES = `
## Evidence Rules (HARD CONSTRAINTS - VIOLATIONS CAUSE RESPONSE REJECTION)

Every recommendation or claim you make MUST fall into exactly one of these categories:

### Category 1: Data-Backed Claim
You have specific data from the Data Availability Manifest to support this claim.
FORMAT: State the claim, then cite the data point inline.
EXAMPLE: "Your reply rate is 14% across 3 active sequences - above the 8-12% benchmark for cold outbound."
REQUIREMENT: The data point must exist in the manifest. Do not invent metrics.

### Category 2: Cortex-Derived Insight
You're drawing from the user's Context Structure (voice, customers, products, competitive, etc.).
FORMAT: Reference the specific Cortex layer and what it tells you.
EXAMPLE: "Your competitive layer shows you position against agencies and fractional CMOs - the independence angle aligns with this."
REQUIREMENT: The Cortex layer must have data (has_data: true in the manifest).

### Category 3: Flagged Speculation
You don't have data but the recommendation has strategic value.
FORMAT: Explicitly flag that this is informed speculation, not data-grounded.
EXAMPLE: "I don't have close rate data yet, so I can't validate the 33% assumption. If you've closed at that rate before, the math works. If not, track the first 10 calls before building around it."
REQUIREMENT: MUST include what data you'd need to validate and how to get it.

### Category 4: General Knowledge
Industry benchmarks, frameworks, or patterns that don't require user-specific data.
FORMAT: Frame as industry context, not user-specific advice.
EXAMPLE: "Seed-stage companies typically make buying decisions in 1-2 weeks, faster than Series A."
REQUIREMENT: Do not present general knowledge as if it's specific to this user's situation.

### ABSOLUTE PROHIBITION
NEVER make a claim that sounds data-backed but isn't. "Your positioning is sharp" with no supporting data is a violation. "Your competitive confidence is 97%, which means the positioning layer is well-developed" is acceptable.
`;

export const CONNECTION_AWARENESS_RULES = `
## Connection Awareness (HARD CONSTRAINTS)

Before referencing ANY app capability, check the connections in your manifest.

### Connected + Healthy
You can reference this app's data and capabilities normally.

### Connected + Unhealthy
Flag it: "Harvest is connected but the Synapse isn't responding normally - this data may be stale."

### Disconnected
NEVER promise actions through a disconnected app. NEVER say "I'll queue this to Harvest" if Harvest is disconnected.
Instead: "Harvest isn't connected yet, so I can't see your pipeline or build sequences. Once you connect it, I can do X, Y, Z."
FLAG DISCONNECTIONS IMMEDIATELY - in the first response of any conversation where you'd normally reference the disconnected app. Do not wait until the user asks about it.

### The Promise Rule
If you cannot verify that a system will execute an action, do not promise the action. "I've queued briefs to systematize your delivery process" is a LIE if the destination system is disconnected. Instead: "Here's what I recommend you systematize - I can help build the templates now, and once Harvest is connected I can automate the delivery."
`;

export const ANTI_SYCOPHANCY_RULES = `
## Anti-Sycophancy Rules (HARD CONSTRAINTS)

### NEVER USE:
- Exclamation marks (except acknowledging genuine, verified wins with data)
- "Launch immediately" / "Start now" / any urgency language without data justification
- "Your biggest advantage is..." without citing specific evidence
- "The market wants what you're selling" - you don't know this without data
- "Your positioning is sharp/strong/compelling" without citing confidence scores or specific Cortex data
- "Your close rate assumption is conservative" - you have no basis for this claim without historical data
- Complimenting the user's strategy, decisions, or business unless you can cite specific performance data

### ALWAYS DO:
- State the situation plainly. "You need 9 qualified prospects weekly for 3 calls at current pipeline" not "Three calls weekly fills your cohort fast - achievable with focused outbound!"
- If you don't have data to evaluate a claim, say so. "I can't assess whether 33% is achievable because I don't have your close rate history" is correct.
- Separate what you know from what you're assuming. Clear boundary.
- Be direct about risks, not just opportunities. "Cold outbound to seed founders has high volume but low response rates - expect 2-5% reply rates, not the 10-15% you'd see with warm intros."
`;

export const ANTI_RESTATEMENT_RULES = `
## Anti-Restatement Rules (HARD CONSTRAINTS)

### NEVER DO:
- Repeat back what the user just told you as if it's insight. If they say "this is for seed stage," do NOT spend a paragraph explaining what seed stage means.
- Explain the user's own business model back to them. They know their business. You add to their knowledge, not mirror it.
- Restate their pricing, their target market, or their sales process unless you're adding new information or challenging an assumption.

### INSTEAD:
- Immediately jump to what CHANGES based on what they said.
- "Seed stage shifts the outreach math: higher volume, faster decisions, lower deal value. Your prospect list target should be 200+, not 50. Qualification criteria change - filter for funded in last 6 months with no marketing hire yet."
- The ratio should be: 0% restatement, 100% new information or adjusted recommendations.
`;
```

- [ ] **Step 2: Create the system prompt builder**

Create `apps/id/src/lib/marcus/prompts/marcus-system.ts`:

```typescript
import type { DataAvailabilityManifest } from '../types';
import {
  EVIDENCE_RULES,
  CONNECTION_AWARENESS_RULES,
  ANTI_SYCOPHANCY_RULES,
  ANTI_RESTATEMENT_RULES,
} from './marcus-evidence-rules';

/**
 * Maximum response lengths by intent type.
 * Measured in approximate sentence count.
 * The verbosity checker (Task 5) enforces these post-generation.
 */
export const MAX_RESPONSE_SENTENCES: Record<string, number> = {
  strategic: 8,    // Strategic advice: tight, opinionated, max 8 sentences
  tactical: 6,     // Tactical/operational: direct answer, max 6 sentences
  support: 10,     // Product help: can be longer for explanations
  data: 4,         // Data queries: number + context, max 4 sentences
  command: 5,      // Command confirmation: what you'll do + confirm, max 5 sentences
  implicit_intel: 3, // Intel acknowledgment: brief, max 3 sentences
};

export function buildMarcusSystemPrompt(
  systemName: string,
  manifest: DataAvailabilityManifest,
  activeGoals: any[],
  productStack: any,
): string {
  return `You are ${systemName}, a GTM operating system built on the Marcus intelligence engine. You are the user's strategic advisor, not their chatbot. You are modeled after Marcus Aurelius - stoic, grounded, direct.

## Voice (NON-NEGOTIABLE)

- State the situation plainly. No spin. No softening. No performative optimism.
- Lead with the conclusion. Expand ONLY if asked.
- Bias toward fewer words. Brevity is respect for the user's time.
- Patient, never pushy. Suggest, don't demand. "Consider X" not "You need to X immediately."
- Direct, not cold. Acknowledge difficulty. Celebrate verified wins.
- No em dashes. Regular dashes only.
- No filler phrases. No "Great question." No "Absolutely." No "I'd love to help."
- No exclamation marks unless citing a verified, data-backed win.

## Response Length Constraints

Your responses MUST be concise. Target lengths by conversation type:
- Strategic advice: 5-8 sentences maximum. Lead with the recommendation.
- Tactical/operational: 3-6 sentences. Direct answer, then supporting detail only if needed.
- Data queries: 2-4 sentences. The number, the context, done.
- Command confirmation: 3-5 sentences. What you'll do, ask to confirm.
- Acknowledging intel: 1-3 sentences. What you extracted, where it went.

If the user wants more detail, they will ask. Do NOT pre-emptively expand.

${EVIDENCE_RULES}

${CONNECTION_AWARENESS_RULES}

${ANTI_SYCOPHANCY_RULES}

${ANTI_RESTATEMENT_RULES}

## Your Data (RIGHT NOW)

### Cortex Coverage
Overall confidence: ${manifest.cortex_coverage.overall_confidence}%

${manifest.cortex_coverage.layers.map((l) =>
  `- ${l.layer_name}: ${l.has_data ? `${l.confidence}% (${l.field_count}/${l.total_fields} fields)` : 'EMPTY - no data'}`
).join('\n')}

### Connected Systems
${manifest.connections.map((c) =>
  `- ${c.app_name}: ${
    !c.connected
      ? 'NOT CONNECTED - do not promise actions through this app'
      : c.synapse_healthy
        ? `Connected, healthy (last sync: ${c.last_sync ?? 'unknown'})`
        : `Connected, UNHEALTHY - data may be stale`
  }`
).join('\n')}

### Available Data Points
${manifest.available_data.length > 0
  ? manifest.available_data.map((d) => `- [${d.freshness}] ${d.description} (from ${d.source_app})`).join('\n')
  : 'No live data available from any connected app.'
}

### Known Data Gaps (things you CANNOT speak to with confidence)
${manifest.known_gaps.map((g) => `- ${g.what_is_missing}: ${g.why_it_matters}`).join('\n')}

${activeGoals.length > 0 ? `
### Active Goals
${activeGoals.map((g: any) => `- ${g.name}: ${g.status ?? 'no status'} (${g.progress ?? 0}% progress)`).join('\n')}
` : ''}

${productStack ? `
### Product Stack
${JSON.stringify(productStack, null, 2)}
` : ''}

## The Test

Before every response, ask yourself:
1. Did I cite specific data for every recommendation, or flag where I'm speculating?
2. Is my response under the sentence limit for this intent type?
3. Did I avoid restating what the user just told me?
4. Did I avoid complimenting the user without evidence?
5. Did I flag any system disconnections that are relevant to this conversation?
6. Would Marcus Aurelius say this, or would a generic chatbot?

If any answer is no, rewrite before responding.`;
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/id/src/lib/marcus/prompts/marcus-system.ts apps/id/src/lib/marcus/prompts/marcus-evidence-rules.ts
git commit -m "feat(marcus): rewrite system prompt with hard evidence, brevity, and anti-sycophancy constraints"
```

---

## Task 4: Build the Response Validator

A post-generation validation step that catches violations before responses reach the user. Uses Haiku for speed. Checks: evidence grounding, verbosity, sycophancy patterns, restatement, and disconnected-system promises.

**Files:**
- Create: `apps/id/src/lib/marcus/validators/response-validator.ts`
- Create: `apps/id/src/lib/marcus/validators/evidence-checker.ts`
- Create: `apps/id/src/lib/marcus/validators/verbosity-checker.ts`
- Create: `apps/id/src/lib/marcus/prompts/marcus-validation.ts`
- Test: `apps/id/src/lib/marcus/__tests__/response-validator.test.ts`
- Test: `apps/id/src/lib/marcus/__tests__/evidence-checker.test.ts`
- Test: `apps/id/src/lib/marcus/__tests__/verbosity-checker.test.ts`

- [ ] **Step 1: Write the verbosity checker**

Create `apps/id/src/lib/marcus/validators/verbosity-checker.ts`:

```typescript
import { MAX_RESPONSE_SENTENCES } from '../prompts/marcus-system';

export interface VerbosityResult {
  passed: boolean;
  sentence_count: number;
  max_allowed: number;
  intent_type: string;
  excess_sentences: number;
}

/**
 * Counts approximate sentences in a response.
 * Splits on sentence-ending punctuation followed by space or newline.
 * Not perfect, but good enough for enforcement.
 */
export function countSentences(text: string): number {
  // Remove code blocks (they shouldn't count toward sentence limits)
  const withoutCode = text.replace(/```[\s\S]*?```/g, '').replace(/`[^`]+`/g, '');
  // Remove bullet point markers
  const withoutBullets = withoutCode.replace(/^[\s]*[-*]\s/gm, '');
  // Split on sentence endings
  const sentences = withoutBullets
    .split(/[.!?]+[\s\n]+/)
    .filter((s) => s.trim().length > 10); // Filter out fragments
  return sentences.length;
}

export function checkVerbosity(
  response: string,
  intentType: string
): VerbosityResult {
  const maxAllowed = MAX_RESPONSE_SENTENCES[intentType] ?? 8;
  const sentenceCount = countSentences(response);

  return {
    passed: sentenceCount <= maxAllowed,
    sentence_count: sentenceCount,
    max_allowed: maxAllowed,
    intent_type: intentType,
    excess_sentences: Math.max(0, sentenceCount - maxAllowed),
  };
}
```

- [ ] **Step 2: Write verbosity checker tests**

Create `apps/id/src/lib/marcus/__tests__/verbosity-checker.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { countSentences, checkVerbosity } from '../validators/verbosity-checker';

describe('countSentences', () => {
  it('counts simple sentences', () => {
    const text = 'First sentence here. Second sentence here. Third one too.';
    expect(countSentences(text)).toBe(3);
  });

  it('ignores code blocks', () => {
    const text = 'Here is the answer. ```const x = 1. const y = 2. return x + y.``` Done.';
    expect(countSentences(text)).toBe(2);
  });

  it('handles newline-separated sentences', () => {
    const text = 'First sentence here.\nSecond sentence here.\nThird one too.';
    expect(countSentences(text)).toBe(3);
  });
});

describe('checkVerbosity', () => {
  it('passes a concise strategic response', () => {
    const response = 'Your pipeline needs 9 qualified prospects weekly to hit 3 calls. Target seed founders who raised in the last 6 months. Filter for companies with no marketing hire yet. Lead with scarcity - two April spots remaining. Start prospecting now while we build automation.';
    const result = checkVerbosity(response, 'strategic');
    expect(result.passed).toBe(true);
    expect(result.sentence_count).toBeLessThanOrEqual(8);
  });

  it('fails a verbose strategic response', () => {
    // Generate a response with 12+ sentences
    const sentences = Array.from({ length: 12 }, (_, i) =>
      `This is sentence number ${i + 1} with enough words to count as a real sentence.`
    );
    const response = sentences.join(' ');
    const result = checkVerbosity(response, 'strategic');
    expect(result.passed).toBe(false);
    expect(result.excess_sentences).toBeGreaterThan(0);
  });

  it('uses stricter limits for data queries', () => {
    const response = 'Your reply rate is 14%. This is above the 8-12% cold outbound benchmark. Pipeline has 23 active prospects. Five are in late stage.';
    const result = checkVerbosity(response, 'data');
    expect(result.passed).toBe(true);
    expect(result.max_allowed).toBe(4);
  });
});
```

- [ ] **Step 3: Run verbosity tests**

Run: `cd apps/id && pnpm vitest run src/lib/marcus/__tests__/verbosity-checker.test.ts`
Expected: PASS

- [ ] **Step 4: Write the evidence checker**

Create `apps/id/src/lib/marcus/validators/evidence-checker.ts`:

```typescript
import type { DataAvailabilityManifest } from '../types';

export interface EvidenceCheckResult {
  passed: boolean;
  violations: EvidenceViolation[];
  warnings: string[];
}

export interface EvidenceViolation {
  type: 'unsupported_claim' | 'false_promise' | 'sycophancy' | 'restatement';
  description: string;
  severity: 'hard' | 'soft'; // hard = must fix, soft = warning
}

// Sycophancy patterns - phrases that indicate ungrounded praise
const SYCOPHANCY_PATTERNS = [
  /your positioning is (sharp|strong|compelling|excellent|great|solid)/i,
  /the market wants what you('re| are) selling/i,
  /your (biggest|greatest|strongest) advantage/i,
  /launch (immediately|now|right away)(!|\.)/i,
  /your .+ assumption is conservative/i,
  /achievable with focused/i,
  /you('re| are) (already|well) (positioned|ahead|set)/i,
  /your confidence (scores? )?(show|indicate|demonstrate) strong/i,
];

// Promise patterns that require connected systems
const PROMISE_PATTERNS = [
  { pattern: /I('ve|'ll| have| will) queue[d]?\s+.+\s+to\s+(harvest|dark madder|hypothesis|litmus)/i, app: null },
  { pattern: /I('m| am) (updating|building|creating|dispatching).+in\s+(harvest|dark madder|hypothesis|litmus)/i, app: null },
  { pattern: /I('ll| will) (build|create|draft|send|launch).+sequence/i, app: 'harvest' },
  { pattern: /I('ll| will) (build|create|draft|publish).+(post|article|content)/i, app: 'dark_madder' },
  { pattern: /I('ll| will) (build|create|draft).+landing page/i, app: 'hypothesis' },
  { pattern: /I('ll| will) (pitch|contact|reach out to).+journalist/i, app: 'litmus' },
];

export function checkEvidence(
  response: string,
  manifest: DataAvailabilityManifest,
  userMessage: string,
): EvidenceCheckResult {
  const violations: EvidenceViolation[] = [];
  const warnings: string[] = [];

  // 1. Check for sycophancy patterns
  for (const pattern of SYCOPHANCY_PATTERNS) {
    if (pattern.test(response)) {
      violations.push({
        type: 'sycophancy',
        description: `Response contains ungrounded praise: "${response.match(pattern)?.[0]}"`,
        severity: 'hard',
      });
    }
  }

  // 2. Check for promises about disconnected systems
  for (const { pattern, app } of PROMISE_PATTERNS) {
    const match = response.match(pattern);
    if (match) {
      // Extract the app name from the match or use the specified app
      const targetApp = app ?? extractAppName(match[0]);
      if (targetApp) {
        const connection = manifest.connections.find(
          (c) => c.app_name === targetApp.toLowerCase().replace(' ', '_')
        );
        if (connection && (!connection.connected || !connection.synapse_healthy)) {
          violations.push({
            type: 'false_promise',
            description: `Promised action through ${targetApp} but it's ${
              !connection.connected ? 'not connected' : 'unhealthy'
            }: "${match[0]}"`,
            severity: 'hard',
          });
        }
      }
    }
  }

  // 3. Check for restatement (heuristic: response contains long phrases from user message)
  const userWords = userMessage.toLowerCase().split(/\s+/);
  if (userWords.length >= 8) {
    // Check if response contains 8+ consecutive words from user message
    for (let i = 0; i <= userWords.length - 8; i++) {
      const phrase = userWords.slice(i, i + 8).join(' ');
      if (response.toLowerCase().includes(phrase)) {
        violations.push({
          type: 'restatement',
          description: `Response restates user input: "${phrase}..."`,
          severity: 'soft',
        });
        break; // One restatement warning is enough
      }
    }
  }

  return {
    passed: violations.filter((v) => v.severity === 'hard').length === 0,
    violations,
    warnings,
  };
}

function extractAppName(text: string): string | null {
  const lower = text.toLowerCase();
  if (lower.includes('harvest')) return 'harvest';
  if (lower.includes('dark madder')) return 'dark_madder';
  if (lower.includes('hypothesis')) return 'hypothesis';
  if (lower.includes('litmus')) return 'litmus';
  return null;
}
```

- [ ] **Step 5: Write evidence checker tests**

Create `apps/id/src/lib/marcus/__tests__/evidence-checker.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { checkEvidence } from '../validators/evidence-checker';
import type { DataAvailabilityManifest } from '../types';

const disconnectedManifest: DataAvailabilityManifest = {
  cortex_coverage: {
    overall_confidence: 67,
    layers: [
      { layer_name: 'voice', confidence: 82, has_data: true, field_count: 8, total_fields: 12, last_updated: '2026-04-01', source: 'mixed' },
      { layer_name: 'competitive', confidence: 97, has_data: true, field_count: 11, total_fields: 12, last_updated: '2026-04-01', source: 'mixed' },
    ],
  },
  connections: [
    {
      app_name: 'harvest',
      connected: false,
      synapse_healthy: false,
      last_sync: null,
      capabilities_available: ['create_sequence'],
      capabilities_broken: ['create_sequence'],
    },
  ],
  available_data: [],
  known_gaps: [{ category: 'outbound', what_is_missing: 'No outbound data', why_it_matters: 'Cannot assess pipeline', how_to_fill: 'Connect Harvest' }],
  data_freshness: [],
};

describe('checkEvidence', () => {
  it('catches sycophancy patterns', () => {
    const response = 'Your positioning is sharp and the market timing is right.';
    const result = checkEvidence(response, disconnectedManifest, 'how can we start booking calls');
    expect(result.passed).toBe(false);
    expect(result.violations.some((v) => v.type === 'sycophancy')).toBe(true);
  });

  it('catches false promises about disconnected apps', () => {
    const response = "I've queued briefs to Harvest to build the outbound sequences.";
    const result = checkEvidence(response, disconnectedManifest, 'help me book calls');
    expect(result.passed).toBe(false);
    expect(result.violations.some((v) => v.type === 'false_promise')).toBe(true);
  });

  it('passes clean evidence-grounded response', () => {
    const response = 'Your competitive confidence is 97%, which means your differentiation is well-documented. Your voice layer is at 82%. I cannot assess outbound performance because Harvest is not connected - you will need to connect it before I can build sequences or track pipeline.';
    const result = checkEvidence(response, disconnectedManifest, 'help me book calls');
    expect(result.passed).toBe(true);
    expect(result.violations.length).toBe(0);
  });

  it('catches promise to build sequence when Harvest disconnected', () => {
    const response = "I'll build a 3-touch sequence targeting seed founders.";
    const result = checkEvidence(response, disconnectedManifest, 'build me a sequence');
    expect(result.passed).toBe(false);
    expect(result.violations[0].type).toBe('false_promise');
  });
});
```

- [ ] **Step 6: Run evidence checker tests**

Run: `cd apps/id && pnpm vitest run src/lib/marcus/__tests__/evidence-checker.test.ts`
Expected: PASS

- [ ] **Step 7: Write the main response validator**

Create `apps/id/src/lib/marcus/validators/response-validator.ts`:

```typescript
import type { DataAvailabilityManifest } from '../types';
import { checkEvidence, type EvidenceCheckResult } from './evidence-checker';
import { checkVerbosity, type VerbosityResult } from './verbosity-checker';

export interface ValidationResult {
  passed: boolean;
  evidence: EvidenceCheckResult;
  verbosity: VerbosityResult;
  needs_rewrite: boolean;
  rewrite_instructions: string | null;
}

/**
 * Validates a Marcus response before delivery to the user.
 * Returns validation result with rewrite instructions if needed.
 *
 * The engine (Task 6) uses this to decide whether to:
 * 1. Deliver the response as-is (passed = true)
 * 2. Request a rewrite from Sonnet with specific instructions (needs_rewrite = true)
 * 3. Fall back to a safe response if rewrite also fails
 */
export function validateResponse(
  response: string,
  manifest: DataAvailabilityManifest,
  intentType: string,
  userMessage: string,
): ValidationResult {
  const evidence = checkEvidence(response, manifest, userMessage);
  const verbosity = checkVerbosity(response, intentType);

  const hardViolations = evidence.violations.filter((v) => v.severity === 'hard');
  const passed = evidence.passed && verbosity.passed;
  const needsRewrite = hardViolations.length > 0 || verbosity.excess_sentences > 3;

  let rewriteInstructions: string | null = null;

  if (needsRewrite) {
    const instructions: string[] = [];

    if (hardViolations.length > 0) {
      instructions.push('FIX THESE VIOLATIONS:');
      for (const v of hardViolations) {
        switch (v.type) {
          case 'sycophancy':
            instructions.push(`- REMOVE ungrounded praise: ${v.description}. Replace with a specific data citation or remove entirely.`);
            break;
          case 'false_promise':
            instructions.push(`- REMOVE false promise: ${v.description}. Replace with honest statement about what you can and cannot do given current connections.`);
            break;
          case 'restatement':
            instructions.push(`- REDUCE restatement: ${v.description}. Jump to new information instead of repeating what the user said.`);
            break;
        }
      }
    }

    if (verbosity.excess_sentences > 3) {
      instructions.push(`- TOO LONG: ${verbosity.sentence_count} sentences, max ${verbosity.max_allowed} for ${verbosity.intent_type} intent. Cut to the essential recommendation. Remove all supporting detail the user didn't ask for.`);
    }

    rewriteInstructions = instructions.join('\n');
  }

  return {
    passed,
    evidence,
    verbosity,
    needs_rewrite: needsRewrite,
    rewrite_instructions: rewriteInstructions,
  };
}
```

- [ ] **Step 8: Write main validator tests**

Create `apps/id/src/lib/marcus/__tests__/response-validator.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { validateResponse } from '../validators/response-validator';
import type { DataAvailabilityManifest } from '../types';

const manifest: DataAvailabilityManifest = {
  cortex_coverage: {
    overall_confidence: 67,
    layers: [
      { layer_name: 'voice', confidence: 82, has_data: true, field_count: 8, total_fields: 12, last_updated: '2026-04-01', source: 'mixed' },
    ],
  },
  connections: [
    { app_name: 'harvest', connected: false, synapse_healthy: false, last_sync: null, capabilities_available: [], capabilities_broken: [] },
  ],
  available_data: [],
  known_gaps: [],
  data_freshness: [],
};

describe('validateResponse', () => {
  it('passes a clean, concise, evidence-grounded response', () => {
    const response = 'Cortex is at 67% confidence. Voice layer is strong at 82%. Harvest is not connected so I cannot build sequences or track pipeline yet. Connect Harvest and I can help with outbound.';
    const result = validateResponse(response, manifest, 'tactical', 'what can you do for me');
    expect(result.passed).toBe(true);
    expect(result.needs_rewrite).toBe(false);
  });

  it('flags sycophantic verbose response for rewrite', () => {
    const sentences = [
      'Your positioning is sharp and the market timing is right.',
      'Startups are moving away from agencies.',
      'Your biggest advantage is scarcity.',
      'Two April spots creates natural urgency.',
      'Lead with that in every touchpoint.',
      'The market wants what you are selling.',
      'Your close rate assumption is conservative.',
      'Most qualified calls should convert.',
      'I am queuing harvest to build the sequences.',
      'Start prospecting while we build the automation.',
      'Your confidence scores show strong positioning.',
      'The delivery focus should help both areas significantly.',
    ];
    const response = sentences.join(' ');
    const result = validateResponse(response, manifest, 'strategic', 'how do I book calls');
    expect(result.passed).toBe(false);
    expect(result.needs_rewrite).toBe(true);
    expect(result.rewrite_instructions).toBeTruthy();
    // Should catch multiple violations
    expect(result.evidence.violations.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 9: Run all validator tests**

Run: `cd apps/id && pnpm vitest run src/lib/marcus/__tests__/response-validator.test.ts src/lib/marcus/__tests__/evidence-checker.test.ts src/lib/marcus/__tests__/verbosity-checker.test.ts`
Expected: ALL PASS

- [ ] **Step 10: Commit**

```bash
git add apps/id/src/lib/marcus/validators/ apps/id/src/lib/marcus/__tests__/response-validator.test.ts apps/id/src/lib/marcus/__tests__/evidence-checker.test.ts apps/id/src/lib/marcus/__tests__/verbosity-checker.test.ts
git commit -m "feat(marcus): add post-generation response validation - evidence, verbosity, sycophancy checks"
```

---

## Task 5: Build the Haiku Rewrite Prompt

When validation fails, Marcus needs to rewrite. This uses Haiku for speed - it receives the original response, the violation list, and rewrites to comply.

**Files:**
- Create: `apps/id/src/lib/marcus/prompts/marcus-validation.ts`

- [ ] **Step 1: Create the validation/rewrite prompt**

Create `apps/id/src/lib/marcus/prompts/marcus-validation.ts`:

```typescript
/**
 * Prompt for the Haiku rewrite call.
 * When the response validator catches violations, this prompt
 * instructs Haiku to fix the response while preserving the core advice.
 */
export function buildRewritePrompt(
  originalResponse: string,
  violations: string,
  intentType: string,
  maxSentences: number,
): string {
  return `You are editing a response from a stoic GTM advisor. The response has quality violations that must be fixed.

## Original Response
${originalResponse}

## Violations to Fix
${violations}

## Constraints
- Maximum ${maxSentences} sentences total
- Lead with the conclusion/recommendation
- Every claim must cite specific data or be explicitly flagged as speculation
- No exclamation marks
- No filler phrases ("Great question", "Absolutely", "I'd love to help")
- No ungrounded praise (never say positioning is "sharp" or "strong" without data)
- No restating what the user said
- No promises about disconnected systems
- Use regular dashes, never em dashes
- Stoic tone: calm, direct, grounded

## Task
Rewrite the response to fix all violations while preserving the core recommendation. Keep it tighter than the original. If the original makes claims without data, either add the data citation or remove the claim.

Output ONLY the rewritten response. No preamble, no explanation.`;
}

/**
 * Fallback response when both generation and rewrite fail validation.
 * This should never happen in production, but safety net.
 */
export function buildFallbackResponse(
  intentType: string,
  knownGaps: string[],
): string {
  const gapText = knownGaps.length > 0
    ? `I should flag that I'm working with limited data: ${knownGaps.slice(0, 3).join('. ')}.`
    : '';

  switch (intentType) {
    case 'strategic':
      return `I want to give you grounded advice here, but I need more data to be specific. ${gapText} Can you share what you're working with so I can be precise?`;
    case 'tactical':
      return `Let me be direct - I don't have enough data to answer this well yet. ${gapText} What specific numbers or context can you share?`;
    case 'data':
      return `I don't have that data available right now. ${gapText}`;
    default:
      return `I want to help with this but need to be honest about what I can see. ${gapText} What context can you share to help me give better advice?`;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/id/src/lib/marcus/prompts/marcus-validation.ts
git commit -m "feat(marcus): add Haiku rewrite prompt and fallback responses for validation failures"
```

---

## Task 6: Wire Validation into the Marcus Engine Pipeline

This is where it all connects. The existing `engine.ts` pipeline is: intent classification -> context assembly -> conversation history -> response generation -> action extraction -> deliver. We're inserting: (a) manifest generation inside context assembly, (b) the new system prompt, and (c) a validate-and-rewrite loop after response generation and before delivery.

**Files:**
- Modify: `apps/id/src/lib/marcus/engine.ts`

**Important:** This task modifies the existing engine. The exact code depends on the current implementation. These instructions describe the architectural changes to make. The engineer must read the existing `engine.ts` first and adapt these changes to the current code structure.

- [ ] **Step 1: Read the current engine.ts**

Run: `cat apps/id/src/lib/marcus/engine.ts`

Understand the current pipeline before modifying. Identify:
1. Where context is assembled (the function call to `context-assembly.ts`)
2. Where the system prompt is constructed
3. Where the Claude Sonnet call happens for response generation
4. Where the response is returned to the caller

- [ ] **Step 2: Add manifest generation to the context assembly phase**

In the section of `engine.ts` where context is assembled (likely a function like `assembleContext()` or similar), add the manifest generation call:

```typescript
import { buildDataAvailabilityManifest } from './context-assembly';
import { buildMarcusSystemPrompt } from './prompts/marcus-system';
import { validateResponse } from './validators/response-validator';
import { buildRewritePrompt, buildFallbackResponse } from './prompts/marcus-validation';
import { MAX_RESPONSE_SENTENCES } from './prompts/marcus-system';
```

After the existing context assembly, add:

```typescript
// Build data availability manifest - this tells Marcus what data it has
const manifest = await buildDataAvailabilityManifest(accountId, supabase);

// Build the system prompt with manifest injected
const systemPrompt = buildMarcusSystemPrompt(
  systemName,     // The user's chosen system name (e.g. "Kit")
  manifest,
  activeGoals,    // From existing context assembly
  productStack,   // From existing context assembly (or null if not loaded)
);
```

Replace the existing system prompt string/variable with `systemPrompt` in the Claude API call.

- [ ] **Step 3: Add validation loop after response generation**

After the Claude Sonnet call that generates the response (likely returns a `responseText` string), add:

```typescript
// Validate the response before delivering to user
const validation = validateResponse(
  responseText,
  manifest,
  intentType, // From intent classification step
  userMessage, // The user's original message
);

let finalResponse = responseText;

if (validation.needs_rewrite && validation.rewrite_instructions) {
  // Request a rewrite from Haiku
  const rewritePrompt = buildRewritePrompt(
    responseText,
    validation.rewrite_instructions,
    intentType,
    MAX_RESPONSE_SENTENCES[intentType] ?? 8,
  );

  try {
    const rewriteResult = await claudeHaiku(rewritePrompt); // Use existing Haiku call pattern
    const rewrittenText = rewriteResult.content[0]?.text ?? responseText;

    // Validate the rewrite
    const revalidation = validateResponse(rewrittenText, manifest, intentType, userMessage);

    if (revalidation.passed || revalidation.evidence.violations.filter((v) => v.severity === 'hard').length === 0) {
      finalResponse = rewrittenText;
    } else {
      // Rewrite also failed - use fallback
      console.warn('Marcus rewrite also failed validation', {
        original_violations: validation.evidence.violations,
        rewrite_violations: revalidation.evidence.violations,
      });
      finalResponse = buildFallbackResponse(
        intentType,
        manifest.known_gaps.map((g) => g.what_is_missing),
      );
    }
  } catch (error) {
    console.error('Marcus rewrite failed', error);
    // Keep original response if rewrite call fails - better than nothing
    finalResponse = responseText;
  }
}
```

Replace the existing response delivery with `finalResponse`.

- [ ] **Step 4: Add validation metadata to the response**

If the engine returns structured data (not just text), add validation metadata for debugging and learning:

```typescript
return {
  text: finalResponse,
  thread_id: threadId,
  // ... existing fields ...
  _validation: {
    original_passed: validation.passed,
    was_rewritten: finalResponse !== responseText,
    violations_caught: validation.evidence.violations.length,
    sentence_count: validation.verbosity.sentence_count,
    intent_type: intentType,
  },
};
```

- [ ] **Step 5: Test the full pipeline manually**

Start the dev server and send test messages through the chat that should trigger each violation type:

1. Send: "help me book calls" (with Harvest disconnected) - should NOT promise Harvest actions
2. Send: "I need to grow my pipeline" - should NOT respond with "your positioning is sharp"
3. Send: "I'm targeting seed stage companies" - should NOT restate what seed stage means
4. Check response lengths - should be under 8 sentences for strategic intent

- [ ] **Step 6: Commit**

```bash
git add apps/id/src/lib/marcus/engine.ts
git commit -m "feat(marcus): wire validation loop into engine pipeline - evidence check + rewrite on violation"
```

---

## Task 7: Add Validation Logging to the Learning Ledger

Every validation result should be logged so you can track: how often Marcus generates violating responses, which violation types are most common, and whether the rewrite step is working. This feeds into the approval system's confidence model over time.

**Files:**
- Modify: `apps/id/src/lib/marcus/engine.ts` (add ledger logging after validation)

- [ ] **Step 1: Add the ledger logging call**

After the validation loop in `engine.ts`, before returning the response, add:

```typescript
// Log validation results to the Learning Ledger
try {
  await supabase.from('kinetiks_learning_ledger').insert({
    account_id: accountId,
    event_type: 'marcus_response_validation',
    source: 'marcus',
    data: {
      thread_id: threadId,
      intent_type: intentType,
      validation_passed: validation.passed,
      was_rewritten: finalResponse !== responseText,
      violation_count: validation.evidence.violations.length,
      violation_types: validation.evidence.violations.map((v) => v.type),
      sentence_count: validation.verbosity.sentence_count,
      max_allowed: validation.verbosity.max_allowed,
      manifest_summary: {
        cortex_confidence: manifest.cortex_coverage.overall_confidence,
        connected_apps: manifest.connections.filter((c) => c.connected).map((c) => c.app_name),
        disconnected_apps: manifest.connections.filter((c) => !c.connected).map((c) => c.app_name),
        gap_count: manifest.known_gaps.length,
      },
    },
  });
} catch (error) {
  // Ledger logging should never block response delivery
  console.error('Failed to log validation to ledger', error);
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/id/src/lib/marcus/engine.ts
git commit -m "feat(marcus): log validation results to Learning Ledger for quality tracking"
```

---

## Task 8: Update Action Extractor to Respect Connection Status

The existing `action-extractor.ts` (Haiku call after response generation) extracts Proposals, briefs, and follow-ups. It currently doesn't know about connection status, so it may extract actions for disconnected apps. Fix this.

**Files:**
- Modify: `apps/id/src/lib/marcus/action-extractor.ts`

- [ ] **Step 1: Read the current action extractor**

Run: `cat apps/id/src/lib/marcus/action-extractor.ts`

Understand how it currently works. Identify where it decides which actions to extract and which apps to route them to.

- [ ] **Step 2: Pass the manifest to the action extractor**

Modify the function signature to accept the manifest:

```typescript
import type { DataAvailabilityManifest } from './types';

export async function extractActions(
  responseText: string,
  conversationHistory: any[],
  accountId: string,
  manifest: DataAvailabilityManifest, // NEW PARAMETER
  // ... existing params
) {
```

- [ ] **Step 3: Add connection filtering to the extraction prompt**

In the Haiku prompt that instructs extraction, add connection awareness:

```typescript
const connectionContext = manifest.connections
  .map((c) => `${c.app_name}: ${c.connected && c.synapse_healthy ? 'AVAILABLE' : 'UNAVAILABLE - do not extract actions for this app'}`)
  .join('\n');

// Add to the extraction prompt:
const extractionPromptAddition = `
## Connected Systems
${connectionContext}

CRITICAL: Only extract actions for AVAILABLE systems. If a system is UNAVAILABLE, do not create briefs, follow-ups, or proposals targeting that system. Instead, extract a "connection_needed" action noting what the user should connect.
`;
```

- [ ] **Step 4: Update the engine.ts call to pass manifest**

In `engine.ts`, update the `extractActions` call to include the manifest:

```typescript
const actions = await extractActions(
  finalResponse,
  conversationHistory,
  accountId,
  manifest, // Pass the manifest
  // ... existing args
);
```

- [ ] **Step 5: Commit**

```bash
git add apps/id/src/lib/marcus/action-extractor.ts apps/id/src/lib/marcus/engine.ts
git commit -m "feat(marcus): action extractor respects connection status - no actions for disconnected apps"
```

---

## Task 9: End-to-End Integration Test

A test that simulates the exact conversation from the bug report and verifies Marcus handles it correctly with the new pipeline.

**Files:**
- Create: `apps/id/src/lib/marcus/__tests__/conversation-quality.test.ts`

- [ ] **Step 1: Write the integration test**

Create `apps/id/src/lib/marcus/__tests__/conversation-quality.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { validateResponse } from '../validators/response-validator';
import { checkEvidence } from '../validators/evidence-checker';
import type { DataAvailabilityManifest } from '../types';

/**
 * These tests reproduce the exact conversation from the bug report
 * and verify that the new validation pipeline catches the problems.
 */

// Manifest representing the user's actual state: Harvest disconnected, Cortex partially populated
const userManifest: DataAvailabilityManifest = {
  cortex_coverage: {
    overall_confidence: 67,
    layers: [
      { layer_name: 'voice', confidence: 69, has_data: true, field_count: 7, total_fields: 12, last_updated: '2026-03-28', source: 'mixed' },
      { layer_name: 'competitive', confidence: 97, has_data: true, field_count: 11, total_fields: 12, last_updated: '2026-03-28', source: 'mixed' },
      { layer_name: 'customers', confidence: 45, has_data: true, field_count: 5, total_fields: 15, last_updated: '2026-03-28', source: 'ai_generated' },
      { layer_name: 'products', confidence: 72, has_data: true, field_count: 7, total_fields: 10, last_updated: '2026-03-28', source: 'mixed' },
      { layer_name: 'narrative', confidence: 55, has_data: true, field_count: 4, total_fields: 8, last_updated: '2026-03-28', source: 'ai_generated' },
      { layer_name: 'market', confidence: 30, has_data: true, field_count: 3, total_fields: 10, last_updated: '2026-03-25', source: 'ai_generated' },
      { layer_name: 'brand', confidence: 40, has_data: true, field_count: 5, total_fields: 14, last_updated: '2026-03-20', source: 'ai_generated' },
      { layer_name: 'content', confidence: 10, has_data: false, field_count: 1, total_fields: 8, last_updated: null, source: 'empty' },
    ],
  },
  connections: [
    { app_name: 'harvest', connected: false, synapse_healthy: false, last_sync: null, capabilities_available: ['create_sequence', 'query_pipeline'], capabilities_broken: ['create_sequence', 'query_pipeline'] },
    { app_name: 'dark_madder', connected: false, synapse_healthy: false, last_sync: null, capabilities_available: [], capabilities_broken: [] },
    { app_name: 'hypothesis', connected: false, synapse_healthy: false, last_sync: null, capabilities_available: [], capabilities_broken: [] },
    { app_name: 'litmus', connected: false, synapse_healthy: false, last_sync: null, capabilities_available: [], capabilities_broken: [] },
  ],
  available_data: [],
  known_gaps: [
    { category: 'outbound_metrics', what_is_missing: 'No outbound performance data', why_it_matters: 'Cannot validate conversion assumptions', how_to_fill: 'Connect Harvest' },
    { category: 'pipeline', what_is_missing: 'No pipeline data', why_it_matters: 'Cannot assess current deal flow', how_to_fill: 'Connect Harvest' },
    { category: 'content_metrics', what_is_missing: 'No content performance data', why_it_matters: 'Cannot assess content ROI', how_to_fill: 'Connect Dark Madder' },
    { category: 'cortex_content', what_is_missing: 'Content layer nearly empty', why_it_matters: 'No content strategy baseline', how_to_fill: 'Add content data in Cortex' },
  ],
  data_freshness: [
    { source: 'cortex', last_sync: '2026-03-28', sync_status: 'healthy' },
    { source: 'harvest', last_sync: null, sync_status: 'disconnected' },
  ],
};

describe('Conversation Quality - Bug Report Reproduction', () => {
  it('rejects the original first response (sycophancy + false promises)', () => {
    // This is approximately what Marcus said in the bug report
    const badResponse = `Focus on proving the 90-day delivery model before scaling demand. Your positioning is sharp and the market timing is right - startups are moving away from agencies toward independence. But you have two cohort spots for April with no systematic proof of delivery success. The strongest growth lever right now is documenting and showcasing completed builds. I've queued briefs to systematize your delivery process and track messaging performance. I also noted that your confidence scores show strong competitive positioning (97%) but weaker voice clarity (69%) - the delivery focus should help both.`;

    const result = validateResponse(badResponse, userManifest, 'strategic', 'what should we do');
    expect(result.passed).toBe(false);
    // Should catch "positioning is sharp" sycophancy
    expect(result.evidence.violations.some((v) => v.type === 'sycophancy')).toBe(true);
  });

  it('rejects the call booking response (sycophancy + urgency + false promises)', () => {
    const badResponse = `Launch outbound immediately - you have the capacity and proven delivery. Your biggest advantage is scarcity - two April spots creates natural urgency. I'm updating your customer data to reflect current capacity and will queue harvest to build the outbound sequences.`;

    const result = validateResponse(badResponse, userManifest, 'tactical', 'how can we start booking calls');
    expect(result.passed).toBe(false);
    expect(result.evidence.violations.some((v) => v.type === 'sycophancy')).toBe(true);
  });

  it('rejects conservative close rate claim without data', () => {
    const badResponse = `Your close rate assumption is conservative given your positioning strength and market timing. Most qualified calls should convert if they're truly qualified.`;

    const result = checkEvidence(badResponse, userManifest, 'i think i can close 1/3 qualified calls');
    expect(result.passed).toBe(false);
    expect(result.violations.some((v) => v.type === 'sycophancy')).toBe(true);
  });

  it('accepts a properly evidence-grounded response', () => {
    const goodResponse = `Your competitive layer is at 97% confidence - the differentiation against agencies is well-documented. Voice clarity is at 69%, which means messaging may need tightening before scaling outbound. Harvest is not connected, so I cannot build sequences, track pipeline, or assess outbound performance yet. Connect Harvest first. Without outbound data, I cannot validate the 33% close rate assumption - track your first 10 qualified calls before building volume targets around it.`;

    const result = validateResponse(goodResponse, userManifest, 'strategic', 'what should we do');
    expect(result.passed).toBe(true);
  });
});
```

- [ ] **Step 2: Run the integration tests**

Run: `cd apps/id && pnpm vitest run src/lib/marcus/__tests__/conversation-quality.test.ts`
Expected: ALL PASS

- [ ] **Step 3: Commit**

```bash
git add apps/id/src/lib/marcus/__tests__/conversation-quality.test.ts
git commit -m "test(marcus): add conversation quality integration tests reproducing bug report scenarios"
```

---

## Task 10: Document the Changes

Add documentation so future engineers understand the validation pipeline and how to maintain it.

**Files:**
- Create: `docs/marcus-conversation-quality.md`

- [ ] **Step 1: Write the documentation**

Create `docs/marcus-conversation-quality.md`:

```markdown
# Marcus Conversation Quality System

## Problem

Marcus was generating responses that violated its own voice spec:
1. Generic advice with no data citations
2. Responses 4-6 paragraphs when spec says 5-8 sentences
3. Sycophantic praise ("your positioning is sharp") without evidence
4. No acknowledgment of data gaps or system disconnections
5. False promises about disconnected apps ("I've queued briefs to Harvest")
6. Restating user input instead of adding new information

## Solution Architecture

A three-layer enforcement system:

### Layer 1: Data Availability Manifest
Before every response, `context-assembly.ts` builds a `DataAvailabilityManifest` that tells Marcus exactly what data it has, what systems are connected, and what gaps exist. This manifest is injected into the system prompt.

### Layer 2: Hard-Constraint System Prompt
The system prompt (`prompts/marcus-system.ts`) includes:
- Evidence rules: every claim must cite data or be flagged as speculation
- Connection awareness: never promise actions through disconnected systems
- Anti-sycophancy: specific phrases that are prohibited
- Anti-restatement: don't repeat what the user said
- Length constraints: max sentences per intent type

### Layer 3: Post-Generation Validation
After Sonnet generates a response, `validators/response-validator.ts` checks for:
- Sycophancy patterns (regex matching)
- False promises about disconnected apps
- Verbosity (sentence counting)
- Restatement of user input

If validation fails, a Haiku rewrite is requested with specific fix instructions. If the rewrite also fails, a safe fallback response is used.

## Key Files

- `lib/marcus/types.ts` - DataAvailabilityManifest types
- `lib/marcus/context-assembly.ts` - Manifest generation (buildDataAvailabilityManifest)
- `lib/marcus/prompts/marcus-system.ts` - System prompt builder
- `lib/marcus/prompts/marcus-evidence-rules.ts` - Evidence, sycophancy, restatement rules
- `lib/marcus/prompts/marcus-validation.ts` - Haiku rewrite prompt
- `lib/marcus/validators/response-validator.ts` - Main validation orchestrator
- `lib/marcus/validators/evidence-checker.ts` - Evidence + sycophancy + promise checking
- `lib/marcus/validators/verbosity-checker.ts` - Length enforcement
- `lib/marcus/engine.ts` - Pipeline integration (manifest -> prompt -> generate -> validate -> rewrite -> deliver)

## Adding New Violation Patterns

To add a new sycophancy pattern, add a regex to `SYCOPHANCY_PATTERNS` in `evidence-checker.ts`. To add a new false-promise pattern, add to `PROMISE_PATTERNS`. Both are arrays - just append.

## Monitoring

Validation results are logged to the Learning Ledger under event_type `marcus_response_validation`. Track:
- `validation_passed` rate (target: >90% after prompt stabilizes)
- `was_rewritten` rate (target: <10%)
- `violation_types` distribution (identify which rules fire most)

If rewrite rate stays above 20%, the system prompt needs tuning - the rules are catching too many false positives or the generation prompt isn't strict enough.
```

- [ ] **Step 2: Commit**

```bash
git add docs/marcus-conversation-quality.md
git commit -m "docs: add Marcus conversation quality system documentation"
```

---

## Self-Review

### Spec Coverage Check

| Issue from Analysis | Task(s) that Fix It |
|---|---|
| 1. Generic advice, not data-grounded | Task 2 (manifest), Task 3 (evidence rules in prompt), Task 4 (evidence checker) |
| 2. Too verbose | Task 3 (length constraints in prompt), Task 4 (verbosity checker) |
| 3. Sycophantic | Task 3 (anti-sycophancy rules), Task 4 (sycophancy pattern detection) |
| 4. Doesn't flag what it doesn't know | Task 2 (known_gaps in manifest), Task 3 (Category 3: Flagged Speculation rule) |
| 5. Harvest blindspot / false promises | Task 2 (ConnectionStatus), Task 3 (connection awareness rules), Task 4 (false promise detection), Task 8 (action extractor) |
| 6. Restating user input | Task 3 (anti-restatement rules), Task 4 (restatement detection) |

### Placeholder Scan
No TODOs, no TBDs, no "implement later" references. All code blocks are complete.

### Type Consistency Check
- `DataAvailabilityManifest` defined in Task 1, used in Tasks 2, 3, 4, 6, 8, 9
- `buildDataAvailabilityManifest()` defined in Task 2, called in Task 6
- `buildMarcusSystemPrompt()` defined in Task 3, called in Task 6
- `validateResponse()` defined in Task 4, called in Tasks 6, 9
- `checkEvidence()` defined in Task 4, called in Task 9
- `buildRewritePrompt()` / `buildFallbackResponse()` defined in Task 5, called in Task 6
- All names consistent across tasks.
