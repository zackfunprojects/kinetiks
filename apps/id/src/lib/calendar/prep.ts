import { askClaude } from "@kinetiks/ai";
import type { CalendarEvent } from "./events";

export interface MeetingPrep {
  meeting_title: string;
  meeting_time: string;
  attendee_summary: string;
  brief: string;
  talking_points: string[];
  questions_to_ask: string[];
}

/**
 * Generate a meeting prep brief using Claude.
 * Pulls context from Cortex, Harvest contacts, and recent interactions.
 */
export async function generateMeetingPrep(
  event: CalendarEvent,
  context: {
    attendeeContext?: string;
    recentInteractions?: string;
    cortexSummary?: string;
  }
): Promise<MeetingPrep> {
  const attendeeList = event.attendees.map((a) => a.name ?? a.email).join(", ");

  try {
    const result = await askClaude(
      `Meeting: ${event.title}\nTime: ${event.start}\nAttendees: ${attendeeList}\n${event.description ? `Description: ${event.description}\n` : ""}\n${context.attendeeContext ? `Known context about attendees:\n${context.attendeeContext}\n` : ""}${context.recentInteractions ? `Recent interactions:\n${context.recentInteractions}\n` : ""}${context.cortexSummary ? `Business context:\n${context.cortexSummary}\n` : ""}`,
      {
        system: `You generate concise meeting prep briefs for a GTM system. Respond with JSON: { "brief": string, "talking_points": string[], "questions_to_ask": string[] }. Brief should be 2-3 sentences. Talking points max 5. Questions max 3.`,
        model: "claude-haiku-4-5-20251001",
        maxTokens: 512,
      }
    );

    const parsed = JSON.parse(result);

    return {
      meeting_title: event.title,
      meeting_time: event.start,
      attendee_summary: attendeeList,
      brief: parsed.brief ?? "",
      talking_points: parsed.talking_points ?? [],
      questions_to_ask: parsed.questions_to_ask ?? [],
    };
  } catch {
    return {
      meeting_title: event.title,
      meeting_time: event.start,
      attendee_summary: attendeeList,
      brief: `Meeting with ${attendeeList}`,
      talking_points: [],
      questions_to_ask: [],
    };
  }
}
