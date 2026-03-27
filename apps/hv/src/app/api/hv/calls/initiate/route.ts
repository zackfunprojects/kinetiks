import { requireAuth } from "@/lib/auth/require-auth";
import { apiSuccess, apiError } from "@/lib/utils/api-response";
import { initiateAiCall } from "@/lib/calls/orchestrator";
import { isTwilioConfigured } from "@/lib/calls/twilio-client";
import { isElevenLabsConfigured } from "@/lib/calls/elevenlabs-agent";

/**
 * POST /api/hv/calls/initiate
 * Start an AI-powered outbound call to a contact.
 */
export async function POST(request: Request) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  // Check integrations are configured
  if (!isTwilioConfigured()) {
    return apiError("Twilio is not configured. Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER to your environment.", 503);
  }
  if (!isElevenLabsConfigured()) {
    return apiError("ElevenLabs is not configured. Add ELEVENLABS_API_KEY and ELEVENLABS_AGENT_ID to your environment.", 503);
  }

  try {
    const body = await request.json();

    if (!body.contact_id) {
      return apiError("contact_id is required", 400);
    }
    if (!body.objective) {
      return apiError("objective is required - describe what this call should accomplish", 400);
    }

    const callRecord = await initiateAiCall({
      accountId: auth.account_id,
      contactId: body.contact_id,
      callType: body.call_type ?? "outbound",
      objective: body.objective,
      phoneFrom: body.phone_from,
      voiceId: body.voice_id,
    });

    return apiSuccess(callRecord);
  } catch (err) {
    console.error("[HV Calls] Failed to initiate AI call:", err);
    return apiError(
      err instanceof Error ? err.message : "Failed to initiate call",
      500
    );
  }
}
