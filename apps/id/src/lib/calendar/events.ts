/**
 * Calendar event operations.
 */

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  attendees: { email: string; name?: string }[];
  location?: string;
  description?: string;
}

/**
 * Fetch upcoming events from Google Calendar.
 */
export async function getUpcomingEvents(
  accessToken: string,
  provider: "google" | "microsoft",
  hoursAhead = 24
): Promise<CalendarEvent[]> {
  const now = new Date().toISOString();
  const until = new Date(Date.now() + hoursAhead * 60 * 60 * 1000).toISOString();

  if (provider === "google") {
    const params = new URLSearchParams({
      timeMin: now,
      timeMax: until,
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "20",
    });

    const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) return [];
    const data = await res.json();

    return (data.items ?? []).map((e: Record<string, unknown>) => ({
      id: e.id as string,
      title: (e.summary as string) ?? "Untitled",
      start: (e.start as Record<string, string>)?.dateTime ?? (e.start as Record<string, string>)?.date ?? "",
      end: (e.end as Record<string, string>)?.dateTime ?? (e.end as Record<string, string>)?.date ?? "",
      attendees: ((e.attendees as Record<string, string>[]) ?? []).map((a) => ({
        email: a.email,
        name: a.displayName,
      })),
      location: e.location as string | undefined,
      description: e.description as string | undefined,
    }));
  }

  // Microsoft
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/me/calendarview?startDateTime=${now}&endDateTime=${until}&$orderby=start/dateTime&$top=20`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!res.ok) return [];
  const data = await res.json();

  return (data.value ?? []).map((e: Record<string, unknown>) => ({
    id: e.id as string,
    title: (e.subject as string) ?? "Untitled",
    start: (e.start as Record<string, string>)?.dateTime ?? "",
    end: (e.end as Record<string, string>)?.dateTime ?? "",
    attendees: ((e.attendees as Record<string, unknown>[]) ?? []).map((a) => ({
      email: (a.emailAddress as Record<string, string>)?.address,
      name: (a.emailAddress as Record<string, string>)?.name,
    })),
    location: (e.location as Record<string, string>)?.displayName,
    description: (e.bodyPreview as string) ?? undefined,
  }));
}
