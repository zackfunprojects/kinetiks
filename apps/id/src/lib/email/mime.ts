/**
 * Shared RFC 2822 MIME composition for the Gmail dispatchers — D2.
 *
 * Extracted from draft-via-google.ts so the draft path (draft_email
 * tool) and the send path (lib/email/sender.ts) compose messages
 * through one hardened builder instead of two drifting copies.
 *
 * SECURITY: every header value passes through sanitizeHeaderValue
 * before composition. CR/LF in subject/to/cc/from would otherwise let
 * a caller inject additional headers (`Bcc: attacker@...`, or full
 * body splicing). Strip control chars + trim — RFC 2822 header values
 * forbid bare CR/LF entirely, so this is lossless for legitimate
 * input. Per CLAUDE.md "Never trust client input."
 */

import "server-only";

import { randomBytes } from "node:crypto";

/**
 * Strip CR/LF and other control characters from header values before
 * MIME composition.
 */
export function sanitizeHeaderValue(value: string): string {
  return value
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1F\x7F]+/g, " ")
    .trim();
}

export interface MimeFrom {
  email: string;
  /**
   * Display name — the customer's chosen system name. Rendered as
   * `"Name" <email>` (quoted, sanitized) so the inbox shows the named
   * identity, per comms spec §2.3.
   */
  name?: string | null;
}

export interface BuildMimeMessageInput {
  from: MimeFrom;
  to: string[];
  cc?: string[];
  subject: string;
  /** Plain-text body. Required — it is the fallback part for HTML. */
  text: string;
  /** Optional HTML body; when present the message is multipart/alternative. */
  html?: string;
}

function formatFrom(from: MimeFrom): string {
  const email = sanitizeHeaderValue(from.email);
  const name = from.name ? sanitizeHeaderValue(from.name) : "";
  if (!name) return email;
  // Quoted display-name; strip embedded double quotes rather than
  // escaping them — header-safe and visually identical for names.
  return `"${name.replace(/"/g, "")}" <${email}>`;
}

/**
 * Compose the full RFC 2822 message and return it base64url-encoded,
 * ready for the Gmail API's `raw` field.
 */
export function buildMimeMessage(input: BuildMimeMessageInput): string {
  const headers: string[] = [
    `From: ${formatFrom(input.from)}`,
    `To: ${input.to.map(sanitizeHeaderValue).join(", ")}`,
  ];
  if (input.cc && input.cc.length > 0) {
    headers.push(`Cc: ${input.cc.map(sanitizeHeaderValue).join(", ")}`);
  }
  headers.push(`Subject: ${sanitizeHeaderValue(input.subject)}`);
  headers.push("MIME-Version: 1.0");

  let raw: string;
  if (input.html) {
    // multipart/alternative: text part first (lowest fidelity), HTML
    // last, per RFC 2046 §5.1.4 ordering. The boundary is
    // high-entropy and re-rolled until it appears in neither part
    // (CR: a content-derived boundary could collide with the body
    // and break MIME parsing).
    let boundary = `kt-${randomBytes(12).toString("hex")}`;
    while (input.text.includes(boundary) || input.html.includes(boundary)) {
      boundary = `kt-${randomBytes(12).toString("hex")}`;
    }
    headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    raw = [
      headers.join("\r\n"),
      "",
      `--${boundary}`,
      "Content-Type: text/plain; charset=utf-8",
      "",
      input.text,
      `--${boundary}`,
      "Content-Type: text/html; charset=utf-8",
      "",
      input.html,
      `--${boundary}--`,
      "",
    ].join("\r\n");
  } else {
    headers.push("Content-Type: text/plain; charset=utf-8");
    raw = `${headers.join("\r\n")}\r\n\r\n${input.text}`;
  }

  return Buffer.from(raw, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
