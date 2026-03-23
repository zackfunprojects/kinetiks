import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";

interface DocChunk {
  source: string;
  content: string;
}

let cachedIndex: DocChunk[] | null = null;

/**
 * Load documentation files from the docs/ directory and split into
 * searchable chunks. Cached after first load.
 *
 * Simple keyword-based search for v1 - no embeddings.
 */
export function loadDocsIndex(): DocChunk[] {
  if (cachedIndex) return cachedIndex;

  const docsDir = join(process.cwd(), "../../docs");

  if (!existsSync(docsDir)) {
    cachedIndex = [];
    return cachedIndex;
  }

  const chunks: DocChunk[] = [];

  try {
    const files = readdirSync(docsDir).filter(
      (f) => f.endsWith(".md") || f.endsWith(".txt")
    );

    for (const file of files) {
      try {
        const content = readFileSync(join(docsDir, file), "utf-8");
        const sections = splitIntoChunks(content, file);
        chunks.push(...sections);
      } catch {
        // Skip unreadable files
      }
    }
  } catch {
    // docs dir not readable
  }

  cachedIndex = chunks;
  return cachedIndex;
}

/**
 * Split a document into chunks by headings or paragraphs.
 * Each chunk is ~500-1000 chars.
 */
function splitIntoChunks(content: string, source: string): DocChunk[] {
  const chunks: DocChunk[] = [];

  // Split by markdown headings
  const sections = content.split(/(?=^#{1,3}\s)/m);

  for (const section of sections) {
    const trimmed = section.trim();
    if (!trimmed || trimmed.length < 20) continue;

    if (trimmed.length <= 1500) {
      chunks.push({ source, content: trimmed });
    } else {
      // Split large sections into paragraphs
      const paragraphs = trimmed.split(/\n\n+/);
      let current = "";

      for (const para of paragraphs) {
        if (current.length + para.length > 1500 && current.length > 0) {
          chunks.push({ source, content: current.trim() });
          current = para;
        } else {
          current += (current ? "\n\n" : "") + para;
        }
      }

      if (current.trim()) {
        chunks.push({ source, content: current.trim() });
      }
    }
  }

  return chunks;
}

/**
 * Search docs for chunks matching a query.
 * Simple keyword matching - returns top N results sorted by relevance.
 */
export function searchDocs(query: string, limit = 3): string[] {
  const index = loadDocsIndex();
  if (index.length === 0) return [];

  const queryWords = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2);

  if (queryWords.length === 0) return [];

  // Score each chunk by keyword matches
  const scored = index.map((chunk) => {
    const lower = chunk.content.toLowerCase();
    let score = 0;

    for (const word of queryWords) {
      // Count occurrences
      const regex = new RegExp(word, "gi");
      const matches = lower.match(regex);
      if (matches) {
        score += matches.length;
      }
    }

    // Boost chunks that match multiple query words
    const uniqueMatches = queryWords.filter((w) => lower.includes(w)).length;
    score += uniqueMatches * 2;

    return { chunk, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => `[${s.chunk.source}]\n${s.chunk.content}`);
}
