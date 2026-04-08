/**
 * Lightweight topic vectorization for the topic-spacing check
 * (Quality Addendum #5).
 *
 * Requirements from the spec:
 *   - Fast and cheap. NOT an LLM call.
 *   - Per-reply, computed at draft / autosave time.
 *   - Cosine-similarity comparable across users and platforms.
 *
 * Approach: hashed bag-of-bigrams over content tokens, after a small
 * built-in stoplist. 64 dimensions chosen so the resulting array
 * fits comfortably in a Postgres double[] column without pgvector.
 *
 * This is intentionally a humble baseline. A pgvector + sentence
 * embedding migration is on the Phase 6+ list and will replace this
 * function, but the engine API stays the same.
 *
 * Pure, deterministic, synchronous. Same input → same output.
 */

const VECTOR_DIMS = 64;

const STOPLIST = new Set([
  "the", "a", "an", "and", "or", "but", "if", "then", "of", "to", "for",
  "in", "on", "at", "by", "with", "from", "as", "is", "are", "was", "were",
  "be", "been", "being", "this", "that", "these", "those", "it", "its",
  "i", "you", "we", "they", "he", "she", "them", "us", "me", "my", "your",
  "our", "their", "his", "her", "do", "does", "did", "doing", "have", "has",
  "had", "having", "will", "would", "should", "could", "can", "may", "might",
  "must", "shall", "not", "no", "yes", "so", "than", "very", "just", "also",
  "too", "more", "most", "some", "any", "all", "each", "every", "other",
  "into", "out", "over", "under", "about", "between", "among", "up", "down",
  "what", "which", "who", "whom", "whose", "where", "when", "why", "how",
]);

export interface VectorizedReply {
  topics: string[];
  vector: number[];
}

export function vectorize(content: string): VectorizedReply {
  const tokens = tokenize(content);
  const vector = new Array<number>(VECTOR_DIMS).fill(0);
  const topics = new Map<string, number>();

  // unigrams
  for (const tok of tokens) {
    vector[hashIndex(tok)] += 1;
    topics.set(tok, (topics.get(tok) ?? 0) + 1);
  }
  // bigrams
  for (let i = 0; i < tokens.length - 1; i++) {
    const bg = `${tokens[i]} ${tokens[i + 1]}`;
    vector[hashIndex(bg)] += 1;
    topics.set(bg, (topics.get(bg) ?? 0) + 0.5);
  }

  // L2-normalize so cosine similarity == dot product later.
  const norm = Math.sqrt(vector.reduce((s, v) => s + v * v, 0));
  if (norm > 0) {
    for (let i = 0; i < vector.length; i++) {
      vector[i] = vector[i] / norm;
    }
  }

  // Top topic strings — used in the gate UI explanation.
  const sortedTopics = Array.from(topics.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([t]) => t);

  return { topics: sortedTopics, vector };
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function tokenize(content: string): string[] {
  return content
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOPLIST.has(t));
}

/**
 * Deterministic 32-bit string hash → bucket. djb2-style. We don't
 * need cryptographic strength, just stable distribution across the
 * VECTOR_DIMS buckets.
 */
function hashIndex(s: string): number {
  let h = 5381 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  }
  return h % VECTOR_DIMS;
}
