import type { SynapseCommand, CommandResponse, SynapseCapabilities, CapabilityDefinition } from "./command-types";

/**
 * Base command handler that apps extend.
 * Each app implements handleCommand() and getCapabilities().
 */
export abstract class BaseCommandHandler {
  abstract appName: string;

  abstract getCapabilities(): CapabilityDefinition[];

  abstract handleCommand(command: SynapseCommand): Promise<CommandResponse>;

  /**
   * Health check - returns true if the handler is ready to process commands.
   */
  async ping(): Promise<boolean> {
    return true;
  }

  /**
   * Build the full capabilities object for registration.
   */
  buildCapabilities(): SynapseCapabilities {
    return {
      app_name: this.appName,
      version: "1.0.0",
      capabilities: this.getCapabilities(),
      registered_at: new Date().toISOString(),
    };
  }

  /**
   * Find a capability by name.
   */
  findCapability(name: string): CapabilityDefinition | undefined {
    return this.getCapabilities().find((c) => c.name === name);
  }

  /**
   * Build a success response.
   */
  protected success(commandId: string, data: Record<string, unknown>, durationMs: number): CommandResponse {
    return {
      command_id: commandId,
      app_name: this.appName,
      status: "success",
      data,
      duration_ms: durationMs,
    };
  }

  /**
   * Build an error response.
   */
  protected error(commandId: string, error: string, durationMs: number): CommandResponse {
    return {
      command_id: commandId,
      app_name: this.appName,
      status: "error",
      data: null,
      error,
      duration_ms: durationMs,
    };
  }
}
