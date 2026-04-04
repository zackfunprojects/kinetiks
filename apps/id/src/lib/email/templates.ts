/**
 * Email templates for system communications.
 * Clean, minimal design matching Kinetiks brand.
 */

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
      <h2 style="margin:0 0 16px">Good morning</h2>
      <div style="margin-bottom:24px">
        <h3 style="font-size:14px;color:#8b949e;margin:0 0 8px">Goals</h3>
        <p style="margin:0;line-height:1.6">${escapeHtml(data.goalSummary)}</p>
      </div>
      <div style="margin-bottom:24px">
        <h3 style="font-size:14px;color:#8b949e;margin:0 0 8px">Top Insight</h3>
        <p style="margin:0;line-height:1.6">${escapeHtml(data.topInsight)}</p>
      </div>
      ${data.recommendation ? `
      <div style="margin-bottom:24px">
        <h3 style="font-size:14px;color:#8b949e;margin:0 0 8px">Recommendation</h3>
        <p style="margin:0;line-height:1.6">${escapeHtml(data.recommendation)}</p>
      </div>` : ""}
      ${data.approvalCount > 0 ? `
      <div style="padding:12px 16px;background:#161b22;border-radius:8px;margin-bottom:24px">
        <p style="margin:0;color:#58a6ff">${data.approvalCount} items awaiting your approval</p>
      </div>` : ""}
      <a href="${escapeHtml(data.appUrl)}/chat" style="display:inline-block;padding:10px 24px;background:#e6edf3;color:#0d1117;border-radius:8px;text-decoration:none;font-weight:500">Open ${escapeHtml(data.systemName)}</a>
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
  const severityColor = data.severity === "critical" ? "#f85149" : data.severity === "warning" ? "#d29922" : "#58a6ff";

  return {
    subject: `${data.systemName} Alert: ${data.alertTitle}`,
    html: wrapTemplate(data, `
      <div style="border-left:3px solid ${severityColor};padding-left:16px;margin-bottom:24px">
        <h2 style="margin:0 0 8px;color:${severityColor}">${escapeHtml(data.alertTitle)}</h2>
        <p style="margin:0;line-height:1.6">${escapeHtml(data.alertBody)}</p>
      </div>
      <a href="${escapeHtml(data.appUrl)}/analytics" style="display:inline-block;padding:10px 24px;background:#e6edf3;color:#0d1117;border-radius:8px;text-decoration:none;font-weight:500">View in Analytics</a>
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
      <h2 style="margin:0 0 8px">${escapeHtml(data.meetingTitle)}</h2>
      <p style="color:#8b949e;margin:0 0 16px">${escapeHtml(data.meetingTime)} - ${escapeHtml(data.attendees)}</p>
      <div style="margin-bottom:24px;line-height:1.6">${escapeHtml(data.prepBrief)}</div>
      <a href="${escapeHtml(data.appUrl)}/chat" style="display:inline-block;padding:10px 24px;background:#e6edf3;color:#0d1117;border-radius:8px;text-decoration:none;font-weight:500">Ask ${escapeHtml(data.systemName)} for more</a>
    `),
  };
}

function wrapTemplate(data: TemplateData, body: string): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#0d1117;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <div style="max-width:600px;margin:0 auto;padding:32px 24px">
    <div style="margin-bottom:24px">
      <span style="font-family:monospace;font-weight:700;font-size:13px;color:#3fb950">${data.systemName}</span>
    </div>
    <div style="color:#e6edf3;font-size:15px">
      ${body}
    </div>
    <div style="margin-top:32px;padding-top:16px;border-top:1px solid #21262d;font-size:12px;color:#484f58">
      Sent by ${data.systemName} via <a href="${data.appUrl}" style="color:#58a6ff;text-decoration:none">Kinetiks</a>
    </div>
  </div>
</body>
</html>`;
}
