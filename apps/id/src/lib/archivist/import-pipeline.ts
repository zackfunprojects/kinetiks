/**
 * Archivist import processing pipeline.
 *
 * Parses uploaded files (CSV, JSON, PDF, DOCX), validates entries against
 * the target layer schema, deduplicates against existing data, normalizes,
 * and creates proposals that flow through the Cortex evaluation pipeline.
 */

import type { ContextLayer, ProposalConfidence } from "@kinetiks/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { askClaude } from "@kinetiks/ai";
import { submitProposal } from "@/lib/cartographer/submit";
import {
  ARCHIVIST_IMPORT_PARSE_SYSTEM,
  ARCHIVIST_CONTENT_ANALYSIS_SYSTEM,
  ARCHIVIST_BRAND_GUIDE_SYSTEM,
} from "@/lib/ai/prompts/archivist";
import type {
  ImportType,
  ImportFileType,
  ImportResult,
  ImportStats,
  ParsedImportEntry,
} from "./types";

/**
 * Maximum entries to process per import to avoid timeout.
 */
const BATCH_SIZE = 50;

/**
 * Valid fields per layer for schema validation.
 */
const LAYER_FIELDS: Record<ContextLayer, string[]> = {
  org: [
    "company_name",
    "industry",
    "stage",
    "geography",
    "website",
    "description",
    "legal_entity",
    "sub_industry",
    "founded_year",
    "team_size",
    "funding_status",
  ],
  products: ["products"],
  voice: [
    "tone",
    "vocabulary",
    "messaging_patterns",
    "writing_samples",
    "calibration_data",
    "platform_variants",
  ],
  customers: ["personas", "demographics", "analytics_data"],
  narrative: [
    "origin_story",
    "founder_thesis",
    "why_now",
    "brand_arc",
    "validated_angles",
    "media_positioning",
  ],
  competitive: ["competitors", "positioning_gaps", "differentiation_vectors"],
  market: [
    "trends",
    "media_sentiment",
    "llm_representation",
    "seasonal_patterns",
    "regulatory_signals",
  ],
  brand: [
    "colors",
    "typography",
    "tokens",
    "imagery",
    "motion",
    "modes",
    "accessibility",
    "logo",
    "social_visual_id",
  ],
};

// ── File type detection ──

function detectFileType(filePath: string): ImportFileType {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "csv":
    case "tsv":
      return "csv";
    case "json":
      return "json";
    case "pdf":
      return "pdf";
    case "docx":
    case "doc":
      return "docx";
    default:
      return "json";
  }
}

// ── CSV parsing ──

function parseCsv(content: string): Record<string, string>[] {
  const lines = content.split("\n").filter((line) => line.trim().length > 0);
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]);
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const row: Record<string, string> = {};

    for (let j = 0; j < headers.length; j++) {
      const header = headers[j].trim().toLowerCase().replace(/\s+/g, "_");
      row[header] = values[j]?.trim() ?? "";
    }

    // Skip completely empty rows
    if (Object.values(row).every((v) => v.length === 0)) continue;

    rows.push(row);
  }

  return rows;
}

/**
 * Parse a single CSV line handling quoted values.
 */
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current);
  return result;
}

// ── JSON parsing ──

function parseJson(content: string): Record<string, unknown>[] {
  const parsed = JSON.parse(content);

  if (Array.isArray(parsed)) {
    return parsed.filter(
      (item): item is Record<string, unknown> =>
        typeof item === "object" && item !== null
    );
  }

  if (typeof parsed === "object" && parsed !== null) {
    // Look for the first array value in the object
    for (const val of Object.values(parsed as Record<string, unknown>)) {
      if (Array.isArray(val)) {
        return val.filter(
          (item): item is Record<string, unknown> =>
            typeof item === "object" && item !== null
        );
      }
    }
    // Single object - wrap in array
    return [parsed as Record<string, unknown>];
  }

  return [];
}

// ── AI-assisted parsing ──

