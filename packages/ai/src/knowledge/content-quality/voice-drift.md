# Voice Drift Detection

Voice drift occurs when generated content gradually deviates from the loaded voice profile. It is subtle and cumulative -- the first paragraph sounds right, but by paragraph ten the voice has flattened into generic defaults.

---

## Voice Drift Indicators

When the voice profile specifies a trait but the output contradicts it:

| Profile Says | But Output Does | Drift Type |
|-------------|----------------|------------|
| Short sentences (avg under 15 words) | Output averages 25+ words per sentence | Rhythm drift |
| Avoid jargon | Uses industry terminology without definition | Vocabulary drift |
| Humor: 7/10 | Entirely serious, no lightness anywhere | Personality drift |
| Boldness: 8/10 | Hedges constantly, qualifies every claim | Confidence drift |
| Formality: 3/10 | No contractions, no fragments, stiff phrasing | Register drift |
| Warmth: 8/10 | Clinical, detached, no personal language | Emotional drift |
| Energy: 9/10 | Measured, calm, no momentum or urgency | Intensity drift |

---

## Drift Detection Process

1. Pull the voice profile's tone dimensions and their target values.
2. Assess the output on each dimension using the same scale.
3. Calculate the gap for each dimension.
4. **Flag any mismatch of 30 or more points on a 100-point scale** (or 3+ points on a 10-point scale).
5. Check vocabulary: scan for banned words that appeared and signature phrases that are missing.
6. Check rhythm: measure average sentence length and compare to the profile target.

**Run this check at three points:** after the opening section, at the midpoint, and at the end. Drift accelerates -- catching it early prevents compounding.

---

## Correction Approach

When drift is detected, do not rewrite from scratch. Targeted correction preserves what is working.

1. **Isolate the drifted dimension.** If rhythm drifted but vocabulary is correct, fix only rhythm.
2. **Identify the specific sentences or passages** where the drift is most visible.
3. **Adjust those passages** to realign with the profile target for that dimension.
4. **Re-read the corrected section in context** to confirm it still flows with the surrounding content.

Rewriting from scratch risks introducing new drift in dimensions that were previously correct.

---

## Cross-Piece Consistency

When generating multiple pieces in a single session, voice tends to flatten over time. The fifth piece often sounds blander than the first.

**Prevention:**
- Re-read the voice profile before each new piece, not just at the start of the session.
- Compare the opening paragraph of piece N against piece 1. If the energy, vocabulary, or rhythm has shifted, recalibrate before continuing.
- Watch for "averaging" -- where distinctive traits gradually soften toward a neutral middle. If the profile calls for boldness at 8/10, the fifth piece should still be bold, not a 5/10 compromise.

**The flatness test:** Read the opening sentences of all pieces generated in the session in sequence. If they sound like they were written by different voices, or if the later ones sound increasingly generic, drift has occurred. Recalibrate from the voice profile and revise the drifted pieces.