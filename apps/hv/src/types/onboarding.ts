/**
 * Harvest Onboarding
 *
 * A guided setup flow that configures Harvest for a new user.
 * Similar to Kinetiks ID's Cartographer onboarding, but focused
 * on outreach configuration.
 *
 * Steps:
 * 1. Sender Profile - who you are, your role, company
 * 2. Outreach Goal - what you're optimizing for + CTA link
 * 3. ICP Review - review/refine personas from Kinetiks ID
 * 4. Templates - AI generates starter templates based on config
 * 5. First Enrichment - paste a target domain, see it work
 *
 * Each step can be completed manually or with AI assistance.
 * The entire flow can be done via MCP (hv_onboard tool).
 */

export interface HarvestOnboardingState {
  current_step: number;
  completed_steps: number[];
  sender_profile: SenderProfile | null;
  outreach_goal_configured: boolean;
  icp_reviewed: boolean;
  templates_generated: boolean;
  first_enrichment_done: boolean;
  completed: boolean;
}

export interface SenderProfile {
  name: string;
  title: string;
  company: string;
  product_description: string;
  email: string;
  phone: string | null;
  linkedin: string | null;
}

export const ONBOARDING_STEPS = [
  {
    id: 1,
    title: "Sender Profile",
    description: "Tell us about yourself so outreach sounds like you",
    field: "sender_profile" as const,
  },
  {
    id: 2,
    title: "Outreach Goal",
    description: "What does success look like for your outreach?",
    field: "outreach_goal_configured" as const,
  },
  {
    id: 3,
    title: "ICP Review",
    description: "Review your ideal customer profile from your Kinetiks ID",
    field: "icp_reviewed" as const,
  },
  {
    id: 4,
    title: "Templates",
    description: "AI generates starter email templates based on your setup",
    field: "templates_generated" as const,
  },
  {
    id: 5,
    title: "First Enrichment",
    description: "Paste a target company domain and watch the magic",
    field: "first_enrichment_done" as const,
  },
];

export const INITIAL_ONBOARDING_STATE: HarvestOnboardingState = {
  current_step: 1,
  completed_steps: [],
  sender_profile: null,
  outreach_goal_configured: false,
  icp_reviewed: false,
  templates_generated: false,
  first_enrichment_done: false,
  completed: false,
};
