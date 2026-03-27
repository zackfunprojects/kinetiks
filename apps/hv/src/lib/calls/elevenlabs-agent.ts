import { ElevenLabsClient } from "elevenlabs";

const apiKey = process.env.ELEVENLABS_API_KEY;
const defaultAgentId = process.env.ELEVENLABS_AGENT_ID;

function getClient(): ElevenLabsClient {
  if (!apiKey) {
    throw new Error("ELEVENLABS_API_KEY must be set");
  }
  return new ElevenLabsClient({ apiKey });
}

/**
 * Build a system prompt for the AI calling agent using Kinetiks context.
 */
export function buildAgentPrompt(context: {
  senderName: string;
  senderCompany: string;
  productDescription: string;
  prospectName: string;
  prospectTitle: string;
  prospectCompany: string;
  callObjective: string;
  painPoints: string[];
  objectionHandling: string;
  competitiveContext: string;
}): string {
  const painPointList = context.painPoints.length > 0
    ? context.painPoints.map((p) => `- ${p}`).join("\n")
    : "- No specific pain points identified yet";

  return `You are calling on behalf of ${context.senderName} from ${context.senderCompany}.

## Your Product
${context.productDescription}

## Who You're Calling
Name: ${context.prospectName}
Title: ${context.prospectTitle}
Company: ${context.prospectCompany}

## Call Objective
${context.callObjective}

## Their Likely Pain Points
${painPointList}

## How to Handle Objections
${context.objectionHandling}

## Competitive Context
${context.competitiveContext}

## Rules
- Be conversational and natural, not scripted
- Introduce yourself by name and company within the first 10 seconds
- State the purpose of your call clearly and concisely
- Listen more than you talk - ask open-ended questions
- If you reach voicemail, leave a brief message (30 seconds max) with your name, company, one compelling reason to call back, and your phone number
- Never be pushy or aggressive
- If they're not interested, thank them for their time and end gracefully
- If they express interest, suggest a specific next step (meeting, demo, email with details)
- Never make claims you can't back up
- Keep the call under 5 minutes unless they want to continue`;
}

/**
 * Create a conversational AI agent configuration for a call.
 * Returns the agent config to be used with the ElevenLabs Conversational AI API.
 */
export function createConversationConfig(options: {
  systemPrompt: string;
  firstMessage: string;
  voiceId?: string;
  agentId?: string;
}): {
  agentId: string;
  conversationConfig: Record<string, unknown>;
} {
  const agentId = options.agentId ?? defaultAgentId;
  if (!agentId) {
    throw new Error("ELEVENLABS_AGENT_ID must be set or agentId provided");
  }

  return {
    agentId,
    conversationConfig: {
      agent: {
        prompt: {
          prompt: options.systemPrompt,
        },
        first_message: options.firstMessage,
        language: "en",
      },
      tts: {
        voice_id: options.voiceId ?? "21m00Tcm4TlvDq8ikWAM", // Rachel default
      },
    },
  };
}

/**
 * Get the transcript and metadata from a completed ElevenLabs conversation.
 */
export async function getConversationTranscript(conversationId: string): Promise<{
  transcript: string;
  duration: number;
  messages: Array<{ role: string; message: string; timestamp: number }>;
}> {
  const client = getClient();

  // Fetch conversation details from ElevenLabs
  // Safe cast via unknown: ElevenLabs SDK returns typed response but we need flexible field access for transcript extraction
  const conversation = await client.conversationalAi.getConversation(conversationId) as unknown as Record<string, unknown>;

  const messages: Array<{ role: string; message: string; timestamp: number }> = [];
  let fullTranscript = "";

  // Safe cast: analysis field contains transcript data per ElevenLabs API schema
  const analysis = conversation.analysis as Record<string, unknown> | undefined;
  const transcript = analysis?.transcript as string | undefined;

  if (transcript) {
    fullTranscript = transcript;
  }

  // Safe cast: conversation_turns contains the message history per ElevenLabs API
  const turns = conversation.conversation_turns as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(turns)) {
    for (const turn of turns) {
      messages.push({
        role: String(turn.role ?? "unknown"),
        message: String(turn.message ?? ""),
        timestamp: Number(turn.timestamp ?? 0),
      });
    }
  }

  return {
    transcript: fullTranscript,
    duration: Number(conversation.duration ?? 0),
    messages,
  };
}

/**
 * Check if ElevenLabs is configured.
 */
export function isElevenLabsConfigured(): boolean {
  return Boolean(apiKey && defaultAgentId);
}
