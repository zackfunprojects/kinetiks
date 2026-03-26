# Voice Consistency

Maintaining a recognizable voice across all content, over time, and across formats.

---

## Voice Drift Signals

Watch for these indicators that output is drifting from the established voice profile:

- **Avoided vocabulary appearing:** Words on the "never use" list start showing up. This is the earliest and most concrete signal.
- **Sentence rhythm flattening:** Consistent sentence lengths with no variation. The characteristic punch-after-explanation pattern disappears. Everything sounds the same cadence.
- **Personality traits disappearing:** The voice adjectives (warm, direct, curious, etc.) stop being detectable. Content becomes interchangeable with any brand.
- **Structural markers replacing thought bridges:** "Furthermore," "Additionally," "Moreover" replacing actual connecting ideas between paragraphs.
- **Generic language creeping in:** "Incredible," "amazing," "comprehensive" replacing specific, concrete descriptions.
- **Warmth becoming bolted-on:** Emotional language isolated in separate sentences or paragraphs rather than woven through informational content.

---

## On-Brand / Off-Brand Calibration

For every voice profile, maintain concrete examples:

**2-3 on-brand examples:** Short paragraphs (50-100 words) that perfectly represent the voice. These serve as calibration anchors during generation. They show what "right" sounds like.

**2-3 off-brand examples:** Short paragraphs written in ways the brand would never sound. Common failure modes: too corporate, too casual, too generic, too AI-sounding. Annotate each with what specifically makes it wrong.

These examples are more useful than abstract descriptions. Comparing generated output against concrete examples is faster and more reliable than checking against a list of adjectives.

---

## Cross-Content Consistency

The voice in a blog post should be recognizably the same voice as in an email, social post, or landing page -- even though format and length change.

**What stays constant:** Vocabulary preferences, personality traits, things-we-never-say rules, characteristic rhetorical patterns, warmth integration style.

**What adapts:** Sentence length, depth of explanation, CTA directness, humor frequency, formality level. (See voice/adaptation.md for the full adaptation framework.)

A reader who follows the brand across platforms should feel like they are hearing from the same entity, even though the format is different.

---

## Quality Check

After generating content, compare against the voice profile:

1. Scan for banned phrases and avoided vocabulary -- binary pass/fail
2. Check sentence rhythm against the profile's pattern -- flag any stretch of 4+ consecutive sentences within 5 words of each other in length
3. Verify transitions use thought bridges, not structural markers
4. Confirm warmth is woven through informational content, not bolted on in separate paragraphs
5. Check for at least one recurring image or metaphor creating cohesion across the piece
6. Ask: "Could a reader tell this was written by the same person as the on-brand examples?"

If the answer to #6 is no, identify which dimensions drifted and rewrite the affected sections with explicit voice instructions.
