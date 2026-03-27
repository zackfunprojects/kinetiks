import { createAdminClient } from "@/lib/supabase/admin";
import { pullHarvestContext } from "@/lib/synapse/client";
import { makeCall, isTwilioConfigured } from "./twilio-client";
import { buildAgentPrompt, createConversationConfig, isElevenLabsConfigured } from "./elevenlabs-agent";
import { askClaude } from "@kinetiks/ai";
import { buildCallGoalContext, DEFAULT_OUTREACH_GOAL } from "@/types/outreach-goal";
import type { OutreachGoal } from "@/types/outreach-goal";

interface InitiateCallOptions {
  accountId: string;
  contactId: string;
  callType: string;
  objective: string;
  phoneFrom?: string;
  voiceId?: string;
}

interface CallRecord {
  id: string;
  contact_id: string;
  phone_from: string;
  phone_to: string;
  call_type: string;
  status: string;
  twilio_call_sid: string | null;
  elevenlabs_conversation_id: string | null;
}

/**
 * Initiate an AI-powered outbound call.
 *
 * Flow:
 * 1. Pull contact + org data from DB
 * 2. Pull Kinetiks context via Synapse (products, customers, competitive)
 * 3. Build ElevenLabs agent system prompt with all context
 * 4. Create Twilio call routed to ElevenLabs
 * 5. Create hv_calls record
 */
export async function initiateAiCall(options: InitiateCallOptions): Promise<CallRecord> {
  if (!isTwilioConfigured()) {
    throw new Error("Twilio is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER.");
  }
  if (!isElevenLabsConfigured()) {
    throw new Error("ElevenLabs is not configured. Set ELEVENLABS_API_KEY and ELEVENLABS_AGENT_ID.");
  }

  const admin = createAdminClient();

  // 1. Fetch contact and org
  const { data: contact, error: contactError } = await admin
    .from("hv_contacts")
    .select("*")
    .eq("id", options.contactId)
    .eq("kinetiks_id", options.accountId)
    .single();

  if (contactError || !contact) {
    throw new Error(`Contact not found: ${contactError?.message ?? "No data"}`);
  }

  const phone = contact.phone ?? contact.mobile_phone;
  if (!phone) {
    throw new Error("Contact has no phone number");
  }

  // Fetch org if available
  let orgName = "";
  if (contact.org_id) {
    const { data: org } = await admin
      .from("hv_organizations")
      .select("name")
      .eq("id", contact.org_id)
      .maybeSingle();
    orgName = org?.name ?? "";
  }

  // 2. Pull Kinetiks context
  const ctx = await pullHarvestContext(options.accountId, [
    "org", "products", "customers", "competitive",
  ]);

  // Safe cast: Kinetiks context layers follow Context Structure JSON schemas
  const orgData = (ctx?.layers?.org?.data ?? {}) as Record<string, string>;
  const productsData = (ctx?.layers?.products?.data ?? {}) as Record<string, unknown>;
  const customersData = (ctx?.layers?.customers?.data ?? {}) as Record<string, unknown>;
  const competitiveData = (ctx?.layers?.competitive?.data ?? {}) as Record<string, unknown>;

  // Extract product description
  const products = Array.isArray(productsData.products) ? productsData.products : [];
  const productDesc = products.length > 0
    // Safe cast: each product follows Products layer schema
    ? (products[0] as Record<string, unknown>).description as string ?? "Our product"
    : "Our product";

  // Extract pain points from matching persona
  const personas = Array.isArray(customersData.personas) ? customersData.personas : [];
  let painPoints: string[] = [];
  for (const p of personas) {
    // Safe cast: persona follows Customers layer persona schema
    const persona = p as Record<string, unknown>;
    if (Array.isArray(persona.pain_points)) {
      painPoints = persona.pain_points.map(String);
      break;
    }
  }

  // Extract competitive context
  const competitors = Array.isArray(competitiveData.competitors) ? competitiveData.competitors : [];
  const competitiveContext = competitors.length > 0
    // Safe cast: competitor follows Competitive layer schema
    ? competitors.map((c) => `${(c as Record<string, unknown>).name}: ${(c as Record<string, unknown>).positioning}`).join("; ")
    : "No known competitors";

  // 2b. Load outreach goal
  let outreachGoal: OutreachGoal = DEFAULT_OUTREACH_GOAL;
  const { data: configRow } = await admin
    .from("hv_accounts_config")
    .select("outreach_goal")
    .eq("kinetiks_id", options.accountId)
    .maybeSingle();
  if (configRow?.outreach_goal) {
    // Safe cast: outreach_goal is JSONB stored in our schema
    outreachGoal = configRow.outreach_goal as OutreachGoal;
  }

  // Check if prospect has engaged (any prior activity)
  const { count: engagementCount } = await admin
    .from("hv_activities")
    .select("id", { count: "exact", head: true })
    .eq("contact_id", options.contactId)
    .eq("kinetiks_id", options.accountId);
  const hasEngaged = (engagementCount ?? 0) > 0;

  const callGoalContext = buildCallGoalContext(outreachGoal, hasEngaged);

  // 3. Build agent prompt
  const systemPrompt = buildAgentPrompt({
    senderName: orgData.company_name ?? "Our team",
    senderCompany: orgData.company_name ?? "Our company",
    productDescription: productDesc,
    prospectName: `${contact.first_name ?? ""} ${contact.last_name ?? ""}`.trim(),
    prospectTitle: contact.title ?? "Unknown role",
    prospectCompany: orgName || "their company",
    callObjective: `${options.objective}\n\n${callGoalContext}`,
    painPoints,
    objectionHandling: "Listen carefully, acknowledge their concern, then share a relevant data point or customer story.",
    competitiveContext,
  });

  const firstName = contact.first_name ?? "there";
  const firstMessage = `Hi ${firstName}, this is a call from ${orgData.company_name ?? "our team"}. Do you have a moment to chat?`;

  // 4. Create conversation config
  const { agentId, conversationConfig } = await createConversationConfig({
    systemPrompt,
    firstMessage,
    voiceId: options.voiceId,
  });

  // Build the TwiML URL that bridges Twilio to ElevenLabs
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://hv.kinetiks.ai";
  const twimlUrl = `${baseUrl}/api/hv/calls/twiml?agent_id=${agentId}`;
  const statusCallbackUrl = `${baseUrl}/api/hv/calls/webhook`;

  // 5. Initiate Twilio call
  const call = await makeCall({
    to: phone,
    from: options.phoneFrom,
    twimlUrl,
    statusCallbackUrl,
    record: true,
  });

  // 6. Create call record
  const { data: callRecord, error: insertError } = await admin
    .from("hv_calls")
    .insert({
      kinetiks_id: options.accountId,
      contact_id: options.contactId,
      org_id: contact.org_id ?? null,
      phone_from: call.from,
      phone_to: call.to,
      call_type: options.callType,
      status: "in_progress",
      twilio_call_sid: call.sid,
      elevenlabs_agent_id: agentId,
      elevenlabs_conversation_config: conversationConfig,
      objective: options.objective,
    })
    .select("id, contact_id, phone_from, phone_to, call_type, status, twilio_call_sid, elevenlabs_conversation_id")
    .single();

  if (insertError || !callRecord) {
    throw new Error(`Failed to create call record: ${insertError?.message ?? "No data"}`);
  }

  // Log activity
  await admin.from("hv_activities").insert({
    kinetiks_id: options.accountId,
    contact_id: options.contactId,
    type: "call_initiated",
    content: `AI call initiated to ${phone} - objective: ${options.objective}`,
    metadata: { call_id: callRecord.id, twilio_sid: call.sid },
  }).then(null, (err: Error) => {
    console.error("Failed to log call activity:", err);
  });

  // Safe cast: Supabase select returns columns matching CallRecord interface
  return callRecord as unknown as CallRecord;
}

