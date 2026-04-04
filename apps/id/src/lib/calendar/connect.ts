/**
 * Calendar OAuth connection for Google Calendar and Microsoft Graph.
 */

export type CalendarProvider = "google" | "microsoft";

export function getCalendarAuthUrl(provider: CalendarProvider): string {
  if (provider === "google") {
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CALENDAR_CLIENT_ID ?? process.env.GOOGLE_EMAIL_CLIENT_ID ?? "",
      redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/connections/calendar/callback`,
      response_type: "code",
      scope: [
        "https://www.googleapis.com/auth/calendar.readonly",
        "https://www.googleapis.com/auth/calendar.events",
      ].join(" "),
      access_type: "offline",
      prompt: "consent",
      state: "google",
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }

  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_CALENDAR_CLIENT_ID ?? process.env.MICROSOFT_EMAIL_CLIENT_ID ?? "",
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/connections/calendar/callback`,
    response_type: "code",
    scope: "Calendars.Read Calendars.ReadWrite offline_access",
    state: "microsoft",
  });
  return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params}`;
}
