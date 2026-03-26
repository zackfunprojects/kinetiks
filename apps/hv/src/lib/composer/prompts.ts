/**
 * System prompts and tool definitions for email generation.
 * Ported from Bloomify claude.js, adapted for Kinetiks with knowledge module injection.
 */

import type { EmailStyleConfig } from "@/types/composer";
import type { HvContact, HvOrganization } from "@/types/contacts";

// ── Tool Definitions ─────────────────────────────────────────

export const RESEARCH_TOOL = {
  name: "company_research_brief" as const,
  description: "Generate a concise research brief about a target company for cold email personalization.",
  input_schema: {
    type: "object" as const,
    properties: {
      company_summary: {
        type: "string",
        description: "A 2-3 sentence summary of what this company does, focused on details relevant to the sender's product.",
      },
      personalization_hooks: {
        type: "array",
        items: { type: "string" },
        description: "2-3 specific details about the company that could be referenced in a cold email (e.g., recent growth, specific product features, market position, mission).",
      },
      relevance_angle: {
        type: "string",
        description: "One sentence explaining how the sender's product/service could be relevant to this company.",
      },
    },
    required: ["company_summary", "personalization_hooks", "relevance_angle"],
  },
};

export const EMAIL_TOOL = {
  name: "compose_email" as const,
  description: "Compose a personalized cold outreach email with subject line and HTML body.",
  input_schema: {
    type: "object" as const,
    properties: {
      subject: {
        type: "string",
        description: "Email subject line. Short, specific, under 60 characters. No emojis.",
      },
      body_html: {
        type: "string",
        description: "Email body as simple HTML. Use <p> tags for paragraphs. Include a greeting and a sign-off with the sender's name. Keep it concise.",
      },
    },
    required: ["subject", "body_html"],
  },
};

// ── Style Rules (from Bloomify) ──────────────────────────────

const TONE_RULES: Record<string, string> = {
  formal: "Use a professional, formal tone. Avoid slang or overly casual language.",
  conversational: "Use a warm, conversational tone. Sound human, not corporate.",
  casual: "Use a casual, friendly tone. Write like a colleague, not a salesperson.",
};

const LENGTH_RULES: Record<string, string> = {
  short: "Keep the body to 2-3 sentences maximum. Every word must earn its place.",
  medium: "Keep the body to 3-5 sentences. Short paragraphs.",
  detailed: "The body can be 5-7 sentences. Include more context and value proposition.",
};

const CTA_RULES: Record<string, string> = {
  meeting_request: 'End with a specific meeting request (e.g., "Do you have 15 minutes this week?").',
  quick_question: 'End with a low-friction question (e.g., "Worth a quick chat?" or "Is this on your radar?").',
  value_prop: 'End by offering a specific value (e.g., "Happy to share how we helped [similar company] with X.").',
  soft_intro: 'End with a soft intro (e.g., "Thought it was worth connecting." or "Would love to learn more about what you\'re building.").',
};

const GREETING_RULES: Record<string, string> = {
  first_name: 'Address the recipient by first name (e.g., "Hi Sarah,").',
  full_name: 'Address the recipient by full name (e.g., "Hi Sarah Chen,").',
  title_based: 'Address the recipient formally (e.g., "Dear Ms. Chen,").',
};

// ── Research Brief Prompt ────────────────────────────────────

export function buildResearchSystemPrompt(
  senderName: string,
  senderCompany: string,
  senderProduct: string
): string {
  return [
    "You are a B2B sales research analyst. Analyze the target company and produce a concise research brief that a sales rep can use to write a highly personalized cold email.",
    "",
    "ABOUT THE SENDER:",
    `Name: ${senderName || "Unknown"}`,
    `Company: ${senderCompany || "Unknown"}`,
    `Product: ${senderProduct || "Not specified"}`,
    "",
    "Focus your analysis on:",
    "- What the target company does and their market position",
    "- Specific details that could serve as email personalization hooks",
    "- How the sender's product could be relevant to this company's needs",
  ].join("\n");
}

