import type { DataAvailabilityManifest } from '../types';

export interface EvidenceCheckResult {
  passed: boolean;
  violations: EvidenceViolation[];
  warnings: string[];
}

export interface EvidenceViolation {
  type: 'unsupported_claim' | 'false_promise' | 'sycophancy' | 'restatement';
  description: string;
  severity: 'hard' | 'soft'; // hard = must fix, soft = warning
}

// Sycophancy patterns - phrases that indicate ungrounded praise
const SYCOPHANCY_PATTERNS = [
  /your positioning is (sharp|strong|compelling|excellent|great|solid)/i,
  /the market wants what you('re| are) selling/i,
  /your (biggest|greatest|strongest) advantage/i,
  /launch (immediately|now|right away)(!|\.)/i,
  /your .+ assumption is conservative/i,
  /achievable with focused/i,
  /you('re| are) (already|well) (positioned|ahead|set)/i,
  /your confidence (scores? )?(show|indicate|demonstrate) strong/i,
];

// Promise patterns that require connected systems
const PROMISE_PATTERNS = [
  { pattern: /I('ve|'ll| have| will) queue[d]?\s+.+\s+to\s+(harvest|dark madder|hypothesis|litmus)/i, app: null },
  { pattern: /I('m| am) (updating|building|creating|dispatching).+in\s+(harvest|dark madder|hypothesis|litmus)/i, app: null },
  { pattern: /I('ll| will) (build|create|draft|send|launch).+sequence/i, app: 'harvest' },
  { pattern: /I('ll| will) (build|create|draft|publish).+(post|article|content)/i, app: 'dark_madder' },
  { pattern: /I('ll| will) (build|create|draft).+landing page/i, app: 'hypothesis' },
  { pattern: /I('ll| will) (pitch|contact|reach out to).+journalist/i, app: 'litmus' },
];

export function checkEvidence(
  response: string,
  manifest: DataAvailabilityManifest,
  userMessage: string,
): EvidenceCheckResult {
  const violations: EvidenceViolation[] = [];
  const warnings: string[] = [];

  // 1. Check for sycophancy patterns
  for (const pattern of SYCOPHANCY_PATTERNS) {
    if (pattern.test(response)) {
      violations.push({
        type: 'sycophancy',
        description: `Response contains ungrounded praise: "${response.match(pattern)?.[0]}"`,
        severity: 'hard',
      });
    }
  }

  // 2. Check for promises about disconnected systems
  for (const { pattern, app } of PROMISE_PATTERNS) {
    const match = response.match(pattern);
    if (match) {
      // Extract the app name from the match or use the specified app
      const targetApp = app ?? extractAppName(match[0]);
      if (targetApp) {
        const connection = manifest.connections.find(
          (c) => c.app_name === targetApp.toLowerCase().replace(' ', '_')
        );
        if (connection && (!connection.connected || !connection.synapse_healthy)) {
          violations.push({
            type: 'false_promise',
            description: `Promised action through ${targetApp} but it's ${
              !connection.connected ? 'not connected' : 'unhealthy'
            }: "${match[0]}"`,
            severity: 'hard',
          });
        }
      }
    }
  }

  // 3. Check for restatement (heuristic: response contains long phrases from user message)
  const userWords = userMessage.toLowerCase().split(/\s+/);
  if (userWords.length >= 8) {
    // Check if response contains 8+ consecutive words from user message
    for (let i = 0; i <= userWords.length - 8; i++) {
      const phrase = userWords.slice(i, i + 8).join(' ');
      if (response.toLowerCase().includes(phrase)) {
        violations.push({
          type: 'restatement',
          description: `Response restates user input: "${phrase}..."`,
          severity: 'soft',
        });
        break; // One restatement warning is enough
      }
    }
  }

  return {
    passed: violations.filter((v) => v.severity === 'hard').length === 0,
    violations,
    warnings,
  };
}

function extractAppName(text: string): string | null {
  const lower = text.toLowerCase();
  if (lower.includes('harvest')) return 'harvest';
  if (lower.includes('dark madder')) return 'dark_madder';
  if (lower.includes('hypothesis')) return 'hypothesis';
  if (lower.includes('litmus')) return 'litmus';
  return null;
}
