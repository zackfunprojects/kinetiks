import { createAdminClient } from "@/lib/supabase/admin";
import type { SynapseCommand, CommandResponse } from "@kinetiks/synapse";

const MAX_RETRIES = 3;
const BACKOFF_BASE_MS = 1000;

/**
 * Dispatch commands to app Synapses via HTTP (Supabase Edge Functions).
 * Supports parallel dispatch, timeout handling, and retry logic.
 */
export async function dispatchCommands(
  commands: SynapseCommand[]
): Promise<CommandResponse[]> {
  // All commands dispatched in parallel
  const results = await Promise.allSettled(
    commands.map((cmd) => dispatchSingle(cmd))
  );

  return results.map((result, i) => {
    if (result.status === "fulfilled") return result.value;

    return {
      command_id: commands[i].id,
      app_name: commands[i].target_app,
      status: "error" as const,
      data: null,
      error: result.reason?.message ?? "Dispatch failed",
      duration_ms: 0,
    };
  });
}

async function dispatchSingle(
  command: SynapseCommand,
  attempt = 1
): Promise<CommandResponse> {
  const startTime = Date.now();
  const admin = createAdminClient();

  // Get the Synapse's Edge Function URL
  const functionName = `synapse-${command.target_app}`;

  try {
    // Try HTTP dispatch to Edge Function
    const { data, error } = await admin.functions.invoke(functionName, {
      body: {
        type: "command",
        command,
      },
    });

    if (error) throw new Error(error.message);

    const duration = Date.now() - startTime;

    return {
      command_id: command.id,
      app_name: command.target_app,
      status: "success",
      data: (data as Record<string, unknown>) ?? {},
      duration_ms: duration,
    };
  } catch (err) {
    const duration = Date.now() - startTime;

    // Check timeout
    if (duration >= command.timeout_ms) {
      return {
        command_id: command.id,
        app_name: command.target_app,
        status: "timeout",
        data: null,
        error: `Command timed out after ${command.timeout_ms}ms`,
        duration_ms: duration,
      };
    }

    // Retry with exponential backoff
    if (attempt < MAX_RETRIES) {
      const backoff = BACKOFF_BASE_MS * Math.pow(2, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, backoff));
      return dispatchSingle(command, attempt + 1);
    }

    return {
      command_id: command.id,
      app_name: command.target_app,
      status: "error",
      data: null,
      error: err instanceof Error ? err.message : "Unknown error",
      duration_ms: duration,
    };
  }
}