export function buildResearchUserMessage(
  org: HvOrganization | null,
  contact: HvContact
): string {
  const lines: string[] = ["## Target Company"];

  if (org) {
    lines.push(`Name: ${org.name}`);
    if (org.domain) lines.push(`Website: ${org.domain}`);
    if (org.industry) lines.push(`Industry: ${org.industry}`);
    if (org.employee_count_range) lines.push(`Size: ${org.employee_count_range} employees`);
    const hq = [org.headquarters_city, org.headquarters_state, org.headquarters_country].filter(Boolean).join(", ");
    if (hq) lines.push(`Location: ${hq}`);
    if (org.tech_stack && org.tech_stack.length > 0) lines.push(`Tech stack: ${org.tech_stack.join(", ")}`);
  } else {
    lines.push(`Contact company: ${contact.title ? `works as ${contact.title}` : "Unknown company"}`);
  }

  lines.push("");
  lines.push("## Contact");
  lines.push(`Name: ${[contact.first_name, contact.last_name].filter(Boolean).join(" ")}`);
  if (contact.title) lines.push(`Title: ${contact.title}`);
  if (contact.seniority) lines.push(`Seniority: ${contact.seniority}`);
  if (contact.department) lines.push(`Department: ${contact.department}`);

  // Include selected enrichment fields (not the full blob)
  const enrichment = contact.enrichment_data as Record<string, unknown>;
  if (enrichment && Object.keys(enrichment).length > 0) {
    lines.push("");
    lines.push("## Additional Context");
    const safeFields = ["industry", "description", "company", "location", "founded", "website", "summary"];
    for (const key of safeFields) {
      if (enrichment[key] && typeof enrichment[key] === "string") {
        lines.push(`${key}: ${enrichment[key]}`);
      }
    }
  }

  return lines.join("\n");
}

// ── Email Generation Prompt ──────────────────────────────────

export function buildEmailSystemPrompt(params: {
  senderName: string;
  senderTitle: string;
  senderCompany: string;
  senderProduct: string;
  style: EmailStyleConfig;
  voiceLayer?: Record<string, unknown>;
  knowledgeContent?: string;
}): string {
  const { senderName, senderTitle, senderCompany, senderProduct, style, voiceLayer, knowledgeContent } = params;

  const lines: string[] = [
    "You are a B2B cold email copywriter. Write a personalized cold outreach email.",
    "",
    "ABOUT THE SENDER:",
    `Name: ${senderName || "Unknown"}`,
    `Title: ${senderTitle || "Unknown"}`,
    `Company: ${senderCompany || "Unknown"}`,
    `What they sell: ${senderProduct || "Not specified"}`,
    "",
  ];

  // Voice layer context from Kinetiks ID
  if (voiceLayer) {
    const tone = voiceLayer.tone as Record<string, number> | undefined;
    if (tone) {
      lines.push("BRAND VOICE (from the sender's Kinetiks ID):");
      if (tone.formality !== undefined) lines.push(`Formality: ${tone.formality}/100`);
      if (tone.warmth !== undefined) lines.push(`Warmth: ${tone.warmth}/100`);
      if (tone.humor !== undefined) lines.push(`Humor: ${tone.humor}/100`);
      if (tone.authority !== undefined) lines.push(`Authority: ${tone.authority}/100`);
      lines.push("Adapt the email tone to match these brand voice characteristics.");
      lines.push("");
    }

    const patterns = voiceLayer.messaging_patterns as Array<{ context: string; pattern: string }> | undefined;
    if (patterns && patterns.length > 0) {
      lines.push("MESSAGING PATTERNS:");
      for (const p of patterns.slice(0, 3)) {
        lines.push(`- ${p.context}: ${p.pattern}`);
      }
      lines.push("");
    }
  }

  // Knowledge module methodology
  if (knowledgeContent) {
    lines.push("METHODOLOGY (apply these frameworks to the email):");
    lines.push(knowledgeContent);
    lines.push("");
  }

  if (style.sample_email) {
    lines.push("REFERENCE EMAIL (match this tone and style):");
    lines.push(style.sample_email);
    lines.push("");
  }

  lines.push("RULES:");
  lines.push("- Reference something specific about the target company from the provided context.");
  lines.push(`- ${TONE_RULES[style.tone] || TONE_RULES.conversational}`);
  lines.push(`- ${LENGTH_RULES[style.length] || LENGTH_RULES.medium}`);
  lines.push(`- ${CTA_RULES[style.cta_style] || CTA_RULES.quick_question}`);
  lines.push(`- ${GREETING_RULES[style.greeting_style] || GREETING_RULES.first_name}`);

  if (style.address_both_contacts) {
    lines.push('- GREETING OVERRIDE: If there is a CC contact, address BOTH people in the greeting (e.g., "Hi Sarah and John,").');
  }

  if (style.reference_cc) {
    lines.push("- IMPORTANT: Mention the CC contact by name in the email body. Briefly explain why they are CC'd.");
  } else {
    lines.push("- Do NOT mention or address the CC contact in the body.");
  }

  if (style.include_ps) {
    lines.push("- Include a brief PS line at the end with a secondary hook or timely detail.");
  }

  lines.push('- Do NOT use "I hope this email finds you well" or similar filler openings.');
  lines.push('- Do NOT use the word "excited".');
  lines.push("- Maximum 1 exclamation point in the entire email.");
  lines.push("- Sign off with the sender's first name.");
  lines.push("- Sound human, not templated.");
  lines.push("- Subject line: short (under 60 chars), specific, not clickbaity. No emojis.");
  lines.push("- No em dashes. Use regular dashes only.");

  // Writing rules (mandatory overrides)
  if (style.writing_rules && style.writing_rules.length > 0) {
    lines.push("");
    lines.push("WRITING RULES (MANDATORY - follow every one of these exactly):");
    for (const rule of style.writing_rules) {
      lines.push(`- ${rule}`);
    }
  }

  // Personal style (highest priority override)
  if (style.personal_style) {
    lines.push("");
    lines.push("PERSONAL WRITING STYLE (CRITICAL - follow these exactly, they override any conflicting rules above):");
    lines.push(style.personal_style);
  }

  return lines.join("\n");
}

