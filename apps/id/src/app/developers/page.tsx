import React from "react";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Kinetiks for AI Agents - Developer Docs",
  description:
    "MCP server and API documentation for integrating AI agents with the Kinetiks ID platform.",
};

interface ToolEntry {
  category: string;
  name: string;
  desc: string;
  perm: string;
}

interface EndpointEntry {
  method: string;
  path: string;
  desc: string;
}

const TOOLS: ToolEntry[] = [
  { category: "Context", name: "get_context", desc: "All 8 layers + confidence scores", perm: "read-only" },
  { category: "Context", name: "get_context_layer", desc: "Single layer detail", perm: "read-only" },
  { category: "Context", name: "get_confidence", desc: "Confidence score breakdown", perm: "read-only" },
  { category: "Context", name: "get_schema", desc: "JSON Schema for any layer", perm: "read-only" },
  { category: "Context", name: "update_context", desc: "Deep merge update a layer", perm: "read-write" },
  { category: "Cartographer", name: "crawl_website", desc: "Crawl URL, extract into context", perm: "read-write" },
  { category: "Cartographer", name: "analyze_content", desc: "Analyze markdown/HTML content", perm: "read-write" },
  { category: "Cartographer", name: "submit_writing_sample", desc: "Analyze writing for voice", perm: "read-write" },
  { category: "Cartographer", name: "generate_calibration", desc: "A/B voice calibration exercises", perm: "read-write" },
  { category: "Cartographer", name: "submit_calibration_choice", desc: "Submit calibration choice", perm: "read-write" },
  { category: "Cartographer", name: "get_onboarding_question", desc: "Next adaptive onboarding question", perm: "read-write" },
  { category: "Cartographer", name: "submit_onboarding_answer", desc: "Answer onboarding question", perm: "read-write" },
  { category: "Cartographer", name: "onboard_me", desc: "Full automated onboarding in one call", perm: "read-write" },
  { category: "Approvals", name: "list_approvals", desc: "List proposals needing decisions", perm: "read-only" },
  { category: "Approvals", name: "resolve_proposal", desc: "Accept or decline a proposal", perm: "read-write" },
  { category: "Summary", name: "get_daily_brief", desc: "Pre-composed daily snapshot", perm: "read-only" },
  { category: "Summary", name: "get_context_summary", desc: "Compact context overview", perm: "read-only" },
  { category: "Connections", name: "list_connections", desc: "Data source status", perm: "read-only" },
  { category: "Marcus", name: "chat_with_marcus", desc: "Strategic advisor conversation", perm: "read-write" },
];

const ENDPOINTS: EndpointEntry[] = [
  { method: "GET", path: "/api/context", desc: "All layers + confidence" },
  { method: "GET", path: "/api/context/{layer}", desc: "Single layer data" },
  { method: "PATCH", path: "/api/context/{layer}", desc: "Deep merge update" },
  { method: "GET", path: "/api/context/confidence", desc: "Confidence scores" },
  { method: "GET", path: "/api/context/schema", desc: "Layer JSON schemas" },
  { method: "POST", path: "/api/cartographer/crawl", desc: "Crawl website" },
  { method: "POST", path: "/api/cartographer/analyze", desc: "Analyze content" },
  { method: "POST", path: "/api/cartographer/writing-sample", desc: "Voice analysis" },
  { method: "POST", path: "/api/cartographer/calibrate", desc: "Voice calibration" },
  { method: "POST", path: "/api/cartographer/conversation", desc: "Onboarding questions" },
  { method: "PATCH", path: "/api/account/onboarding-complete", desc: "Mark onboarding done" },
  { method: "GET", path: "/api/approvals", desc: "List proposals" },
  { method: "POST", path: "/api/approvals", desc: "Resolve proposals" },
  { method: "GET", path: "/api/summary/daily-brief", desc: "Daily snapshot" },
  { method: "GET", path: "/api/summary/context", desc: "Compact summary" },
  { method: "GET", path: "/api/connections", desc: "Data connections" },
  { method: "POST", path: "/api/marcus/chat", desc: "Marcus chat (SSE)" },
];

