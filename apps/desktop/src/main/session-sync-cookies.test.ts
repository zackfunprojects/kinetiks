import { describe, it, expect } from "vitest";
import type { Cookie } from "electron";
import {
  cookieAppliesToHost,
  cookieMirrorUrl,
  cookieToSetDetails,
  cookieSetParamsForMirror,
} from "./session-sync-cookies";

const APP = "https://id.kinetiks.ai";

function cookie(overrides: Partial<Cookie> & Pick<Cookie, "name" | "value">): Cookie {
  return { sameSite: "lax", ...overrides } as Cookie;
}

describe("cookieAppliesToHost", () => {
  it("matches a domain cookie against the host and its subdomains", () => {
    expect(cookieAppliesToHost({ domain: ".kinetiks.ai" }, "id.kinetiks.ai")).toBe(true);
    expect(cookieAppliesToHost({ domain: "kinetiks.ai" }, "id.kinetiks.ai")).toBe(true);
    expect(cookieAppliesToHost({ domain: "kinetiks.ai" }, "kinetiks.ai")).toBe(true);
  });

  it("requires an exact match for a hostOnly cookie", () => {
    expect(cookieAppliesToHost({ domain: "id.kinetiks.ai", hostOnly: true }, "id.kinetiks.ai")).toBe(true);
    expect(cookieAppliesToHost({ domain: "kinetiks.ai", hostOnly: true }, "id.kinetiks.ai")).toBe(false);
  });

  it("rejects unrelated domains and empty domains", () => {
    expect(cookieAppliesToHost({ domain: "evil.example" }, "id.kinetiks.ai")).toBe(false);
    expect(cookieAppliesToHost({ domain: "" }, "id.kinetiks.ai")).toBe(false);
    expect(cookieAppliesToHost({ domain: undefined }, "id.kinetiks.ai")).toBe(false);
  });
});

describe("cookieMirrorUrl", () => {
  it("builds scheme://host + cookie path", () => {
    expect(cookieMirrorUrl({ path: "/app" }, APP)).toBe("https://id.kinetiks.ai/app");
    expect(cookieMirrorUrl({ path: "" }, APP)).toBe("https://id.kinetiks.ai/");
    expect(cookieMirrorUrl({ path: undefined }, "http://localhost:3000")).toBe("http://localhost:3000/");
  });
});

describe("cookieToSetDetails", () => {
  it("preserves a domain cookie's attributes", () => {
    const out = cookieToSetDetails(
      cookie({
        name: "sb-ref-auth-token",
        value: "jwt",
        domain: ".kinetiks.ai",
        path: "/",
        secure: true,
        httpOnly: false,
        sameSite: "lax",
        expirationDate: 1893456000,
      }),
      APP,
    );
    expect(out).toEqual({
      url: "https://id.kinetiks.ai/",
      name: "sb-ref-auth-token",
      value: "jwt",
      domain: ".kinetiks.ai",
      path: "/",
      secure: true,
      httpOnly: false,
      sameSite: "lax",
      expirationDate: 1893456000,
    });
  });

  it("drops the domain for a hostOnly cookie so the url host scopes it", () => {
    const out = cookieToSetDetails(
      cookie({ name: "x", value: "1", domain: "id.kinetiks.ai", hostOnly: true, path: "/" }),
      APP,
    );
    expect(out.domain).toBeUndefined();
    expect(out.url).toBe("https://id.kinetiks.ai/");
  });
});

describe("cookieSetParamsForMirror", () => {
  it("keeps only app-origin cookies and maps them", () => {
    const cookies: Cookie[] = [
      cookie({ name: "sb-ref-auth-token.0", value: "a", domain: ".kinetiks.ai", path: "/" }),
      cookie({ name: "other", value: "b", domain: "evil.example", path: "/" }),
      cookie({ name: "host", value: "c", domain: "id.kinetiks.ai", hostOnly: true, path: "/" }),
    ];
    const out = cookieSetParamsForMirror(cookies, APP);
    expect(out.map((c) => c.name)).toEqual(["sb-ref-auth-token.0", "host"]);
    expect(out.every((c) => c.url === "https://id.kinetiks.ai/")).toBe(true);
  });

  it("matches on hostname, ignoring the port, so dev localhost works", () => {
    const out = cookieSetParamsForMirror(
      [cookie({ name: "x", value: "1", domain: "localhost", hostOnly: true, path: "/" })],
      "http://localhost:3000",
    );
    expect(out).toHaveLength(1);
    expect(out[0].url).toBe("http://localhost:3000/");
  });
});
