import type { BillingPlan } from "@kinetiks/types";

export interface PlanDetails {
  name: string;
  price: string;
  priceNote: string;
  features: string[];
  seedsPerMonth: number;
}

export const PLAN_DETAILS: Record<BillingPlan, PlanDetails> = {
  free: {
    name: "Free",
    price: "$0",
    priceNote: "forever",
    features: [
      "1 Kinetiks ID",
      "Basic Context Structure",
      "50 seeds/month",
      "1 app activation",
    ],
    seedsPerMonth: 50,
  },
  starter: {
    name: "Starter",
    price: "$29",
    priceNote: "per month",
    features: [
      "1 Kinetiks ID",
      "Full Context Structure",
      "500 seeds/month",
      "2 app activations",
      "Data connections",
      "Daily briefs",
    ],
    seedsPerMonth: 500,
  },
  pro: {
    name: "Pro",
    price: "$79",
    priceNote: "per month",
    features: [
      "1 Kinetiks ID",
      "Full Context Structure",
      "2,000 seeds/month",
      "All app activations",
      "All data connections",
      "Marcus full access",
      "Slack integration",
      "Priority support",
    ],
    seedsPerMonth: 2000,
  },
  team: {
    name: "Team",
    price: "$199",
    priceNote: "per month",
    features: [
      "Up to 5 Kinetiks IDs",
      "Full Context Structure",
      "10,000 seeds/month",
      "All app activations",
      "All data connections",
      "Marcus full access",
      "Slack integration",
      "Dedicated support",
      "Team collaboration",
    ],
    seedsPerMonth: 10000,
  },
};