const s = {
  page: { minHeight: "100vh", background: "#0F0F1A", color: "#E8E8ED" },
  container: { maxWidth: 860, margin: "0 auto", padding: "60px 24px 120px" },
  nav: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "16px 24px", borderBottom: "1px solid rgba(255,255,255,0.08)",
  } as const,
  logo: { fontSize: 18, fontWeight: 700, color: "#6C5CE7", textDecoration: "none" },
  cta: {
    fontSize: 14, padding: "8px 20px", borderRadius: 8,
    background: "#6C5CE7", color: "#fff", textDecoration: "none",
  },
  hero: { textAlign: "center" as const, marginBottom: 80 },
  h1: { fontSize: 48, fontWeight: 700, lineHeight: 1.1, margin: "0 0 16px", color: "#fff" },
  accent: { color: "#00CEC9" },
  subtitle: { fontSize: 18, color: "#9B9BA7", maxWidth: 560, margin: "0 auto 40px" },
  code: {
    display: "block", background: "#1A1A2E", border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 12, padding: "20px 24px", fontFamily: "var(--font-mono, monospace)",
    fontSize: 13, lineHeight: 1.6, overflowX: "auto" as const, textAlign: "left" as const,
    color: "#C8C8D0", whiteSpace: "pre" as const, margin: "0 auto", maxWidth: 640,
  },
  section: { marginBottom: 64 },
  h2: { fontSize: 28, fontWeight: 700, color: "#fff", margin: "0 0 12px" },
  h3: { fontSize: 18, fontWeight: 600, color: "#fff", margin: "24px 0 8px" },
  p: { fontSize: 15, color: "#9B9BA7", lineHeight: 1.6, margin: "0 0 16px" },
  steps: { display: "grid" as const, gridTemplateColumns: "repeat(3, 1fr)", gap: 24 },
  step: {
    background: "#1A1A2E", borderRadius: 12, padding: 24,
    border: "1px solid rgba(255,255,255,0.06)",
  },
  stepNum: { fontSize: 32, fontWeight: 700, color: "#6C5CE7", margin: "0 0 8px" },
  stepTitle: { fontSize: 16, fontWeight: 600, color: "#fff", margin: "0 0 8px" },
  stepDesc: { fontSize: 14, color: "#9B9BA7", lineHeight: 1.5, margin: 0 },
  table: {
    width: "100%", borderCollapse: "collapse" as const, fontSize: 14,
    background: "#1A1A2E", borderRadius: 12, overflow: "hidden" as const,
  },
  th: {
    textAlign: "left" as const, padding: "12px 16px", fontSize: 12,
    fontWeight: 600, color: "#6B6B7B", textTransform: "uppercase" as const,
    letterSpacing: "0.05em", borderBottom: "1px solid rgba(255,255,255,0.06)",
  },
  td: {
    padding: "10px 16px", borderBottom: "1px solid rgba(255,255,255,0.04)",
    color: "#C8C8D0",
  },
  tdMono: {
    padding: "10px 16px", borderBottom: "1px solid rgba(255,255,255,0.04)",
    fontFamily: "var(--font-mono, monospace)", fontSize: 13, color: "#00CEC9",
  },
  badge: {
    display: "inline-block", fontSize: 11, padding: "2px 8px", borderRadius: 4,
    fontWeight: 600, background: "rgba(108,92,231,0.15)", color: "#6C5CE7",
  },
  badgeWrite: {
    display: "inline-block", fontSize: 11, padding: "2px 8px", borderRadius: 4,
    fontWeight: 600, background: "rgba(0,206,201,0.15)", color: "#00CEC9",
  },
  catRow: {
    padding: "10px 16px", background: "rgba(108,92,231,0.06)",
    borderBottom: "1px solid rgba(255,255,255,0.04)",
    fontSize: 12, fontWeight: 700, color: "#6C5CE7", textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
  },
  method: {
    display: "inline-block", fontSize: 11, fontWeight: 700, padding: "2px 6px",
    borderRadius: 4, fontFamily: "var(--font-mono, monospace)",
  },
} as const;

