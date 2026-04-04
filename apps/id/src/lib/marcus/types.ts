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

export function isManifestComplete(manifest: DataAvailabilityManifest): boolean {
  return (
    manifest.cortex_coverage.layers.length > 0 &&
    manifest.connections.length >= 0 && // 0 is valid - no apps connected
    Array.isArray(manifest.available_data) &&
    Array.isArray(manifest.known_gaps)
  );
}

// --- Pre-Analysis Brief ---
// Produced by Haiku BEFORE Sonnet generates a response.
// Placed directly adjacent to the user's message in the Sonnet call.

export interface PreAnalysisBrief {
  available_evidence: EvidencePoint[];
  not_available: string[];
  memory_facts: string[];
  response_shape: ResponseShape;
  action_availability: ActionAvailability[];
}

export interface EvidencePoint {
  label: string;          // "competitive_confidence"
  value: string;          // "97%"
  citation: string;       // "Competitive layer: 97% confidence, agencies and fractional CMOs documented"
}

export interface ResponseShape {
  max_sentences: number;
  lead_with: string;      // "The core recommendation about outbound strategy"
  must_flag: string[];    // ["No pipeline data", "Cannot validate close rate"]
  must_not: string[];     // ["Promise Harvest actions", "Recommend Series A/B targeting"]
}

export interface ActionAvailability {
  app_name: string;
  available: boolean;
  reason: string;         // "Connected and healthy" or "Not connected - cannot queue actions"
}

// --- Thread Memory ---

export interface ThreadMemory {
  id: string;
  thread_id: string;
  memory_type: 'correction' | 'decision' | 'preference' | 'constraint' | 'fact';
  content: string;
  source_message_index: number | null;
  confidence: number;
  active: boolean;
  created_at: string;
}

export interface MemoryExtraction {
  memories: NewMemory[];
  supersedes: string[];   // IDs of memories this extraction replaces
}

export interface NewMemory {
  memory_type: ThreadMemory['memory_type'];
  content: string;
  confidence: number;
}

// --- Action Output ---
// Produced by Haiku AFTER Sonnet generates the response.
// Completely separated from response text.

export interface GeneratedAction {
  type: 'proposal' | 'brief' | 'follow_up' | 'connection_needed';
  target_app: string | null;        // null for connection_needed
  description: string;              // Human-readable summary for the action footer
  payload: Record<string, any>;     // Structured data for the action system
  requires_connection: boolean;     // True if this needs an app that isn't connected
}

export interface ActionGenerationResult {
  actions: GeneratedAction[];
  footer_text: string;              // Pre-formatted footer for the response
}