async function parseWithAi(
  content: string,
  importType: ImportType,
  targetLayer: ContextLayer
): Promise<Record<string, unknown>[]> {
  const schema = JSON.stringify(LAYER_FIELDS[targetLayer]);

  let systemPrompt: string;
  switch (importType) {
    case "content_library":
      systemPrompt = ARCHIVIST_CONTENT_ANALYSIS_SYSTEM;
      break;
    case "brand_assets":
      systemPrompt = ARCHIVIST_BRAND_GUIDE_SYSTEM;
      break;
    default:
      systemPrompt = ARCHIVIST_IMPORT_PARSE_SYSTEM;
  }

  // Truncate content to avoid token limits (roughly 50k chars for Haiku)
  const truncated = content.slice(0, 50000);

  const response = await askClaude(
    `Target layer: ${targetLayer}\nExpected fields: ${schema}\n\nContent to parse:\n\n${truncated}`,
    {
      system: systemPrompt,
      model: "claude-haiku-4-5-20251001",
      maxTokens: 4096,
    }
  );

  const parsed = JSON.parse(response);

  if (Array.isArray(parsed)) {
    return parsed.filter(
      (item): item is Record<string, unknown> =>
        typeof item === "object" && item !== null
    );
  }

  if (typeof parsed === "object" && parsed !== null) {
    return [parsed as Record<string, unknown>];
  }

  return [];
}

// ── Import type to layer mapping ──

interface LayerMapping {
  primary: ContextLayer;
  secondary: ContextLayer[];
}

const IMPORT_TYPE_LAYERS: Record<ImportType, LayerMapping> = {
  content_library: { primary: "voice", secondary: ["narrative"] },
  contacts: { primary: "customers", secondary: [] },
  brand_assets: { primary: "brand", secondary: [] },
  media_list: { primary: "competitive", secondary: [] },
};

// ── Schema validation ──

function validateEntry(
  entry: Record<string, unknown>,
  targetLayer: ContextLayer
): { valid: boolean; errors: string[] } {
  const validFields = LAYER_FIELDS[targetLayer];
  const errors: string[] = [];

  if (Object.keys(entry).length === 0) {
    errors.push("Empty entry");
    return { valid: false, errors };
  }

  // Check that at least one valid field is present
  const payloadFields = Object.keys(entry);
  const hasValidField = payloadFields.some((f) => validFields.includes(f));

  if (!hasValidField) {
    errors.push(
      `No valid fields for layer '${targetLayer}'. Expected one of: ${validFields.join(", ")}`
    );
  }

  return { valid: errors.length === 0, errors };
}

// ── Contact cleaning ──

/**
 * Flexible column header mapping for contact imports.
 */
