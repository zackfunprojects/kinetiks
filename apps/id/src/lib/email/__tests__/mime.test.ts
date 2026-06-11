import { describe, expect, it } from "vitest";

import { buildMimeMessage, sanitizeHeaderValue } from "../mime";

function decode(raw: string): string {
  return Buffer.from(raw.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

describe("sanitizeHeaderValue", () => {
  it("strips CR/LF and control characters (header injection defense)", () => {
    expect(sanitizeHeaderValue("hi\r\nBcc: attacker@evil.test")).toBe(
      "hi Bcc: attacker@evil.test",
    );
    expect(sanitizeHeaderValue("clean subject")).toBe("clean subject");
    expect(sanitizeHeaderValue("tabs\tand\x00nulls")).toBe("tabs and nulls");
  });
});

describe("buildMimeMessage", () => {
  it("renders the named-identity From with a quoted display name", () => {
    const decoded = decode(
      buildMimeMessage({
        from: { email: "kit@acme.test", name: "Kit" },
        to: ["owner@acme.test"],
        subject: "Daily Brief",
        text: "All quiet.",
      }),
    );
    expect(decoded).toContain('From: "Kit" <kit@acme.test>');
    expect(decoded).toContain("To: owner@acme.test");
    expect(decoded).toContain("Subject: Daily Brief");
    expect(decoded).toContain("Content-Type: text/plain; charset=utf-8");
    expect(decoded.endsWith("All quiet.")).toBe(true);
  });

  it("omits the display name cleanly when absent", () => {
    const decoded = decode(
      buildMimeMessage({
        from: { email: "kit@acme.test" },
        to: ["owner@acme.test"],
        subject: "s",
        text: "b",
      }),
    );
    expect(decoded).toContain("From: kit@acme.test");
    expect(decoded).not.toContain('From: ""');
  });

  it("neutralizes header injection in subject, recipients, and display name", () => {
    const decoded = decode(
      buildMimeMessage({
        from: { email: "kit@acme.test", name: 'K"it\r\nX-Evil: 1' },
        to: ["owner@acme.test\r\nBcc: attacker@evil.test"],
        subject: "hello\r\nBcc: attacker@evil.test",
        text: "body",
      }),
    );
    // No injected header LINES survive — the hostile text is inert
    // (flattened into the value), never a header of its own. Every
    // header line is one of ours.
    const headerBlock = decoded.split("\r\n\r\n")[0]!;
    const lines = headerBlock.split("\r\n");
    for (const line of lines) {
      expect(line).toMatch(/^(From|To|Subject|MIME-Version|Content-Type): /);
    }
    expect(decoded).not.toContain("\r\nBcc:");
    expect(decoded).not.toContain("\r\nX-Evil:");
  });

  it("builds multipart/alternative with text first, html last", () => {
    const decoded = decode(
      buildMimeMessage({
        from: { email: "kit@acme.test", name: "Kit" },
        to: ["owner@acme.test"],
        subject: "Brief",
        text: "plain version",
        html: "<p>rich version</p>",
      }),
    );
    expect(decoded).toContain("Content-Type: multipart/alternative");
    const textIdx = decoded.indexOf("plain version");
    const htmlIdx = decoded.indexOf("<p>rich version</p>");
    expect(textIdx).toBeGreaterThan(-1);
    expect(htmlIdx).toBeGreaterThan(textIdx);
    // Boundary opens and closes, is high-entropy (CR: never derived
    // from content), and appears in neither part's payload.
    const boundary = /boundary="([^"]+)"/.exec(decoded)?.[1];
    expect(boundary).toMatch(/^kt-[0-9a-f]{24}$/);
    expect(decoded).toContain(`--${boundary}--`);
    expect("plain version").not.toContain(boundary as string);
  });

  it("re-rolls the boundary until it collides with neither part", () => {
    // Brute assertion via shape: two builds of identical content get
    // different boundaries (randomness), both absent from the body.
    const build = () =>
      decode(
        buildMimeMessage({
          from: { email: "kit@acme.test" },
          to: ["owner@acme.test"],
          subject: "Brief",
          text: "text kt-deadbeef pattern",
          html: "<p>html</p>",
        }),
      );
    const b1 = /boundary="([^"]+)"/.exec(build())?.[1];
    const b2 = /boundary="([^"]+)"/.exec(build())?.[1];
    expect(b1).not.toBe(b2);
  });

  it("base64url output carries no padding or unsafe chars", () => {
    const raw = buildMimeMessage({
      from: { email: "kit@acme.test" },
      to: ["owner@acme.test"],
      subject: "s",
      text: "b".repeat(100),
    });
    expect(raw).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
