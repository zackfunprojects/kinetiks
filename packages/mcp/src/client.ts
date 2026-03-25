/**
 * HTTP client for the Kinetiks API.
 * Wraps fetch with auth, envelope parsing, and error handling.
 */

const DEFAULT_BASE_URL = "https://id.kinetiks.ai";
const DEFAULT_TIMEOUT = 60_000;
const LONG_TIMEOUT = 120_000;
const USER_AGENT = "kinetiks-mcp/0.1.0";

interface ClientConfig {
  apiKey: string;
  baseUrl: string;
}

let config: ClientConfig | null = null;

export function initClient(): void {
  const apiKey = process.env.KINETIKS_API_KEY;
  if (!apiKey) {
    throw new Error(
      "KINETIKS_API_KEY environment variable is required. " +
        "Create an API key at id.kinetiks.ai/settings and set it in your MCP config."
    );
  }

  config = {
    apiKey,
    baseUrl: (process.env.KINETIKS_API_URL ?? DEFAULT_BASE_URL).replace(/\/$/, ""),
  };
}

function getConfig(): ClientConfig {
  if (!config) {
    throw new Error("Client not initialized. Call initClient() first.");
  }
  return config;
}

interface ApiEnvelope<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  details?: unknown;
  meta?: { page?: number; per_page?: number; total?: number };
}

export class KineticsApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: unknown
  ) {
    super(message);
    this.name = "KineticsApiError";
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  timeout: number = DEFAULT_TIMEOUT
): Promise<T> {
  const { apiKey, baseUrl } = getConfig();
  const url = `${baseUrl}${path}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    if (!response.ok && response.status >= 500) {
      throw new KineticsApiError(
        `Server error: ${response.status} ${response.statusText}`,
        response.status
      );
    }

    const envelope = (await response.json()) as ApiEnvelope<T>;

    if (!envelope.success) {
      throw new KineticsApiError(
        envelope.error ?? `Request failed with status ${response.status}`,
        response.status,
        envelope.details
      );
    }

    return envelope.data as T;
  } catch (err) {
    if (err instanceof KineticsApiError) throw err;
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new KineticsApiError(`Request timed out after ${timeout}ms`, 408);
    }
    throw new KineticsApiError(
      err instanceof Error ? err.message : "Unknown fetch error",
      0
    );
  } finally {
    clearTimeout(timer);
  }
}

export async function get<T>(path: string, params?: Record<string, string>): Promise<T> {
  let fullPath = path;
  if (params) {
    const qs = new URLSearchParams(params).toString();
    if (qs) fullPath += `?${qs}`;
  }
  return request<T>("GET", fullPath);
}

export async function post<T>(path: string, body: unknown): Promise<T> {
  return request<T>("POST", path, body);
}

export async function patch<T>(path: string, body: unknown): Promise<T> {
  return request<T>("PATCH", path, body);
}

export async function postLong<T>(path: string, body: unknown): Promise<T> {
  return request<T>("POST", path, body, LONG_TIMEOUT);
}

/**
 * Consume an SSE stream endpoint and return the assembled text response.
 * Used for Marcus chat which returns text/event-stream.
 */
export async function postSSE(
  path: string,
  body: unknown
): Promise<{ text: string; threadId: string; actions: unknown[] }> {
  const { apiKey, baseUrl } = getConfig();
  const url = `${baseUrl}${path}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LONG_TIMEOUT);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new KineticsApiError(
        `Marcus chat failed: ${response.status} - ${errorBody}`,
        response.status
      );
    }

    const threadId = response.headers.get("X-Thread-Id") ?? "";
    const reader = response.body?.getReader();
    if (!reader) throw new KineticsApiError("No response body", 500);

    const decoder = new TextDecoder();
    let buffer = "";
    let text = "";
    const actions: unknown[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const raw = line.slice(6).trim();
        if (!raw) continue;

        try {
          const event = JSON.parse(raw) as Record<string, unknown>;
          if (event.type === "text" && typeof event.text === "string") {
            text += event.text;
          } else if (event.type === "extraction" && Array.isArray(event.actions)) {
            actions.push(...(event.actions as unknown[]));
          } else if (event.type === "error" && typeof event.error === "string") {
            throw new KineticsApiError(event.error, 500);
          }
        } catch (parseErr) {
          if (parseErr instanceof KineticsApiError) throw parseErr;
          // Skip unparseable SSE lines
        }
      }
    }

    return { text, threadId, actions };
  } finally {
    clearTimeout(timer);
  }
}