function MethodBadge({ method }: { method: string }): React.JSX.Element {
  const colors: Record<string, { bg: string; fg: string }> = {
    GET: { bg: "rgba(0,206,201,0.15)", fg: "#00CEC9" },
    POST: { bg: "rgba(108,92,231,0.15)", fg: "#6C5CE7" },
    PATCH: { bg: "rgba(253,203,110,0.15)", fg: "#FDCB6E" },
  };
  const c = colors[method] ?? colors.GET;
  return <span style={{ ...s.method, background: c.bg, color: c.fg }}>{method}</span>;
}

export default function DevelopersPage(): React.JSX.Element {
  // Group tools by category for the table
  let lastCategory = "";

  return (
    <div style={s.page}>
      <nav style={s.nav}>
        <Link href="/" style={s.logo}>Kinetiks</Link>
        <Link href="/signup" style={s.cta}>Get Started</Link>
      </nav>

      <div style={s.container}>
        {/* Hero */}
        <div style={s.hero}>
          <h1 style={s.h1}>
            Kinetiks for{" "}
            <span style={s.accent}>AI Agents</span>
          </h1>
          <p style={s.subtitle}>
            Native MCP server for the Kinetiks ID platform.
            Give your AI agent full access to business context, onboarding,
            voice calibration, and strategic intelligence. One tool call to onboard.
          </p>
          <pre style={s.code}>{`{
  "mcpServers": {
    "kinetiks": {
      "command": "npx",
      "args": ["@kinetiks/mcp"],
      "env": {
        "KINETIKS_API_KEY": "kntk_your_key_here"
      }
    }
  }
}`}</pre>
        </div>

        {/* Quick Start */}
        <div style={s.section}>
          <h2 style={s.h2}>Quick Start</h2>
          <div style={s.steps}>
            <div style={s.step}>
              <p style={s.stepNum}>1</p>
              <p style={s.stepTitle}>Create your Kinetiks ID</p>
              <p style={s.stepDesc}>
                Sign up at id.kinetiks.ai. A bootstrap API key (kntk_) is generated automatically - copy it from the welcome screen.
              </p>
            </div>
            <div style={s.step}>
              <p style={s.stepNum}>2</p>
              <p style={s.stepTitle}>Connect your agent</p>
              <p style={s.stepDesc}>
                Add the MCP config to Claude Code or any MCP client. Paste in your bootstrap key. 19 tools available instantly.
              </p>
            </div>
            <div style={s.step}>
              <p style={s.stepNum}>3</p>
              <p style={s.stepTitle}>Onboard in one call</p>
              <p style={s.stepDesc}>
                Tell your agent: &quot;onboard my business at example.com&quot; - it crawls, calibrates voice, and completes setup automatically.
              </p>
            </div>
          </div>
        </div>

        {/* MCP Config */}
        <div style={s.section}>
          <h2 style={s.h2}>Configuration</h2>
          <p style={s.p}>
            Add to your Claude Code settings or claude_desktop_config.json:
          </p>
          <pre style={s.code}>{`// Claude Code: .claude/settings.json
{
  "mcpServers": {
    "kinetiks": {
      "command": "npx",
      "args": ["@kinetiks/mcp"],
      "env": {
        "KINETIKS_API_KEY": "kntk_your_key_here",
        "KINETIKS_API_URL": "https://id.kinetiks.ai"
      }
    }
  }
}`}</pre>
          <p style={{ ...s.p, marginTop: 16 }}>
            Or install globally: <code style={{ color: "#00CEC9" }}>npm install -g @kinetiks/mcp</code>
          </p>
        </div>

        {/* Available Tools */}
        <div style={s.section}>
          <h2 style={s.h2}>Available Tools</h2>
          <p style={s.p}>19 tools across 6 categories. All accessible via MCP tool calls.</p>
          <div style={{ borderRadius: 12, overflow: "hidden", border: "1px solid rgba(255,255,255,0.06)" }}>
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>Tool</th>
                  <th style={s.th}>Description</th>
                  <th style={s.th}>Permission</th>
                </tr>
              </thead>
              <tbody>
                {TOOLS.map((tool) => {
                  const showCategory = tool.category !== lastCategory;
                  lastCategory = tool.category;
                  return (
                    <React.Fragment key={tool.name}>
                      {showCategory && (
                        <tr>
                          <td colSpan={3} style={s.catRow}>{tool.category}</td>
                        </tr>
                      )}
                      <tr>
                        <td style={s.tdMono}>{tool.name}</td>
                        <td style={s.td}>{tool.desc}</td>
                        <td style={s.td}>
                          <span style={tool.perm === "read-write" ? s.badgeWrite : s.badge}>
                            {tool.perm}
                          </span>
                        </td>
                      </tr>
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Authentication */}
        <div style={s.section}>
          <h2 style={s.h2}>Authentication</h2>
          <h3 style={s.h3}>API Keys</h3>
          <p style={s.p}>
            A bootstrap read-write key (kntk_) is generated automatically when you create an account -
            copy it from the welcome screen. You can also create additional keys from Settings.
            Keys are hashed (SHA-256) before storage and shown exactly once.
          </p>
          <h3 style={s.h3}>Permission Levels</h3>
          <p style={s.p}>
            <strong style={{ color: "#fff" }}>read-only</strong> - read context, list approvals, view connections.{" "}
            <strong style={{ color: "#fff" }}>read-write</strong> - everything read-only can do plus write context, crawl, approve proposals, chat.{" "}
            <strong style={{ color: "#fff" }}>admin</strong> - everything plus manage API keys and billing.
          </p>
          <h3 style={s.h3}>Rate Limits</h3>
          <p style={s.p}>
            Per-key configurable. Defaults: 60/minute, 10,000/day.
            Rate limit info returned in X-RateLimit-* response headers. 429 on exceeded.
          </p>
          <h3 style={s.h3}>App Scopes</h3>
          <p style={s.p}>
            Keys can be scoped to specific apps (dark_madder, harvest, hypothesis, litmus).
            Empty scope means access to all. Scope is enforced per-request.
          </p>
        </div>

        {/* API Reference */}
        <div style={s.section}>
          <h2 style={s.h2}>API Endpoints</h2>
          <p style={s.p}>
            The MCP server wraps these endpoints. You can also call them directly with curl.
          </p>
          <div style={{ borderRadius: 12, overflow: "hidden", border: "1px solid rgba(255,255,255,0.06)" }}>
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>Method</th>
                  <th style={s.th}>Path</th>
                  <th style={s.th}>Description</th>
                </tr>
              </thead>
              <tbody>
                {ENDPOINTS.map((ep) => (
                  <tr key={`${ep.method}-${ep.path}`}>
                    <td style={s.td}><MethodBadge method={ep.method} /></td>
                    <td style={s.tdMono}>{ep.path}</td>
                    <td style={s.td}>{ep.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Example Walkthrough */}
        <div style={s.section}>
          <h2 style={s.h2}>Example: Onboard in One Call</h2>
          <p style={s.p}>
            The fastest way to set up a Kinetiks ID. One tool call handles everything:
          </p>
          <pre style={s.code}>{`> "Onboard my business at example.com"

Claude uses: onboard_me({ url: "example.com" })

  Step 1: Website Crawl
  Crawled example.com - 12 proposals submitted.
  Extracted layers: org, products, voice, brand, narrative

  Step 2: Adaptive Questions
  Q1: Who is your primary customer? -> updated: customers
  Q2: What problem does your product solve? -> updated: products, narrative
  Q3: How do you position against competitors? -> updated: competitive

  Step 3: Voice Calibration
  Calibrated 4/4 voice dimensions.

  Completing Onboarding
  Onboarding marked complete.

  Confidence Scores
  Aggregate: 58%
  Org: 72% | Products: 65% | Voice: 48%
  Customers: 55% | Brand: 61% | Narrative: 44%`}</pre>
          <p style={{ ...s.p, marginTop: 16 }}>
            Want more control? Use the individual tools (crawl_website, get_onboarding_question,
            generate_calibration) to run each step manually.
          </p>
        </div>

        {/* Footer */}
        <div style={{ textAlign: "center", color: "#6B6B7B", fontSize: 14, marginTop: 80 }}>
          <p>
            <Link href="/signup" style={{ color: "#6C5CE7", textDecoration: "none" }}>Create your Kinetiks ID</Link>
            {" "}-{" "}
            <Link href="/" style={{ color: "#6C5CE7", textDecoration: "none" }}>kinetiks.ai</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
