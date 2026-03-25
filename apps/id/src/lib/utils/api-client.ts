/**
 * Client-side API fetch helper.
 * Unwraps the { success, data, error } envelope so callers get
 * the inner data directly. Throws on error responses.
 */

export class ApiClientError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: unknown
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

interface ApiEnvelope<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  details?: unknown;
}

/**
 * Fetch from the Kinetiks API and unwrap the response envelope.
 * Returns the inner `data` on success, throws ApiClientError on failure.
 */
export async function apiFetch<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(path, options);
  const json = (await res.json()) as ApiEnvelope<T>;

  if (!res.ok || !json.success) {
    throw new ApiClientError(
      json.error ?? `Request failed with status ${res.status}`,
      res.status,
      json.details
    );
  }

  return json.data as T;
}

/**
 * Same as apiFetch but returns null on error instead of throwing.
 * Useful for non-critical fetches where you just want the data or null.
 */
export async function apiFetchSafe<T>(
  path: string,
  options?: RequestInit
): Promise<T | null> {
  try {
    return await apiFetch<T>(path, options);
  } catch {
    return null;
  }
}
