/**
 * Data extraction framework.
 *
 * Provides the standard flow for pulling data from a connected provider,
 * converting it to Proposals, and submitting them to the Cortex pipeline.
 * Individual provider extractors are plugged in as functions.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ConnectionRecord,
  ConnectionProvider,
  DataExtractionResult,
} from "@kinetiks/types";
import { submitProposal } from "@/lib/cartographer/submit";
import type { ProposalInsert } from "@/lib/cartographer/types";
import {
  getDecryptedCredentials,
  ensureFreshToken,
  updateLastSync,
  updateConnectionStatus,
} from "./manager";
import type {
  ExtractionContext,
  ExtractedProposal,
  StoredOAuthCredentials,
} from "./types";

/**
 * Extractor function signature.
 * Each provider implements one of these to pull data and build proposals.
 */
export type ExtractorFn = (
  context: ExtractionContext
) => Promise<ExtractedProposal[]>;

/**
 * Registry of provider extractors. Providers register their extractor here.
 * When an extractor is not registered, sync will fail with a clear message.
 */
const extractorRegistry = new Map<ConnectionProvider, ExtractorFn>();

/**
 * Register an extractor function for a provider.
 * Called at module load time by each provider's implementation.
 */
export function registerExtractor(
  provider: ConnectionProvider,
  extractor: ExtractorFn
): void {
  extractorRegistry.set(provider, extractor);
}

/**
 * Run a data extraction for a connection.
 *
 * 1. Decrypts credentials (refreshes OAuth tokens if expired)
 * 2. Calls the provider's extractor function
 * 3. Converts extracted proposals to ProposalInserts
 * 4. Submits each through the Cortex evaluation pipeline
 * 5. Logs the sync to kinetiks_connection_sync_logs
 * 6. Updates last_sync_at on the connection
 */
export async function runExtraction(
  admin: SupabaseClient,
  connection: ConnectionRecord,
  accountId: string
): Promise<DataExtractionResult> {
  const startTime = Date.now();
  const provider = connection.provider as ConnectionProvider;

  const extractor = extractorRegistry.get(provider);
  if (!extractor) {
    return {
      success: false,
      records_processed: 0,
      proposals_generated: 0,
      error: `No extractor registered for provider: ${provider}. This integration is not yet implemented.`,
      duration_ms: Date.now() - startTime,
    };
  }

  try {
    // Ensure credentials are fresh
    let credentials = getDecryptedCredentials(connection);
    if (credentials.type === "oauth") {
      const freshCreds: StoredOAuthCredentials = await ensureFreshToken(
        admin,
        connection
      );
      credentials = freshCreds;
    }

    const context: ExtractionContext = {
      connectionId: connection.id,
      accountId,
      provider,
      credentials,
      metadata: connection.metadata,
    };

    // Run the provider's extractor
    const extracted = await extractor(context);

    // Submit each extracted proposal through the Cortex pipeline
    let proposalsSubmitted = 0;
    for (const ep of extracted) {
      const proposalInsert: ProposalInsert = {
        account_id: accountId,
        source_app: "connections",
        source_operator: `${provider}_extractor`,
        target_layer: ep.target_layer,
        action: ep.action,
        confidence: ep.confidence,
        payload: ep.payload,
        evidence: ep.evidence,
        expires_at: null,
      };

      try {
        await submitProposal(admin, proposalInsert);
        proposalsSubmitted++;
      } catch (err) {
        console.error(
          `Failed to submit proposal from ${provider} extractor:`,
          err instanceof Error ? err.message : err
        );
      }
    }

    // Update sync timestamp
    await updateLastSync(admin, connection.id);

    const result: DataExtractionResult = {
      success: true,
      records_processed: extracted.length,
      proposals_generated: proposalsSubmitted,
      error: null,
      duration_ms: Date.now() - startTime,
    };

    // Log sync result
    await logSyncResult(admin, connection.id, accountId, result);

    return result;
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "Unknown extraction error";

    await updateConnectionStatus(admin, connection.id, "error");

    const result: DataExtractionResult = {
      success: false,
      records_processed: 0,
      proposals_generated: 0,
      error: errorMessage,
      duration_ms: Date.now() - startTime,
    };

    await logSyncResult(admin, connection.id, accountId, result);

    return result;
  }
}

/**
 * Log a sync result to kinetiks_connection_sync_logs.
 */
async function logSyncResult(
  admin: SupabaseClient,
  connectionId: string,
  accountId: string,
  result: DataExtractionResult
): Promise<void> {
  const { error } = await admin
    .from("kinetiks_connection_sync_logs")
    .insert({
      connection_id: connectionId,
      account_id: accountId,
      status: result.success ? "success" : "error",
      records_processed: result.records_processed,
      proposals_generated: result.proposals_generated,
      error: result.error,
      duration_ms: result.duration_ms,
    });

  if (error) {
    console.error(
      `Failed to log sync result for connection ${connectionId}:`,
      error.message
    );
  }
}