export function buildEmailUserMessage(params: {
  contact: HvContact;
  org: HvOrganization | null;
  ccContact?: HvContact | null;
  brief: { company_summary: string; personalization_hooks: string[]; relevance_angle: string };
  customersLayer?: Record<string, unknown>;
  competitiveLayer?: Record<string, unknown>;
}): string {
  const { contact, org, ccContact, brief, customersLayer, competitiveLayer } = params;

  const lines: string[] = [
    "Write a cold outreach email for this target:",
    "",
    "## Target Company",
  ];

  if (org) {
    lines.push(`Name: ${org.name}`);
    if (org.domain) lines.push(`Website: ${org.domain}`);
    if (org.industry) lines.push(`Industry: ${org.industry}`);
    if (org.employee_count_range) lines.push(`Size: ${org.employee_count_range} employees`);
  }

  lines.push("");
  lines.push("## Research Brief");
  lines.push(`Summary: ${brief.company_summary}`);
  lines.push("Personalization hooks:");
  for (const hook of brief.personalization_hooks) {
    lines.push(`- ${hook}`);
  }
  lines.push(`Relevance angle: ${brief.relevance_angle}`);

  lines.push("");
  lines.push("## Primary Contact (To)");
  lines.push(`Name: ${[contact.first_name, contact.last_name].filter(Boolean).join(" ")}`);
  if (contact.first_name) lines.push(`First name: ${contact.first_name}`);
  if (contact.title) lines.push(`Title: ${contact.title}`);

  if (ccContact) {
    lines.push("");
    lines.push("## Secondary Contact (CC)");
    lines.push(`Name: ${[ccContact.first_name, ccContact.last_name].filter(Boolean).join(" ")}`);
    if (ccContact.first_name) lines.push(`First name: ${ccContact.first_name}`);
    if (ccContact.title) lines.push(`Title: ${ccContact.title}`);
  }

  // Inject buyer persona context from Kinetiks ID
  if (customersLayer) {
    const personas = Array.isArray(customersLayer.personas) ? customersLayer.personas : [];
    if (personas.length > 0) {
      lines.push("");
      lines.push("## Known Buyer Personas (use to tailor pain points and angles)");
      for (const p of personas) {
        // Assertion: persona entries follow Context Structure customers schema (validated by Cortex)
        const persona = p as Record<string, unknown>;
        const parts: string[] = [];
        if (persona.name) parts.push(String(persona.name));
        if (persona.role) parts.push(`Role: ${persona.role}`);
        const pains = Array.isArray(persona.pain_points) ? persona.pain_points : [];
        if (pains.length > 0) parts.push(`Pain points: ${pains.join(", ")}`);
        const objections = Array.isArray(persona.objections) ? persona.objections : [];
        if (objections.length > 0) parts.push(`Common objections: ${objections.join(", ")}`);
        if (parts.length > 0) lines.push(`- ${parts.join(" | ")}`);
      }
    }
  }

  // Inject competitive context from Kinetiks ID
  if (competitiveLayer) {
    const competitors = Array.isArray(competitiveLayer.competitors) ? competitiveLayer.competitors : [];
    if (competitors.length > 0) {
      lines.push("");
      lines.push("## Competitive Context (differentiate from these)");
      for (const c of competitors) {
        // Assertion: competitor entries follow Context Structure competitive schema (validated by Cortex)
        const comp = c as Record<string, unknown>;
        if (comp.name) {
          const positioning = comp.positioning ? ` - ${comp.positioning}` : "";
          lines.push(`- ${comp.name}${positioning}`);
        }
      }
    }
  }

  return lines.join("\n");
}
