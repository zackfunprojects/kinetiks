/**
 * Barrel for connection extractors.
 *
 * Each extractor module performs its registerExtractor() call at module
 * load. instrumentation.ts imports this single barrel so the extractor
 * registry is populated once, deterministically, at server boot.
 *
 * Adding a new extractor (e.g. Stripe in D3) means creating
 * extractors/<provider>.ts and adding a side-effect import here.
 */

import "./ga4";

// D3 will add:
//   import "./stripe";
//   import "./gsc";

export {};