const CONTACT_COLUMN_MAP: Record<string, string> = {
  name: "name",
  full_name: "name",
  contact_name: "name",
  first_name: "name",
  role: "role",
  title: "role",
  job_title: "role",
  position: "role",
  company: "company_type",
  company_name: "company_type",
  organization: "company_type",
  org: "company_type",
  email: "email",
  email_address: "email",
  pain_point: "pain_points",
  pain_points: "pain_points",
  challenge: "pain_points",
  challenges: "pain_points",
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanContact(
  entry: Record<string, string>
): Record<string, unknown> {
  const mapped: Record<string, unknown> = {};

  // Map columns using flexible header matching
  for (const [key, value] of Object.entries(entry)) {
    const normalizedKey = key.toLowerCase().trim().replace(/\s+/g, "_");
    const targetField = CONTACT_COLUMN_MAP[normalizedKey];
    if (targetField && value.trim()) {
      mapped[targetField] = value.trim();
    }
  }

  // Title-case name
  if (typeof mapped.name === "string") {
    mapped.name = titleCase(mapped.name);
  }

  // Lowercase and validate email
  if (typeof mapped.email === "string") {
    const normalizedEmail = mapped.email.toLowerCase().trim();
    if (EMAIL_REGEX.test(normalizedEmail)) {
      mapped.email = normalizedEmail;
    } else {
      delete mapped.email;
    }
  }

  // Title-case company
  if (typeof mapped.company_type === "string") {
    mapped.company_type = titleCase(mapped.company_type);
  }

  // Convert pain_points to array if it's a string
  if (typeof mapped.pain_points === "string") {
    mapped.pain_points = mapped.pain_points
      .split(/[,;|]/)
      .map((s: string) => s.trim())
      .filter((s: string) => s.length > 0);
  }

  return mapped;
}

function titleCase(str: string): string {
  return str
    .trim()
    .split(/\s+/)
    .map((word) => {
      if (word.length === 0) return word;
      return word[0].toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

// ── Content library analysis ──

async function analyzeContentLibrary(
  entries: Record<string, unknown>[]
): Promise<Record<string, unknown>> {
  // Combine all text content for analysis
  const texts: string[] = [];
  for (const entry of entries.slice(0, 20)) {
    // Limit to first 20 entries
    const text =
      (entry.text as string) ??
      (entry.content as string) ??
      (entry.body as string) ??
      "";
    if (text.trim()) {
      texts.push(text.trim().slice(0, 2000)); // Limit per entry
    }
  }

  if (texts.length === 0) return {};

  const combinedContent = texts
    .map((t, i) => `--- Content ${i + 1} ---\n${t}`)
    .join("\n\n");

  const response = await askClaude(combinedContent, {
    system: ARCHIVIST_CONTENT_ANALYSIS_SYSTEM,
    model: "claude-haiku-4-5-20251001",
    maxTokens: 4096,
  });

  return JSON.parse(response) as Record<string, unknown>;
}

// ── Main pipeline ──

/**
 * Process an import through the full pipeline:
 * fetch -> parse -> validate -> clean -> dedup -> create proposals -> update record.
 */
export async function processImport(
  admin: SupabaseClient,
  importId: string,
  accountId: string
): Promise<ImportResult> {
  const stats: ImportStats = {
    total: 0,
    imported: 0,
    duplicates: 0,
    errors: 0,
    proposals_created: 0,
  };
  const errors: Array<{ row: number; message: string }> = [];

  // Fetch import record
  const { data: importRecord, error: fetchError } = await admin
    .from("kinetiks_imports")
    .select("*")
    .eq("id", importId)
    .eq("account_id", accountId)
    .single();

  if (fetchError || !importRecord) {
    return {
      import_id: importId,
      status: "error",
      stats,
      errors: [{ row: 0, message: "Import record not found" }],
    };
  }

  const importType = importRecord.import_type as ImportType;
  const filePath = importRecord.file_path as string;

  if (!filePath) {
    await updateImportStatus(admin, importId, "error", stats);
    return {
      import_id: importId,
      status: "error",
      stats,
      errors: [{ row: 0, message: "No file path in import record" }],
    };
  }

  // Update status to processing
  await updateImportStatus(admin, importId, "processing", stats);

  // Download file from Supabase Storage
  const { data: fileData, error: downloadError } = await admin.storage
    .from("imports")
    .download(filePath);

  if (downloadError || !fileData) {
    await updateImportStatus(admin, importId, "error", stats);
    return {
      import_id: importId,
      status: "error",
      stats,
      errors: [
        {
          row: 0,
          message: `Failed to download file: ${downloadError?.message ?? "unknown error"}`,
        },
      ],
    };
  }

  const content = await fileData.text();
  const fileType = detectFileType(filePath);
  const layerMapping = IMPORT_TYPE_LAYERS[importType];
  const targetLayer = layerMapping.primary;

  // Parse file content
  let rawEntries: Record<string, unknown>[];

  try {
    switch (fileType) {
      case "csv":
        rawEntries = parseCsv(content) as Record<string, unknown>[];
        break;
      case "json":
        rawEntries = parseJson(content);
        break;
      case "pdf":
      case "docx":
        rawEntries = await parseWithAi(content, importType, targetLayer);
        break;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown parse error";
    await updateImportStatus(admin, importId, "error", stats);
    return {
      import_id: importId,
      status: "error",
      stats,
      errors: [{ row: 0, message: `Parse error: ${message}` }],
    };
  }

  stats.total = rawEntries.length;

  if (rawEntries.length === 0) {
    await updateImportStatus(admin, importId, "complete", stats);
    return { import_id: importId, status: "complete", stats, errors };
  }

  // Special handling for content library - analyze for voice patterns
  if (importType === "content_library") {
    try {
      const analysis = await analyzeContentLibrary(rawEntries);
      if (Object.keys(analysis).length > 0) {
        await submitProposal(admin, {
          account_id: accountId,
          source_app: "kinetiks_id",
          source_operator: "archivist_import",
          target_layer: "voice",
          action: "update",
          confidence: "inferred",
          payload: analysis,
          evidence: [
            {
              type: "user_action" as const,
              value: `Content library import (${rawEntries.length} items)`,
              context: "Voice patterns extracted from imported content",
              date: new Date().toISOString(),
            },
          ],
          expires_at: null,
        });
        stats.proposals_created++;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error(
        `[archivist/import] Content analysis failed:`,
        message
      );
      errors.push({ row: 0, message: `Content analysis error: ${message}` });
    }
  }

  // Special handling for contacts - clean and group into personas
  if (importType === "contacts") {
    const personas = processContactImport(rawEntries, errors, stats);
    if (personas.length > 0) {
      try {
        await submitProposal(admin, {
          account_id: accountId,
          source_app: "kinetiks_id",
          source_operator: "archivist_import",
          target_layer: "customers",
          action: "add",
          confidence: "validated",
          payload: { personas },
          evidence: [
            {
              type: "user_action" as const,
              value: `Contact import (${rawEntries.length} contacts)`,
              context: "Personas derived from imported contact list",
              date: new Date().toISOString(),
            },
          ],
          expires_at: null,
        });
        stats.proposals_created++;
        stats.imported = personas.length;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error(
          `[archivist/import] Contact proposal failed:`,
          message
        );
        stats.errors++;
        errors.push({
          row: 0,
          message: `Failed to create persona proposal: ${message}`,
        });
      }
    }
  } else if (importType !== "content_library") {
    // Standard import: validate and create proposals for each entry batch
    await processStandardImport(
      admin,
      accountId,
      rawEntries,
      targetLayer,
      fileType,
      errors,
      stats
    );
  }

  // Determine final status
  const finalStatus =
    stats.errors > 0 && stats.imported === 0
      ? "error"
      : stats.errors > 0
        ? "partial"
        : "complete";

  await updateImportStatus(
    admin,
    importId,
    finalStatus === "partial" || finalStatus === "complete"
      ? "complete"
      : "error",
    stats
  );

  // Log to ledger
  await admin.from("kinetiks_ledger").insert({
    account_id: accountId,
    event_type: "import",
    source_operator: "archivist",
    detail: {
      import_id: importId,
      import_type: importType,
      file_type: fileType,
      stats,
      error_count: errors.length,
      timestamp: new Date().toISOString(),
    },
  });

  return { import_id: importId, status: finalStatus, stats, errors };
}

/**
 * Process a contact import: clean contacts and group into personas.
 */
function processContactImport(
  rawEntries: Record<string, unknown>[],
  errors: Array<{ row: number; message: string }>,
  stats: ImportStats
): Record<string, unknown>[] {
  const cleaned: Record<string, unknown>[] = [];
  const seenNames = new Set<string>();

  for (let i = 0; i < rawEntries.length; i++) {
    try {
      const entry = rawEntries[i] as Record<string, string>;
      const contact = cleanContact(entry);

      if (!contact.name || (contact.name as string).trim().length === 0) {
        stats.errors++;
        errors.push({ row: i + 1, message: "Missing name" });
        continue;
      }

      // Dedup by name
      const nameKey = (contact.name as string).toLowerCase();
      if (seenNames.has(nameKey)) {
        stats.duplicates++;
        continue;
      }
      seenNames.add(nameKey);

      // Build persona entry
      const persona: Record<string, unknown> = {
        name: contact.name,
        role: contact.role ?? null,
        company_type: contact.company_type ?? null,
        pain_points: (contact.pain_points as string[]) ?? [],
        buying_triggers: [],
        objections: [],
        conversion_signals: [],
      };

      cleaned.push(persona);
    } catch (err) {
      stats.errors++;
      const message = err instanceof Error ? err.message : "Unknown error";
      errors.push({ row: i + 1, message });
    }
  }

  return cleaned;
}

/**
 * Process a standard import (brand_assets, media_list): validate and create proposals.
 */
async function processStandardImport(
  admin: SupabaseClient,
  accountId: string,
  rawEntries: Record<string, unknown>[],
  targetLayer: ContextLayer,
  fileType: ImportFileType,
  errors: Array<{ row: number; message: string }>,
  stats: ImportStats
): Promise<void> {
  // For structured data (CSV/JSON), each entry maps directly
  // For AI-parsed data, entries are already structured
  const confidence: ProposalConfidence =
    fileType === "csv" || fileType === "json" ? "validated" : "inferred";

  // Process in batches
  for (let i = 0; i < rawEntries.length; i += BATCH_SIZE) {
    const batch = rawEntries.slice(i, i + BATCH_SIZE);

    // If there's only one entry or the payload is already layer-shaped, submit as one proposal
    if (batch.length === 1 || isLayerShaped(batch[0], targetLayer)) {
      const payload =
        batch.length === 1 ? batch[0] : mergeEntries(batch, targetLayer);
      const validation = validateEntry(payload, targetLayer);

      if (!validation.valid) {
        for (const err of validation.errors) {
          errors.push({ row: i + 1, message: err });
        }
        stats.errors += batch.length;
        continue;
      }

      try {
        await submitProposal(admin, {
          account_id: accountId,
          source_app: "kinetiks_id",
          source_operator: "archivist_import",
          target_layer: targetLayer,
          action: "add",
          confidence,
          payload,
          evidence: [
            {
              type: "user_action" as const,
              value: `File import batch (${batch.length} items)`,
              context: "Data imported from user-uploaded file",
              date: new Date().toISOString(),
            },
          ],
          expires_at: null,
        });
        stats.proposals_created++;
        stats.imported += batch.length;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        stats.errors += batch.length;
        errors.push({
          row: i + 1,
          message: `Proposal submission failed: ${message}`,
        });
      }
    } else {
      // Submit each entry as individual proposals
      for (let j = 0; j < batch.length; j++) {
        const entry = batch[j];
        const validation = validateEntry(entry, targetLayer);

        if (!validation.valid) {
          stats.errors++;
          for (const err of validation.errors) {
            errors.push({ row: i + j + 1, message: err });
          }
          continue;
        }

        try {
          await submitProposal(admin, {
            account_id: accountId,
            source_app: "kinetiks_id",
            source_operator: "archivist_import",
            target_layer: targetLayer,
            action: "add",
            confidence,
            payload: entry,
            evidence: [
              {
                type: "user_action" as const,
                value: `File import entry`,
                context: "Data imported from user-uploaded file",
                date: new Date().toISOString(),
              },
            ],
            expires_at: null,
          });
          stats.proposals_created++;
          stats.imported++;
        } catch (err) {
          const message = err instanceof Error ? err.message : "Unknown error";
          stats.errors++;
          errors.push({
            row: i + j + 1,
            message: `Proposal submission failed: ${message}`,
          });
        }
      }
    }
  }
}

/**
 * Check if an entry is already shaped like the target layer
 * (has top-level fields matching the layer schema).
 */
function isLayerShaped(
  entry: Record<string, unknown>,
  targetLayer: ContextLayer
): boolean {
  const validFields = LAYER_FIELDS[targetLayer];
  return Object.keys(entry).some((f) => validFields.includes(f));
}

/**
 * Merge multiple entries into a single layer-shaped payload.
 * Used when entries are individual items that should be combined into an array field.
 */
function mergeEntries(
  entries: Record<string, unknown>[],
  targetLayer: ContextLayer
): Record<string, unknown> {
  // For array-based layers, wrap entries in the appropriate array field
  switch (targetLayer) {
    case "products":
      return { products: entries };
    case "customers":
      return { personas: entries };
    case "competitive":
      return { competitors: entries };
    case "market":
      return { trends: entries };
    case "narrative":
      return { validated_angles: entries };
    default:
      // For scalar layers, merge all entries into one object
      return Object.assign({}, ...entries);
  }
}

/**
 * Update the import record status and stats.
 */
async function updateImportStatus(
  admin: SupabaseClient,
  importId: string,
  status: string,
  stats: ImportStats
): Promise<void> {
  const { error } = await admin
    .from("kinetiks_imports")
    .update({ status, stats })
    .eq("id", importId);

  if (error) {
    console.error(
      `[archivist/import] Failed to update import ${importId} status:`,
      error.message
    );
  }
}
