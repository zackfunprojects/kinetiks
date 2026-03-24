import type { ContextLayer } from "@kinetiks/types";

export interface AppRegistryEntry {
  name: string;
  displayName: string;
  description: string;
  url: string;
  color: string;
  defaultReadLayers: ContextLayer[];
  defaultWriteLayers: ContextLayer[];
}

export const APP_REGISTRY: Record<string, AppRegistryEntry> = {
  dark_madder: {
    name: "dark_madder",
    displayName: "Dark Madder",
    description:
      "AI content engine. Creates articles, social posts, and long-form content that sounds like you.",
    url: "https://dm.kinetiks.ai",
    color: "#E74C3C",
    defaultReadLayers: ["org", "products", "voice", "customers", "narrative", "brand"],
    defaultWriteLayers: ["voice", "customers", "narrative"],
  },
  harvest: {
    name: "harvest",
    displayName: "Harvest",
    description:
      "Outbound engine. Prospect research, personalized outreach, and pipeline management.",
    url: "https://hv.kinetiks.ai",
    color: "#27AE60",
    defaultReadLayers: ["org", "products", "voice", "customers", "competitive"],
    defaultWriteLayers: ["customers", "competitive"],
  },
  hypothesis: {
    name: "hypothesis",
    displayName: "Hypothesis",
    description:
      "Landing page engine. AI-generated pages optimized for conversion with A/B testing.",
    url: "https://ht.kinetiks.ai",
    color: "#F39C12",
    defaultReadLayers: ["org", "products", "voice", "customers", "brand"],
    defaultWriteLayers: ["customers"],
  },
  litmus: {
    name: "litmus",
    displayName: "Litmus",
    description:
      "PR engine. Media monitoring, journalist matching, pitch generation, and press outreach.",
    url: "https://lt.kinetiks.ai",
    color: "#3498DB",
    defaultReadLayers: ["org", "products", "voice", "narrative", "competitive", "market"],
    defaultWriteLayers: ["narrative", "competitive", "market"],
  },
};

export function getApp(name: string): AppRegistryEntry | undefined {
  return APP_REGISTRY[name];
}

export function listApps(): AppRegistryEntry[] {
  return Object.values(APP_REGISTRY);
}
