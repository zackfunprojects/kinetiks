import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

/**
 * App name to API path prefix mapping.
 * Each Kinetiks app uses a short prefix for its API routes.
 */
const APP_PREFIX_MAP: Record<string, string> = {
  harvest: "hv",
  dark_madder: "dm",
  hypothesis: "ht",
  litmus: "lt",
};

interface RouteContext {
  params: { app: string; path: string[] };
}

/**
 * Generic app proxy route.
 *
 * Forwards requests from id.kinetiks.ai/api/apps/{app}/{...path}
 * to the registered Synapse app URL: {app_url}/api/{prefix}/{...path}
 *
 * Auth: validates the user, looks up the active Synapse, then
 * forwards with INTERNAL_SERVICE_SECRET + X-Kinetiks-Account-Id header.
 *
 * This is the single gateway pattern - the MCP server only needs
 * to know about id.kinetiks.ai, and the ID routes to the right app.
 */
async function handleProxy(request: Request, { params }: RouteContext): Promise<Response> {
  const { auth, error } = await requireAuth(request, { allowInternal: true });
  if (error) return error;

  const { app, path } = params;
  const prefix = APP_PREFIX_MAP[app];

  if (!prefix) {
    return NextResponse.json(
      { success: false, error: `Unknown app: ${app}. Available: ${Object.keys(APP_PREFIX_MAP).join(", ")}` },
      { status: 404 }
    );
  }

  // Resolve account_id - internal auth uses __internal__, needs account_id from body/header
  let accountId = auth.account_id;
  if (accountId === "__internal__") {
    const headerAccountId = request.headers.get("x-kinetiks-account-id");
    if (!headerAccountId) {
      return NextResponse.json(
        { success: false, error: "X-Kinetiks-Account-Id header required for internal auth" },
        { status: 400 }
      );
    }
    accountId = headerAccountId;
  }

  // Verify Synapse is active for this account + app
  const admin = createAdminClient();
  const { data: synapse, error: synapseError } = await admin
    .from("kinetiks_synapses")
    .select("app_url, status")
    .eq("account_id", accountId)
    .eq("app_name", app)
    .eq("status", "active")
    .maybeSingle();

  if (synapseError) {
    return NextResponse.json(
      { success: false, error: `Failed to verify app: ${synapseError.message}` },
      { status: 500 }
    );
  }

  if (!synapse || !synapse.app_url) {
    return NextResponse.json(
      { success: false, error: `${app} is not activated for this account` },
      { status: 404 }
    );
  }

  // Build target URL
  const targetPath = `/api/${prefix}/${path.join("/")}`;
  const targetUrl = new URL(targetPath, synapse.app_url as string);

  // Forward query params
  const requestUrl = new URL(request.url);
  requestUrl.searchParams.forEach((value, key) => {
    targetUrl.searchParams.set(key, value);
  });

  // Forward the request with internal auth
  const serviceSecret = process.env.INTERNAL_SERVICE_SECRET;
  if (!serviceSecret) {
    return NextResponse.json(
      { success: false, error: "Proxy not configured: missing INTERNAL_SERVICE_SECRET" },
      { status: 500 }
    );
  }

  const headers: Record<string, string> = {
    "Authorization": `Bearer ${serviceSecret}`,
    "X-Kinetiks-Account-Id": accountId,
  };

  // Forward content-type from the original request when present
  const incomingContentType = request.headers.get("content-type");
  if (incomingContentType) {
    headers["Content-Type"] = incomingContentType;
  }

  // 30-second timeout via AbortController
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  // Build fetch options - stream body instead of buffering
  const fetchOptions: RequestInit = {
    method: request.method,
    headers,
    signal: controller.signal,
  };

  // Forward body for non-GET requests (stream raw body)
  if (request.method !== "GET" && request.method !== "HEAD") {
    fetchOptions.body = request.body;
    // @ts-expect-error -- Node fetch requires duplex for streaming request bodies
    fetchOptions.duplex = "half";
  }

  try {
    const response = await fetch(targetUrl.toString(), fetchOptions);
    clearTimeout(timeout);

    // Stream the response body back, forwarding upstream headers and status
    const responseHeaders = new Headers();
    const forwardHeaders = ["content-type", "content-length", "x-request-id"];
    for (const name of forwardHeaders) {
      const value = response.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }

    return new Response(response.body, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof DOMException && err.name === "AbortError") {
      return NextResponse.json(
        { success: false, error: `Request to ${app} timed out after 30s` },
        { status: 502 }
      );
    }
    const message = err instanceof Error ? err.message : "Proxy request failed";
    return NextResponse.json(
      { success: false, error: `Failed to reach ${app}: ${message}` },
      { status: 502 }
    );
  }
}

export const GET = handleProxy;
export const POST = handleProxy;
export const PATCH = handleProxy;
export const DELETE = handleProxy;
export const PUT = handleProxy;
