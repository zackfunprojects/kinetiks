import { readFile } from "fs/promises";
import { join } from "path";
import { modules } from "./registry";
import type {
  KnowledgeFile,
  KnowledgeModule,
  LoadKnowledgeOptions,
  LoadKnowledgeResult,
} from "./types";

/**
 * Resolve the knowledge directory path.
 * Works in both ESM (import.meta.url) and CJS/webpack (__dirname) contexts.
 */
function getKnowledgeDir(): string {
  // __dirname is available in CJS and webpack bundles
  if (typeof __dirname !== "undefined") {
    return __dirname;
  }
  // Fallback: resolve from process.cwd() for edge cases
  return join(process.cwd(), "node_modules", "@kinetiks", "ai", "src", "knowledge");
}

const KNOWLEDGE_DIR = getKnowledgeDir();

/**
 * Rough token estimate: ~4 characters per token for English prose.
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Score a module's relevance for a given operator + intent.
 * Higher = more relevant.
 */
function scoreModule(
  mod: KnowledgeModule,
  operator: string,
  intent: string
): number {
  let score = 0;

  // Direct operator match: high signal
  if (mod.relevantOperators.includes(operator)) score += 10;

  // Direct intent match: highest signal
  if (mod.relevantIntents.includes(intent)) score += 20;

  return score;
}

/**
 * Score a file's relevance within a module for a given intent.
 */
function scoreFile(file: KnowledgeFile, intent: string): number {
  if (file.bestFor.includes(intent)) return 10;
  return 1; // Base relevance (it's in a relevant module)
}

/**
 * Load marketing knowledge for an agent operator.
 *
 * Selects and assembles relevant knowledge modules based on the operator
 * and intent, staying within the token budget.
 *
 * @example
 * ```ts
 * import { loadKnowledge } from "@kinetiks/ai/knowledge";
 *
 * const knowledge = await loadKnowledge({
 *   operator: "content_generator",
 *   intent: "write_hub_page",
 *   tokenBudget: 4000,
 * });
 *
 * const systemPrompt = `${persona}\n${context}\n\n## METHODOLOGY\n${knowledge.content}`;
 * ```
 */
export async function loadKnowledge(
  options: LoadKnowledgeOptions
): Promise<LoadKnowledgeResult> {
  const {
    operator,
    intent,
    tokenBudget = 3000,
    forceModules = [],
    excludeModules = [],
  } = options;

  // 1. Score and rank modules
  const scored = modules
    .filter((m) => !excludeModules.includes(m.id))
    .map((m) => ({
      module: m,
      score: forceModules.includes(m.id) ? 100 : scoreModule(m, operator, intent),
    }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    return {
      content: "",
      modulesLoaded: [],
      filesLoaded: [],
      tokensUsed: 0,
      truncated: false,
    };
  }

  // 2. For each relevant module, rank files by intent relevance
  const filesToLoad: Array<{
    moduleId: string;
    file: KnowledgeFile;
    path: string;
    score: number;
  }> = [];

  for (const { module: mod } of scored) {
    for (const file of mod.files) {
      filesToLoad.push({
        moduleId: mod.id,
        file,
        path: join(KNOWLEDGE_DIR, mod.id, file.name),
        score: scoreFile(file, intent),
      });
    }
  }

  // Sort files by score (highest first)
  filesToLoad.sort((a, b) => b.score - a.score);

  // 3. Load files up to token budget
  let tokensUsed = 0;
  let truncated = false;
  const loadedModules = new Set<string>();
  const loadedFiles: string[] = [];
  const sections: string[] = [];

  for (const entry of filesToLoad) {
    // Pre-check: will this file likely fit?
    if (tokensUsed + entry.file.estimatedTokens > tokenBudget) {
      // Try loading it anyway - we'll truncate if needed
      if (tokensUsed > tokenBudget * 0.8) {
        truncated = true;
        continue; // Skip - we're close to budget
      }
    }

    try {
      const content = await readFile(entry.path, "utf-8");
      const contentTokens = estimateTokens(content);

      if (tokensUsed + contentTokens > tokenBudget) {
        // Truncate to fit remaining budget
        const remainingTokens = tokenBudget - tokensUsed;
        const remainingChars = remainingTokens * 4;
        if (remainingChars > 200) {
          // Only include if we can fit something meaningful
          const truncatedContent = content.slice(0, remainingChars);
          // Cut at the last complete section (double newline)
          const lastSection = truncatedContent.lastIndexOf("\n\n");
          if (lastSection > remainingChars * 0.5) {
            sections.push(truncatedContent.slice(0, lastSection));
            tokensUsed += estimateTokens(truncatedContent.slice(0, lastSection));
            loadedModules.add(entry.moduleId);
            loadedFiles.push(`${entry.moduleId}/${entry.file.name}`);
          }
        }
        truncated = true;
        break;
      }

      sections.push(content);
      tokensUsed += contentTokens;
      loadedModules.add(entry.moduleId);
      loadedFiles.push(`${entry.moduleId}/${entry.file.name}`);
    } catch {
      // File not found - skip silently
      continue;
    }
  }

  return {
    content: sections.join("\n\n---\n\n"),
    modulesLoaded: Array.from(loadedModules),
    filesLoaded: loadedFiles,
    tokensUsed,
    truncated,
  };
}
