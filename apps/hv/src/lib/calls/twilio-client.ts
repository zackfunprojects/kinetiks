import twilio from "twilio";
import type { CallInstance } from "twilio/lib/rest/api/v2010/account/call";

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const phoneNumber = process.env.TWILIO_PHONE_NUMBER;

function getClient(): twilio.Twilio {
  if (!accountSid || !authToken) {
    throw new Error("TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN must be set");
  }
  return twilio(accountSid, authToken);
}

/**
 * Initiate an outbound call via Twilio.
 * The call connects the recipient to a TwiML endpoint that bridges to ElevenLabs.
 */
export async function makeCall(options: {
  to: string;
  from?: string;
  twimlUrl: string;
  statusCallbackUrl?: string;
  record?: boolean;
}): Promise<CallInstance> {
  const client = getClient();
  const call = await client.calls.create({
    to: options.to,
    from: options.from ?? phoneNumber ?? "",
    url: options.twimlUrl,
    statusCallback: options.statusCallbackUrl,
    statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
    statusCallbackMethod: "POST",
    record: options.record ?? true,
    recordingStatusCallback: options.statusCallbackUrl,
    recordingStatusCallbackMethod: "POST",
  });
  return call;
}

/**
 * Get the current status of a call.
 */
export async function getCallStatus(callSid: string): Promise<CallInstance> {
  const client = getClient();
  return client.calls(callSid).fetch();
}

/**
 * Get recording URLs for a completed call.
 */
export async function getRecordings(callSid: string): Promise<Array<{
  sid: string;
  duration: string;
  uri: string;
}>> {
  const client = getClient();
  const recordings = await client.calls(callSid).recordings.list();
  return recordings.map((r) => ({
    sid: r.sid,
    duration: r.duration,
    uri: `https://api.twilio.com${r.uri.replace(".json", ".mp3")}`,
  }));
}

/**
 * Check if Twilio credentials are configured.
 */
export function isTwilioConfigured(): boolean {
  return Boolean(accountSid && authToken && phoneNumber);
}
