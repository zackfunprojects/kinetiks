import { createAdminClient } from "@/lib/supabase/admin";
import type {
  SynapseCommand,
  CommandResponse,
  CommandProgress,
} from "@kinetiks/synapse";

const MAX_RETRIES = 3;
const BACKOFF_BASE_MS = 1000;

export interface DispatchOptions {
  /** Receives a progress beat as each command starts and finishes (spec §7). */
  onProgress?: (progress: CommandProgress) => void;
  /**
   * Test/override seam: execute a single command. Defaults to the real HTTP
   * dispatch to the app's `synapse-{app}` Edge Function.
   */
  executor?: (command: SynapseCommand) => Promise<CommandResponse>;
}

/**
 * Order commands into sequential steps that honor `depends_on` (spec §3.4).
 * Commands within a step have no unmet dependencies and run in parallel; each
 * step waits for the previous one. Dependencies referencing ids outside this
 * plan are treated as already satisfied. Throws on a dependency cycle.
 */
export function planDispatchOrder(commands: SynapseCommand[]): SynapseCommand[][] {
  const byId = new Map<string, SynapseCommand>();
  for (const cmd of commands) {
    if (byId.has(cmd.id)) {
      throw new Error(`Duplicate command id in dispatch plan: ${cmd.id}`);
    }
    byId.set(cmd.id, cmd);
  }
  const remaining = new Set(commands.map((c) => c.id));
  const done = new Set<string>();
  const steps: SynapseCommand[][] = [];

  while (remaining.size > 0) {
    const ready = [...remaining].filter((id) => {
      const deps = byId.get(id)!.depends_on ?? [];
      // Only in-plan dependencies gate ordering.
      return deps.filter((d) => byId.has(d)).every((d) => done.has(d));
    });

    if (ready.length === 0) {
      throw new Error("Cyclic or unresolvable command dependencies");
    }

    steps.push(ready.map((id) => byId.get(id)!));
    for (const id of ready) {
      remaining.delete(id);
      done.add(id);
    }
  }

  return steps;
}

/** Inject the results of a command's dependencies into its context. */
function withPriorResults(
  command: SynapseCommand,
  responsesById: Map<string, CommandResponse>
): SynapseCommand {
  const deps = command.depends_on ?? [];
  if (deps.length === 0) return command;

  // Keyed by the producing command's id (not app name) so two dependencies
  // from the same app don't overwrite each other.
  const prior: Record<string, unknown> = {};
  for (const depId of deps) {
    const response = responsesById.get(depId);
    if (response?.data) prior[depId] = response.data;
  }
  if (Object.keys(prior).length === 0) return command;

  return {
    ...command,
    context: { ...command.context, prior_results: prior },
  };
}

/**
 * Dispatch commands to app Synapses, honoring `depends_on` ordering and
 * streaming progress. Independent commands run in parallel within a step;
 * dependent commands wait and receive their dependencies' results in context.
 * Returns responses in the original command order.
 */
export async function dispatchCommands(
  commands: SynapseCommand[],
  options: DispatchOptions = {}
): Promise<CommandResponse[]> {
  if (commands.length === 0) return [];

  const execute = options.executor ?? dispatchSingle;
  const steps = planDispatchOrder(commands);
  const responsesById = new Map<string, CommandResponse>();
  const total = commands.length;
  let completed = 0;

  for (const step of steps) {
    const settled = await Promise.allSettled(
      step.map((cmd) => {
        options.onProgress?.({
          command_id: cmd.id,
          app_name: cmd.target_app,
          step: "dispatching",
          progress: Math.round((completed / total) * 100),
          message: `Working on ${cmd.capability} in ${cmd.target_app}...`,
        });
        return execute(withPriorResults(cmd, responsesById));
      })
    );

    step.forEach((cmd, i) => {
      const result = settled[i];
      const response: CommandResponse =
        result.status === "fulfilled"
          ? result.value
          : {
              command_id: cmd.id,
              app_name: cmd.target_app,
              status: "error",
              data: null,
              error: result.reason?.message ?? "Dispatch failed",
              duration_ms: 0,
            };

      responsesById.set(cmd.id, response);
      completed++;
      options.onProgress?.({
        command_id: cmd.id,
        app_name: cmd.target_app,
        step: response.status === "success" ? "complete" : "failed",
        progress: Math.round((completed / total) * 100),
        message:
          response.status === "success"
            ? `${cmd.target_app} finished.`
            : `${cmd.target_app} failed: ${response.error ?? "unknown error"}`,
      });
    });
  }

  return commands.map((c) => responsesById.get(c.id)!);
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

    // Retry with exponential backoff - only if timeout budget allows
    if (attempt < MAX_RETRIES) {
      const backoff = BACKOFF_BASE_MS * Math.pow(2, attempt - 1);
      const elapsed = Date.now() - startTime;
      if (elapsed + backoff < command.timeout_ms) {
        await new Promise((resolve) => setTimeout(resolve, backoff));
        return dispatchSingle(command, attempt + 1);
      }
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
