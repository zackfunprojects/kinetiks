import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiSuccess, apiError } from "@/lib/utils/api-response";
import { pullHarvestContext } from "@/lib/synapse/client";
import { askClaude } from "@kinetiks/ai";
import { DEFAULT_OUTREACH_GOAL } from "@/types/outreach-goal";
import type { OutreachGoal } from "@/types/outreach-goal";
import type { TemplateCategory } from "@/types/templates";

/**
 * POST /api/hv/templates/generate
 * AI-generate email templates based on the user's product, ICP, voice, and outreach goal.
 *
 * Body:
 *   category: TemplateCategory (which type of template to generate)
 *   count: number (how many templates, default 1, max 5)
 *   context: string (optional additional context/instructions)
 */
export async function POST(request: Request) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  try {
    const body = await request.json();
    const category: TemplateCategory = body.category ?? "cold_outreach";
    const count = Math.min(5, Math.max(1, body.count ?? 1));
    const extraContext = body.context ?? "";

    const admin = createAdminClient();

    // Load Kinetiks context
    const ctx = await pullHarvestContext(auth.account_id, [
      "org", "products", "voice", "customers", "competitive",
    ]);

    // Safe cast: context layers follow known schemas
    const orgData = (ctx?.layers?.org?.data ?? {}) as Record<string, string>;
    const productsData = (ctx?.layers?.products?.data ?? {}) as Record<string, unknown>;
    const voiceData = (ctx?.layers?.voice?.data ?? {}) as Record<string, unknown>;
    const customersData = (ctx?.layers?.customers?.data ?? {}) as Record<string, unknown>;

    // Load outreach goal
    const { data: configRow } = await admin
      .from("hv_accounts_config")
      .select("outreach_goal")
      .eq("kinetiks_id", auth.account_id)
      .maybeSingle();
    // Safe cast: outreach_goal JSONB follows OutreachGoal schema
    const goal: OutreachGoal = (configRow?.outreach_goal as OutreachGoal) ?? DEFAULT_OUTREACH_GOAL;

    // Build context for AI
    const products = Array.isArray(productsData.products) ? productsData.products : [];
    const personas = Array.isArray(customersData.personas) ? customersData.personas : [];
    const tone = voiceData.tone as Record<string, number> | undefined;

    const contextLines = [
      `Company: ${orgData.company_name ?? "Unknown"}`,
      `Industry: ${orgData.industry ?? "Unknown"}`,
      products.length > 0 ? `Product: ${(products[0] as Record<string, unknown>).name} - ${(products[0] as Record<string, unknown>).description}` : "",
      personas.length > 0 ? `Target persona: ${(personas[0] as Record<string, unknown>).name} (${(personas[0] as Record<string, unknown>).role})` : "",
      personas.length > 0 && Array.isArray((personas[0] as Record<string, unknown>).pain_points)
        ? `Pain points: ${((personas[0] as Record<string, unknown>).pain_points as string[]).join(", ")}`
        : "",
      `Outreach goal: ${goal.goal_label}`,
      goal.cta_url ? `CTA link: ${goal.cta_url}` : "",
      goal.cta_copy ? `CTA phrasing: ${goal.cta_copy}` : "",
      `Sales motion: ${goal.sales_motion}`,
      tone ? `Voice: formality ${tone.formality}/100, warmth ${tone.warmth}/100, humor ${tone.humor}/100` : "",
      extraContext ? `Additional context: ${extraContext}` : "",
    ].filter(Boolean).join("\n");

    const categoryDescriptions: Record<string, string> = {
      cold_outreach: "First touch to a new prospect. No prior relationship. Focus on providing value and establishing relevance. NO CTA link in the first email - just build interest.",
      follow_up: "Second or third touch. Prospect hasn't replied yet. Different angle, shorter, adds new value. May include CTA if appropriate based on outreach rules.",
      breakup: "Final email after no response. Graceful, dignified exit. Leave the door open. Short. No CTA link.",
      value_add: "No ask at all. Share something genuinely useful - a resource, insight, or data point relevant to their business. Build relationship.",
      meeting_request: "Direct but warm ask for a meeting/call. Include the CTA link. Only use after some engagement.",
      post_call: "Follow-up after a phone call. Reference specific things discussed. Include next steps if agreed.",
      re_engagement: "Revive a conversation that went cold. New angle or trigger event. Light touch.",
      referral: "Asking for an introduction to someone else at the company, or following up on a referral.",
    };

    const prompt = `Generate ${count} email template${count > 1 ? "s" : ""} for the category: ${category}

Category description: ${categoryDescriptions[category] ?? "Custom outreach template"}

Business context:
${contextLines}

Rules:
- Use merge fields like {{first_name}}, {{company}}, {{title}}, {{pain_point}}, {{personalization_hook}}, {{sender_name}}, {{sender_company}}, {{cta_url}} where appropriate
- Use {{AI: instruction}} blocks for parts that should be generated fresh per-contact (e.g. "{{AI: Write a personalized opening about their company}}")
- Sound human, not templated. No filler. No "I hope this finds you well."
- No em dashes. Regular dashes only.
- Keep subject lines under 60 characters, specific, not clickbaity
- For cold_outreach: NEVER include a CTA link - first touch is value-only
- For follow_up: CTA is optional, alternate between value-add and ask
- For breakup: NO CTA link. Short, graceful, leave door open.
- Match the voice profile if provided

Return a JSON array of objects with fields: name (template name), subject_template, body_template, merge_fields (array of {key, description, source, required})`;

    const result = await askClaude(prompt, {
      model: "claude-sonnet-4-20250514",
      system: "You are an expert B2B email copywriter. Generate email templates as JSON. Return ONLY valid JSON - no markdown, no explanation.",
      maxTokens: 2000,
    });

    // Parse response
    let templates;
    try {
      // Strip markdown code fences if present
      const cleaned = result.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      templates = JSON.parse(cleaned);
      if (!Array.isArray(templates)) templates = [templates];
    } catch {
      return apiError("Failed to parse AI-generated templates", 500);
    }

    // Save to database
    const saved = [];
    for (const t of templates) {
      const { data: savedTemplate, error: saveError } = await admin
        .from("hv_templates")
        .insert({
          kinetiks_id: auth.account_id,
          name: t.name ?? `${category} template`,
          category,
          subject_template: t.subject_template ?? "",
          body_template: t.body_template ?? "",
          merge_fields: t.merge_fields ?? [],
          is_ai_generated: true,
          performance: { times_used: 0 },
        })
        .select()
        .single();

      if (!saveError && savedTemplate) {
        saved.push(savedTemplate);
      }
    }

    return apiSuccess({ templates: saved, generated: templates.length, saved: saved.length });
  } catch (err) {
    console.error("[HV Templates] Generation failed:", err);
    return apiError(err instanceof Error ? err.message : "Template generation failed", 500);
  }
}
