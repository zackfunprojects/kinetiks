/**
 * Email templates for system communications.
 *
 * Email clients do not honor CSS variables. The hex values below match
 * the Paper (light) palette tokens in
 * `packages/ui/styles/kinetiks-tokens.css`. Update both files together
 * if the palette changes.
 */

/** Paper (light) palette values, inlined for email-client compatibility. */
const EMAIL_PALETTE = {
  bgBase: "#FCFBF8",         // --kt-bg-base
  bgSubtle: "#F6F4EE",       // --kt-bg-subtle
  bgInverse: "#0B0B0D",      // --kt-bg-inverse
  fg1: "#0A0A0B",            // --kt-fg-1
  fg2: "#3A3A3E",            // --kt-fg-2
  fg3: "#6B6B70",            // --kt-fg-3
  fg4: "#A0A0A5",            // --kt-fg-4
  fgOnInverse: "#F5F4F1",    // --kt-fg-on-inverse
  border1: "#E8E5DE",        // --kt-border-1
  accent: "#3D4FC4",         // --kt-accent
  success: "#3F7A5B",        // --kt-success
  warning: "#A87E2F",        // --kt-warning
  danger: "#9C3A2C",         // --kt-danger
} as const;

/** Escape HTML special characters to prevent XSS in email templates. */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

interface TemplateData {
  systemName: string;
  appUrl: string;
}

export function dailyBriefTemplate(
  data: TemplateData & {
    goalSummary: string;
    topInsight: string;
    recommendation: string;
    approvalCount: number;
  }
): { subject: string; html: string } {
  return {
    subject: `${data.systemName} - Daily Brief`,
    html: wrapTemplate(data, `
      <h2 style="margin:0 0 16px;color:${EMAIL_PALETTE.fg1}">Good morning</h2>
      <div style="margin-bottom:24px">
        <h3 style="font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:${EMAIL_PALETTE.fg3};margin:0 0 8px">Goals</h3>
        <p style="margin:0;line-height:1.6;color:${EMAIL_PALETTE.fg2}">${escapeHtml(data.goalSummary)}</p>
      </div>
      <div style="margin-bottom:24px">
        <h3 style="font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:${EMAIL_PALETTE.fg3};margin:0 0 8px">Top Insight</h3>
        <p style="margin:0;line-height:1.6;color:${EMAIL_PALETTE.fg2}">${escapeHtml(data.topInsight)}</p>
      </div>
      ${data.recommendation ? `
      <div style="margin-bottom:24px">
        <h3 style="font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:${EMAIL_PALETTE.fg3};margin:0 0 8px">Recommendation</h3>
        <p style="margin:0;line-height:1.6;color:${EMAIL_PALETTE.fg2}">${escapeHtml(data.recommendation)}</p>
      </div>` : ""}
      ${data.approvalCount > 0 ? `
      <div style="padding:12px 16px;background:${EMAIL_PALETTE.bgSubtle};border:1px solid ${EMAIL_PALETTE.border1};border-radius:8px;margin-bottom:24px">
        <p style="margin:0;color:${EMAIL_PALETTE.accent}">${data.approvalCount} items awaiting your approval</p>
      </div>` : ""}
      <a href="${escapeHtml(data.appUrl)}/chat" style="display:inline-block;padding:10px 24px;background:${EMAIL_PALETTE.bgInverse};color:${EMAIL_PALETTE.fgOnInverse};border-radius:8px;text-decoration:none;font-weight:500">Open ${escapeHtml(data.systemName)}</a>
    `),
  };
}

export function alertTemplate(
  data: TemplateData & {
    alertTitle: string;
    alertBody: string;
    severity: string;
  }
): { subject: string; html: string } {
  const severityColor =
    data.severity === "critical"
      ? EMAIL_PALETTE.danger
      : data.severity === "warning"
        ? EMAIL_PALETTE.warning
        : EMAIL_PALETTE.accent;

  return {
    subject: `${data.systemName} Alert: ${data.alertTitle}`,
    html: wrapTemplate(data, `
      <div style="border-left:3px solid ${severityColor};padding-left:16px;margin-bottom:24px">
        <h2 style="margin:0 0 8px;color:${severityColor}">${escapeHtml(data.alertTitle)}</h2>
        <p style="margin:0;line-height:1.6;color:${EMAIL_PALETTE.fg2}">${escapeHtml(data.alertBody)}</p>
      </div>
      <a href="${escapeHtml(data.appUrl)}/analytics" style="display:inline-block;padding:10px 24px;background:${EMAIL_PALETTE.bgInverse};color:${EMAIL_PALETTE.fgOnInverse};border-radius:8px;text-decoration:none;font-weight:500">View in Analytics</a>
    `),
  };
}

export function meetingPrepTemplate(
  data: TemplateData & {
    meetingTitle: string;
    meetingTime: string;
    attendees: string;
    prepBrief: string;
  }
): { subject: string; html: string } {
  return {
    subject: `${data.systemName} - Prep: ${data.meetingTitle}`,
    html: wrapTemplate(data, `
      <h2 style="margin:0 0 8px;color:${EMAIL_PALETTE.fg1}">${escapeHtml(data.meetingTitle)}</h2>
      <p style="color:${EMAIL_PALETTE.fg3};margin:0 0 16px">${escapeHtml(data.meetingTime)} - ${escapeHtml(data.attendees)}</p>
      <div style="margin-bottom:24px;line-height:1.6;color:${EMAIL_PALETTE.fg2}">${escapeHtml(data.prepBrief)}</div>
      <a href="${escapeHtml(data.appUrl)}/chat" style="display:inline-block;padding:10px 24px;background:${EMAIL_PALETTE.bgInverse};color:${EMAIL_PALETTE.fgOnInverse};border-radius:8px;text-decoration:none;font-weight:500">Ask ${escapeHtml(data.systemName)} for more</a>
    `),
  };
}

function wrapTemplate(data: TemplateData, body: string): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:${EMAIL_PALETTE.bgBase};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <div style="max-width:600px;margin:0 auto;padding:32px 24px">
    <div style="margin-bottom:24px">
      <span style="font-family:'DM Serif Display',Georgia,serif;font-weight:400;font-size:17px;color:${EMAIL_PALETTE.fg1}">${data.systemName}</span>
    </div>
    <div style="color:${EMAIL_PALETTE.fg1};font-size:15px">
      ${body}
    </div>
    <div style="margin-top:32px;padding-top:16px;border-top:1px solid ${EMAIL_PALETTE.border1};font-size:12px;color:${EMAIL_PALETTE.fg4}">
      Sent by ${data.systemName} via <a href="${data.appUrl}" style="color:${EMAIL_PALETTE.accent};text-decoration:none">Kinetiks</a>
    </div>
  </div>
</body>
</html>`;
}
