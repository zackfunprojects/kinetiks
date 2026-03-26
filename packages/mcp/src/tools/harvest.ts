import type { Tool, CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { get, post, postLong } from "../client.js";
import {
  formatEnrichResult,
  formatContacts,
  formatPairResult,
  formatResearchBrief,
  formatEmailDraft,
  formatDeals,
  formatDealCreated,
  formatGeneric,
} from "../formatters.js";

const BASE = "/api/apps/harvest";

export const harvestTools: Tool[] = [
  {
    name: "hv_enrich_domain",
    description:
      "Enrich a company domain to find contacts and company data. Uses PDL and Hunter APIs to discover employees with their titles, emails, and LinkedIn profiles. Results are saved to Harvest contacts and organizations.",
    inputSchema: {
      type: "object",
      properties: {
        domain: {
          type: "string",
          description: "Company domain to enrich (e.g. 'acme.com')",
        },
        title_keywords: {
          type: "array",
          items: { type: "string" },
          description: "Optional title keywords to filter contacts (e.g. ['VP Marketing', 'CMO']). If omitted, uses ICP personas from your Kinetiks ID.",
        },
      },
      required: ["domain"],
    },
  },
  {
    name: "hv_find_contacts",
    description:
      "Search and list contacts in Harvest. Filter by name, seniority, source, tags, or lead score. Returns paginated results.",
    inputSchema: {
      type: "object",
      properties: {
        q: { type: "string", description: "Search by name or email" },
        seniority: { type: "string", description: "Filter by seniority (c-level, executive, vp, director, manager)" },
        source: { type: "string", description: "Filter by source (pdl, hunter, manual)" },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Filter by tags (contacts matching any of the provided tags)",
        },
        lead_score_min: { type: "number", description: "Minimum lead score (0-100)" },
        page: { type: "number", description: "Page number (default: 1)" },
        per_page: { type: "number", description: "Results per page (default: 25, max: 100)" },
      },
      required: [],
    },
  },
  {
    name: "hv_pair_contacts",
    description:
      "AI-select the best primary (To) and secondary (CC) contacts for a cold email. Uses Claude to analyze candidates against ICP and pairing preferences.",
    inputSchema: {
      type: "object",
      properties: {
        candidates: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              title: { type: "string" },
              email: { type: "string" },
              seniority: { type: "string" },
            },
          },
          description: "List of candidate contacts to choose from",
        },
        sender: {
          type: "object",
          properties: {
            name: { type: "string" },
            title: { type: "string" },
            company: { type: "string" },
            product: { type: "string" },
          },
          description: "Sender info for context",
        },
        target_company: {
          type: "object",
          properties: {
            name: { type: "string" },
            website: { type: "string" },
            industry: { type: "string" },
            size: { type: "number" },
            description: { type: "string" },
          },
          description: "Target company details",
        },
        pairing_config: {
          type: "object",
          description: "Optional pairing preferences (primary_title_keywords, primary_seniority, etc.)",
        },
      },
      required: ["candidates", "sender", "target_company"],
    },
  },
  {
    name: "hv_research_contact",
    description:
      "Generate a research brief for a contact. Analyzes the contact's company, role, and recent activity to find personalization hooks and relevance angles for outreach.",
    inputSchema: {
      type: "object",
      properties: {
        contact_id: {
          type: "string",
          description: "UUID of the contact in Harvest",
        },
        tier: {
          type: "string",
          enum: ["brief", "deep"],
          description: "Research depth: 'brief' (quick) or 'deep' (thorough). Default: 'brief'",
        },
      },
      required: ["contact_id"],
    },
  },
  {
    name: "hv_generate_email",
    description:
      "Generate a cold outreach email for a contact using Claude. Uses the research brief, voice profile, buyer personas, and competitive context to craft personalized outreach.",
    inputSchema: {
      type: "object",
      properties: {
        contact_id: {
          type: "string",
          description: "UUID of the contact in Harvest",
        },
        research_brief: {
          type: "object",
          properties: {
            company_summary: { type: "string" },
            personalization_hooks: { type: "array", items: { type: "string" } },
            relevance_angle: { type: "string" },
          },
          description: "Research brief from hv_research_contact",
        },
        style: {
          type: "object",
          properties: {
            tone: { type: "string", description: "Email tone (casual, professional, bold)" },
            length: { type: "string", description: "Email length (short, medium, long)" },
            cta: { type: "string", description: "Call to action type" },
          },
          description: "Email style preferences",
        },
        cc_contact_id: {
          type: "string",
          description: "Optional UUID of a secondary contact to CC",
        },
      },
      required: ["contact_id", "research_brief", "style"],
    },
  },
  {
    name: "hv_list_deals",
    description:
      "List deals in the Harvest pipeline. Use kanban view for stage-grouped overview or table view for paginated list.",
    inputSchema: {
      type: "object",
      properties: {
        view: { type: "string", enum: ["kanban", "table"], description: "View mode (default: kanban)" },
        stage: { type: "string", description: "Filter by stage (prospecting, qualified, proposal, negotiation, closed_won, closed_lost)" },
        page: { type: "number", description: "Page number for table view (default: 1)" },
      },
      required: [],
    },
  },
  {
    name: "hv_create_deal",
    description:
      "Create a new deal in the Harvest pipeline.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Deal name (e.g. 'Acme Corp - Enterprise')" },
        contact_id: { type: "string", description: "UUID of the primary contact" },
        org_id: { type: "string", description: "UUID of the organization" },
        value: { type: "number", description: "Deal value in currency units" },
        currency: { type: "string", description: "Currency code (default: USD)" },
        stage: { type: "string", description: "Initial stage (default: prospecting)" },
        notes: { type: "string", description: "Deal notes" },
      },
      required: ["name"],
    },
  },
  {
    name: "hv_save_email",
    description:
      "Save an email draft to Harvest. Use after generating an email to persist it.",
    inputSchema: {
      type: "object",
      properties: {
        contact_id: { type: "string", description: "UUID of the contact" },
        subject: { type: "string", description: "Email subject line" },
        body: { type: "string", description: "Email body (HTML)" },
        cc_contact_id: { type: "string", description: "Optional CC contact UUID" },
        status: { type: "string", description: "Email status (default: draft)" },
      },
      required: ["contact_id", "subject", "body"],
    },
  },
];

