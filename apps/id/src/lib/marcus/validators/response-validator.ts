import type { DataAvailabilityManifest } from '../types';
import { checkEvidence, type EvidenceCheckResult } from './evidence-checker';
import { checkVerbosity, type VerbosityResult } from './verbosity-checker';

export interface ValidationResult {
  passed: boolean;
  evidence: EvidenceCheckResult;
  verbosity: VerbosityResult;
  needs_rewrite: boolean;
  rewrite_instructions: string | null;
}

/**
 * Validates a Marcus response before delivery to the user.
 * Returns validation result with rewrite instructions if needed.
 *
 * The engine uses this to decide whether to:
 * 1. Deliver the response as-is (passed = true)
 * 2. Request a rewrite from Haiku with specific instructions (needs_rewrite = true)
 * 3. Fall back to a safe response if rewrite also fails
 */
export function validateResponse(
  response: string,
  manifest: DataAvailabilityManifest,
  intentType: string,
  userMessage: string,
): ValidationResult {
  const evidence = checkEvidence(response, manifest, userMessage);
  const verbosity = checkVerbosity(response, intentType);

  const hardViolations = evidence.violations.filter((v) => v.severity === 'hard');
  const passed = evidence.passed && verbosity.passed;
  const needsRewrite = hardViolations.length > 0 || verbosity.excess_sentences > 3;

  let rewriteInstructions: string | null = null;

  if (needsRewrite) {
    const instructions: string[] = [];

    if (hardViolations.length > 0) {
      instructions.push('FIX THESE VIOLATIONS:');
      for (const v of hardViolations) {
        switch (v.type) {
          case 'sycophancy':
            instructions.push(`- REMOVE ungrounded praise: ${v.description}. Replace with a specific data citation or remove entirely.`);
            break;
          case 'false_promise':
            instructions.push(`- REMOVE false promise: ${v.description}. Replace with honest statement about what you can and cannot do given current connections.`);
            break;
          case 'restatement':
            instructions.push(`- REDUCE restatement: ${v.description}. Jump to new information instead of repeating what the user said.`);
            break;
        }
      }
    }

    if (verbosity.excess_sentences > 3) {
      instructions.push(`- TOO LONG: ${verbosity.sentence_count} sentences, max ${verbosity.max_allowed} for ${verbosity.intent_type} intent. Cut to the essential recommendation. Remove all supporting detail the user didn't ask for.`);
    }

    rewriteInstructions = instructions.join('\n');
  }

  return {
    passed,
    evidence,
    verbosity,
    needs_rewrite: needsRewrite,
    rewrite_instructions: rewriteInstructions,
  };
}
