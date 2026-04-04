import { createAdminClient } from "@/lib/supabase/admin";

export type EmailProvider = "google" | "microsoft";

interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/**
 * Generate OAuth authorization URL for email provider.
 */
export function getAuthUrl(provider: EmailProvider): string {
  if (provider === "google") {
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_EMAIL_CLIENT_ID ?? "",
      redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/connections/email/callback`,
      response_type: "code",
      scope: [
        "https://www.googleapis.com/auth/gmail.send",
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/gmail.modify",
      ].join(" "),
      access_type: "offline",
      prompt: "consent",
      state: "google",
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }

  // Microsoft
  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_EMAIL_CLIENT_ID ?? "",
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/connections/email/callback`,
    response_type: "code",
    scope: "Mail.Send Mail.Read Mail.ReadWrite offline_access",
    state: "microsoft",
  });
  return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params}`;
}

/**
 * Exchange authorization code for tokens.
 */
export async function exchangeCode(
  provider: EmailProvider,
  code: string
): Promise<{ access_token: string; refresh_token: string; email: string }> {
  if (provider === "google") {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_EMAIL_CLIENT_ID ?? "",
        client_secret: process.env.GOOGLE_EMAIL_CLIENT_SECRET ?? "",
        redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/connections/email/callback`,
        grant_type: "authorization_code",
      }),
    });
    const data = await res.json();

    // Get email address from profile
    const profileRes = await fetch("https://www.googleapis.com/gmail/v1/users/me/profile", {
      headers: { Authorization: `Bearer ${data.access_token}` },
    });
    const profile = await profileRes.json();

    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      email: profile.emailAddress,
    };
  }

  // Microsoft
  const res = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.MICROSOFT_EMAIL_CLIENT_ID ?? "",
      client_secret: process.env.MICROSOFT_EMAIL_CLIENT_SECRET ?? "",
      redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/connections/email/callback`,
      grant_type: "authorization_code",
    }),
  });
  const data = await res.json();

  // Get email from profile
  const profileRes = await fetch("https://graph.microsoft.com/v1.0/me", {
    headers: { Authorization: `Bearer ${data.access_token}` },
  });
  const profile = await profileRes.json();

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    email: profile.mail ?? profile.userPrincipalName,
  };
}

/**
 * Store email credentials in system identity.
 */
export async function storeEmailCredentials(
  accountId: string,
  provider: EmailProvider,
  email: string,
  tokens: { access_token: string; refresh_token: string }
): Promise<void> {
  const admin = createAdminClient();

  await admin
    .from("kinetiks_system_identity")
    .upsert(
      {
        account_id: accountId,
        email_provider: provider,
        email_address: email,
        email_credentials: {
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          updated_at: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "account_id" }
    );
}