export async function handleHarvestTool(
  name: string,
  args: Record<string, unknown>
): Promise<CallToolResult> {
  switch (name) {
    case "hv_enrich_domain": {
      if (typeof args.domain !== "string" || !args.domain.trim()) {
        return { content: [{ type: "text", text: "Error: domain is required" }], isError: true };
      }
      const payload: Record<string, unknown> = { domain: args.domain.trim() };
      if (Array.isArray(args.title_keywords)) {
        payload.title_keywords = args.title_keywords;
      }
      const result = await postLong<Record<string, unknown>>(`${BASE}/scout/enrich`, payload);
      return { content: [{ type: "text", text: formatEnrichResult(result) }] };
    }

    case "hv_find_contacts": {
      const params = new URLSearchParams();
      if (typeof args.q === "string") params.set("q", args.q);
      if (typeof args.seniority === "string") params.set("seniority", args.seniority);
      if (typeof args.source === "string") params.set("source", args.source);
      if (Array.isArray(args.tags) && args.tags.length > 0) {
        params.set("tags", (args.tags as string[]).join(","));
      }
      if (typeof args.lead_score_min === "number") params.set("lead_score_min", String(args.lead_score_min));
      if (typeof args.page === "number") params.set("page", String(args.page));
      if (typeof args.per_page === "number") params.set("per_page", String(args.per_page));
      const qs = params.toString();
      const result = await get<Record<string, unknown>>(`${BASE}/contacts${qs ? `?${qs}` : ""}`);
      return { content: [{ type: "text", text: formatContacts(result) }] };
    }

    case "hv_pair_contacts": {
      if (!Array.isArray(args.candidates) || args.candidates.length === 0) {
        return { content: [{ type: "text", text: "Error: candidates array is required" }], isError: true };
      }
      const payload: Record<string, unknown> = {
        candidates: args.candidates,
        sender: args.sender,
        target_company: args.target_company,
        pairing_config: args.pairing_config ?? { primary_seniority: "director", secondary_seniority: "c-suite" },
        use_ai: true,
      };
      const result = await post<Record<string, unknown>>(`${BASE}/scout/pair`, payload);
      return { content: [{ type: "text", text: formatPairResult(result) }] };
    }

    case "hv_research_contact": {
      if (typeof args.contact_id !== "string") {
        return { content: [{ type: "text", text: "Error: contact_id is required" }], isError: true };
      }
      const result = await post<Record<string, unknown>>(`${BASE}/composer/research`, {
        contact_id: args.contact_id,
        tier: args.tier ?? "brief",
      });
      return { content: [{ type: "text", text: formatResearchBrief(result) }] };
    }

    case "hv_generate_email": {
      if (typeof args.contact_id !== "string") {
        return { content: [{ type: "text", text: "Error: contact_id is required" }], isError: true };
      }
      if (!args.research_brief || typeof args.research_brief !== "object") {
        return { content: [{ type: "text", text: "Error: research_brief is required" }], isError: true };
      }
      if (!args.style || typeof args.style !== "object") {
        return { content: [{ type: "text", text: "Error: style is required" }], isError: true };
      }
      const payload: Record<string, unknown> = {
        contact_id: args.contact_id,
        research_brief: args.research_brief,
        style: args.style,
      };
      if (typeof args.cc_contact_id === "string") {
        payload.cc_contact_id = args.cc_contact_id;
      }
      const result = await postLong<Record<string, unknown>>(`${BASE}/composer/generate`, payload);
      return { content: [{ type: "text", text: formatEmailDraft(result) }] };
    }

    case "hv_list_deals": {
      const params = new URLSearchParams();
      if (typeof args.view === "string") params.set("view", args.view);
      if (typeof args.stage === "string") params.set("stage", args.stage);
      if (typeof args.page === "number") params.set("page", String(args.page));
      const qs = params.toString();
      const result = await get<Record<string, unknown>>(`${BASE}/deals${qs ? `?${qs}` : ""}`);
      return { content: [{ type: "text", text: formatDeals(result) }] };
    }

    case "hv_create_deal": {
      if (typeof args.name !== "string" || !args.name.trim()) {
        return { content: [{ type: "text", text: "Error: name is required" }], isError: true };
      }
      const payload: Record<string, unknown> = { name: args.name.trim() };
      if (typeof args.contact_id === "string") payload.contact_id = args.contact_id;
      if (typeof args.org_id === "string") payload.org_id = args.org_id;
      if (typeof args.value === "number") payload.value = args.value;
      if (typeof args.currency === "string") payload.currency = args.currency;
      if (typeof args.stage === "string") payload.stage = args.stage;
      if (typeof args.notes === "string") payload.notes = args.notes;
      const result = await post<Record<string, unknown>>(`${BASE}/deals`, payload);
      return { content: [{ type: "text", text: formatDealCreated(result) }] };
    }

    case "hv_save_email": {
      if (typeof args.contact_id !== "string") {
        return { content: [{ type: "text", text: "Error: contact_id is required" }], isError: true };
      }
      if (typeof args.subject !== "string" || typeof args.body !== "string") {
        return { content: [{ type: "text", text: "Error: subject and body are required" }], isError: true };
      }
      const payload: Record<string, unknown> = {
        contact_id: args.contact_id,
        subject: args.subject,
        body: args.body,
      };
      if (typeof args.cc_contact_id === "string") payload.cc_contact_id = args.cc_contact_id;
      if (typeof args.status === "string") payload.status = args.status;
      const result = await post<Record<string, unknown>>(`${BASE}/emails`, payload);
      return { content: [{ type: "text", text: `Email draft saved.\n\n${formatGeneric(result)}` }] };
    }

    default:
      return { content: [{ type: "text", text: `Unknown harvest tool: ${name}` }], isError: true };
  }
}