/**
 * Process a completed call: extract transcript, classify outcome, update record.
 */
export async function processCallComplete(options: {
  callId: string;
  accountId: string;
  twilioCallSid: string;
  duration: number;
}): Promise<void> {
  const admin = createAdminClient();

  // Fetch call record
  const { data: callRecord } = await admin
    .from("hv_calls")
    .select("*")
    .eq("id", options.callId)
    .eq("kinetiks_id", options.accountId)
    .single();

  if (!callRecord) return;

  // Try to get transcript from ElevenLabs if conversation ID exists
  let transcript = "";
  let keyMoments: Array<{ timestamp: number; summary: string }> = [];

  if (callRecord.elevenlabs_conversation_id) {
    try {
      const { getConversationTranscript } = await import("./elevenlabs-agent");
      const result = await getConversationTranscript(callRecord.elevenlabs_conversation_id);
      transcript = result.transcript;
    } catch (err) {
      console.error("Failed to get ElevenLabs transcript:", err);
    }
  }

  // Extract key moments via Claude Haiku
  if (transcript.length > 50) {
    try {
      const extraction = await askClaude(
        transcript,
        {
          model: "claude-haiku-4-5-20251001",
          system: "Extract 2-5 key moments from this call transcript. Return JSON array of objects with 'timestamp' (estimated seconds) and 'summary' (1 sentence). Focus on: interest signals, objections raised, commitments made, next steps agreed.",
          maxTokens: 500,
        },
      );

      const parsed = JSON.parse(extraction);
      if (Array.isArray(parsed)) {
        keyMoments = parsed;
      }
    } catch {
      // Key moment extraction is best-effort
    }
  }

  // Classify outcome
  let outcome = "connected";
  if (options.duration < 15) {
    outcome = "no_answer";
  } else if (transcript.toLowerCase().includes("voicemail") || transcript.toLowerCase().includes("leave a message")) {
    outcome = "voicemail";
  }

  // Update call record
  await admin
    .from("hv_calls")
    .update({
      status: "completed",
      duration_seconds: options.duration,
      transcript,
      key_moments: keyMoments,
      outcome,
      ended_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", options.callId);

  // Log activity
  await admin.from("hv_activities").insert({
    kinetiks_id: options.accountId,
    contact_id: callRecord.contact_id,
    type: "call_completed",
    content: `Call completed - ${outcome}, ${Math.round(options.duration / 60)}min`,
    metadata: {
      call_id: options.callId,
      outcome,
      duration: options.duration,
      key_moments_count: keyMoments.length,
    },
  }).then(null, (err: Error) => {
    console.error("Failed to log call completion:", err);
  });
}
