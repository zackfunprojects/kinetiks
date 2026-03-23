import type { BrandLayer } from "@kinetiks/types";
import { askClaude } from "@kinetiks/ai";
import {
  CARTOGRAPHER_BRAND_ASSIST_PROMPT,
  buildBrandAssistPrompt,
} from "@/lib/ai/prompts/cartographer";
import type { ExtractionResult } from "./types";
import { parseClaudeJSON } from "./utils";

// ── CSS Parsing Helpers ──

/**
 * Extract all CSS content from HTML (inline styles and style blocks).
 */
function extractCSS(html: string): string {
  const styleBlocks: string[] = [];

  // Extract <style> block contents
  const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let match: RegExpExecArray | null;
  while ((match = styleRegex.exec(html)) !== null) {
    styleBlocks.push(match[1]);
  }

  // Extract inline style attributes
  const inlineRegex = /style="([^"]*)"/gi;
  while ((match = inlineRegex.exec(html)) !== null) {
    styleBlocks.push(match[1]);
  }

  return styleBlocks.join("\n");
}

/**
 * Extract CSS custom properties (variables).
 */
function extractCSSVariables(css: string): Map<string, string> {
  const vars = new Map<string, string>();
  const varRegex = /--([\w-]+)\s*:\s*([^;]+)/g;
  let match: RegExpExecArray | null;
  while ((match = varRegex.exec(css)) !== null) {
    vars.set(match[1].trim(), match[2].trim());
  }
  return vars;
}

/**
 * Extract all color values from CSS property declarations.
 */
function extractColorValues(css: string): string[] {
  const colors: string[] = [];
  const colorProps =
    /(?:color|background-color|background|border-color|fill|stroke)\s*:\s*([^;]+)/gi;
  let match: RegExpExecArray | null;
  while ((match = colorProps.exec(css)) !== null) {
    const value = match[1].trim();
    // Match hex colors
    const hexMatch = value.match(/#(?:[0-9a-fA-F]{3,8})\b/g);
    if (hexMatch) colors.push(...hexMatch);
    // Match rgb/rgba
    const rgbMatch = value.match(/rgba?\([^)]+\)/g);
    if (rgbMatch) colors.push(...rgbMatch);
    // Match hsl/hsla
    const hslMatch = value.match(/hsla?\([^)]+\)/g);
    if (hslMatch) colors.push(...hslMatch);
  }
  return colors;
}

/**
 * Normalize a color value to 6-digit hex for comparison.
 */
function normalizeToHex(color: string): string | null {
  color = color.trim().toLowerCase();

  // Already hex
  if (color.startsWith("#")) {
    const hex = color.slice(1);
    if (hex.length === 3) {
      return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`;
    }
    if (hex.length === 6) return color;
    if (hex.length === 8) return `#${hex.slice(0, 6)}`;
    return null;
  }

  // rgb/rgba
  const rgbMatch = color.match(
    /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/
  );
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1], 10);
    const g = parseInt(rgbMatch[2], 10);
    const b = parseInt(rgbMatch[3], 10);
    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
  }

  return null;
}

/**
 * Check if a color is a neutral (gray, black, or white).
 */
function isNeutral(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);

  // Check for near-grayscale (low saturation)
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const saturation = max === 0 ? 0 : (max - min) / max;

  return saturation < 0.15;
}

/**
 * Rank colors by frequency, filtering neutrals.
 */
function rankColors(
  colorValues: string[]
): { chromatic: string[]; neutrals: string[] } {
  const frequency = new Map<string, number>();

  for (const raw of colorValues) {
    const hex = normalizeToHex(raw);
    if (!hex) continue;
    frequency.set(hex, (frequency.get(hex) ?? 0) + 1);
  }

  const sorted = [...frequency.entries()].sort((a, b) => b[1] - a[1]);

  const chromatic: string[] = [];
  const neutrals: string[] = [];

  for (const [hex] of sorted) {
    if (isNeutral(hex)) {
      neutrals.push(hex);
    } else {
      chromatic.push(hex);
    }
  }

  return { chromatic, neutrals };
}

// ── Typography Parsing ──

interface FontInfo {
  family: string;
  weight: string;
  lineHeight: string;
}

function extractFontFamilies(css: string): {
  heading: FontInfo | null;
  body: FontInfo | null;
} {
  const declarations: Array<{
    selector: string;
    family: string;
    weight: string;
    lineHeight: string;
  }> = [];

  // Match selector { ... } blocks
  const blockRegex = /([^{}]+)\{([^{}]+)\}/g;
  let match: RegExpExecArray | null;
  while ((match = blockRegex.exec(css)) !== null) {
    const selector = match[1].trim().toLowerCase();
    const body = match[2];

    const familyMatch = body.match(/font-family\s*:\s*([^;]+)/i);
    const weightMatch = body.match(/font-weight\s*:\s*([^;]+)/i);
    const lhMatch = body.match(/line-height\s*:\s*([^;]+)/i);

    if (familyMatch) {
      const family = familyMatch[1]
        .trim()
        .replace(/["']/g, "")
        .split(",")[0]
        .trim();
      declarations.push({
        selector,
        family,
        weight: weightMatch ? weightMatch[1].trim() : "400",
        lineHeight: lhMatch ? lhMatch[1].trim() : "1.5",
      });
    }
  }

  let heading: FontInfo | null = null;
  let body: FontInfo | null = null;

  // Look for heading fonts
  const headingSelectors = ["h1", "h2", "h3", ".heading", "[class*=heading]"];
  for (const decl of declarations) {
    if (headingSelectors.some((s) => decl.selector.includes(s))) {
      heading = {
        family: decl.family,
        weight: decl.weight,
        lineHeight: decl.lineHeight,
      };
      break;
    }
  }

  // Look for body fonts
  const bodySelectors = ["body", "html", "p", ".body", ":root"];
  for (const decl of declarations) {
    if (bodySelectors.some((s) => decl.selector.includes(s))) {
      body = {
        family: decl.family,
        weight: decl.weight,
        lineHeight: decl.lineHeight,
      };
      break;
    }
  }

  // Fallback: use the most commonly declared font family
  if (!body && declarations.length > 0) {
    const freq = new Map<string, number>();
    for (const d of declarations) {
      freq.set(d.family, (freq.get(d.family) ?? 0) + 1);
    }
    const sorted = [...freq.entries()].sort((a, b) => b[1] - a[1]);
    if (sorted.length > 0) {
      const topDecl = declarations.find((d) => d.family === sorted[0][0]);
      if (topDecl) {
        body = {
          family: topDecl.family,
          weight: topDecl.weight,
          lineHeight: topDecl.lineHeight,
        };
      }
    }
  }

  return { heading, body };
}

// ── Token Parsing ──

function classifyBorderRadius(css: string): "sharp" | "subtle" | "rounded" | "pill" {
  const radii: number[] = [];
  const radiusRegex = /border-radius\s*:\s*([^;]+)/gi;
  let match: RegExpExecArray | null;
  while ((match = radiusRegex.exec(css)) !== null) {
    const val = match[1].trim();
    const pxMatch = val.match(/^(\d+(?:\.\d+)?)px/);
    const remMatch = val.match(/^(\d+(?:\.\d+)?)rem/);
    if (pxMatch) radii.push(parseFloat(pxMatch[1]));
    if (remMatch) radii.push(parseFloat(remMatch[1]) * 16);
    if (val.includes("9999") || val.includes("50%")) radii.push(9999);
  }

  if (radii.length === 0) return "subtle";

  // Filter out pill values (9999px) for the average
  const nonPill = radii.filter((r) => r < 100);
  const avg = nonPill.length > 0
    ? nonPill.reduce((a, b) => a + b, 0) / nonPill.length
    : 0;

  // If most values are pill-shaped
  const pillRatio = radii.filter((r) => r >= 100).length / radii.length;
  if (pillRatio > 0.5) return "pill";

  if (avg <= 2) return "sharp";
  if (avg <= 8) return "subtle";
  return "rounded";
}

function classifyElevation(css: string): "flat" | "subtle" | "layered" {
  const shadowRegex = /box-shadow\s*:\s*([^;]+)/gi;
  const shadows: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = shadowRegex.exec(css)) !== null) {
    const val = match[1].trim();
    if (val !== "none" && val !== "0") {
      shadows.push(val);
    }
  }

  if (shadows.length === 0) return "flat";
  if (shadows.length <= 3) return "subtle";
  return "layered";
}

// ── Logo Detection ──

function detectLogos(html: string, baseUrl: string): {
  wordmark_url: string | null;
  icon_url: string | null;
} {
  // Look for img tags within header/nav or with logo-related attributes
  const logoPatterns = [
    /<(?:header|nav)[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"[^>]*>/gi,
    /<img[^>]+(?:class|id|alt)="[^"]*logo[^"]*"[^>]+src="([^"]+)"/gi,
    /<img[^>]+src="([^"]+)"[^>]+(?:class|id|alt)="[^"]*logo[^"]*"/gi,
  ];

  const logoUrls: string[] = [];

  for (const pattern of logoPatterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(html)) !== null) {
      logoUrls.push(match[1]);
    }
  }

  // Also check for SVG logos in header/nav
  const svgLogoRegex =
    /<(?:header|nav)[^>]*>[\s\S]*?<svg[^>]*class="[^"]*logo[^"]*"/gi;
  const hasSvgLogo = svgLogoRegex.test(html);

  // Resolve relative URLs
  const resolvedUrls = logoUrls.map((u) => {
    try {
      return new URL(u, baseUrl).href;
    } catch {
      return u;
    }
  });

  // Deduplicate
  const unique = [...new Set(resolvedUrls)];

  return {
    wordmark_url: unique[0] ?? null,
    icon_url: unique[1] ?? (hasSvgLogo ? "svg-inline" : null),
    // Note: "svg-inline" signals that a logo exists but is inlined SVG
  };
}

// ── Dark Mode Detection ──

function detectDarkMode(css: string, html: string): {
  dark_mode_supported: boolean;
  default_mode: "light" | "dark";
} {
  const hasDarkMediaQuery = /prefers-color-scheme\s*:\s*dark/i.test(css);
  const hasDarkClass = /\.dark\s*\{|\.dark-mode\s*\{|\[data-theme=["']dark["']\]/i.test(css);
  const hasDarkMeta = /color-scheme.*dark/i.test(html);

  const dark_mode_supported = hasDarkMediaQuery || hasDarkClass || hasDarkMeta;

  // Check if the default is dark
  const bodyBg = css.match(
    /body\s*\{[^}]*background(?:-color)?\s*:\s*([^;]+)/i
  );
  let default_mode: "light" | "dark" = "light";
  if (bodyBg) {
    const hex = normalizeToHex(bodyBg[1]);
    if (hex) {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      const luminance = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
      if (luminance < 0.3) default_mode = "dark";
    }
  }

  return { dark_mode_supported, default_mode };
}

// ── Main Extractor ──

export async function extractBrand(
  html: string,
  url: string
): Promise<ExtractionResult<Partial<BrandLayer>>> {
  try {
    const css = extractCSS(html);
    const cssVars = extractCSSVariables(css);

    // ── Colors ──
    const allColorValues = extractColorValues(css);

    // Also extract colors from CSS variables
    for (const [name, value] of cssVars) {
      if (
        name.includes("color") ||
        name.includes("primary") ||
        name.includes("secondary") ||
        name.includes("accent")
      ) {
        allColorValues.push(value);
      }
    }

    const { chromatic, neutrals } = rankColors(allColorValues);

    // Try to identify semantic colors from CSS variables
    const semanticColors: Record<string, string> = {};
    for (const [name, value] of cssVars) {
      const hex = normalizeToHex(value);
      if (!hex) continue;
      if (name.includes("success")) semanticColors.success = hex;
      if (name.includes("warning")) semanticColors.warning = hex;
      if (name.includes("error") || name.includes("danger"))
        semanticColors.error = hex;
      if (name.includes("info")) semanticColors.info = hex;
    }

    // Build neutrals scale from detected grays
    const neutralScale: Record<string, string> = {};
    const sortedNeutrals = neutrals
      .map((hex) => {
        const r = parseInt(hex.slice(1, 3), 16);
        return { hex, luminance: r }; // Approximate - grays have similar r/g/b
      })
      .sort((a, b) => b.luminance - a.luminance); // Lightest first

    if (sortedNeutrals.length >= 2) {
      const step = Math.max(1, Math.floor(sortedNeutrals.length / 7));
      const slots = ["50", "100", "200", "400", "600", "800", "900"];
      for (let i = 0; i < slots.length && i * step < sortedNeutrals.length; i++) {
        neutralScale[slots[i]] = sortedNeutrals[Math.min(i * step, sortedNeutrals.length - 1)].hex;
      }
    }

    const colors: Partial<BrandLayer["colors"]> = {};
    if (chromatic.length >= 1) colors.primary = chromatic[0];
    if (chromatic.length >= 2) colors.secondary = chromatic[1];
    if (chromatic.length >= 3) colors.accent = chromatic[2];
    if (Object.keys(semanticColors).length > 0) {
      colors.semantic = {
        success: semanticColors.success ?? "",
        warning: semanticColors.warning ?? "",
        error: semanticColors.error ?? "",
        info: semanticColors.info ?? "",
      };
    }
    if (Object.keys(neutralScale).length > 0) {
      colors.neutrals = {
        "50": neutralScale["50"] ?? "",
        "100": neutralScale["100"] ?? "",
        "200": neutralScale["200"] ?? "",
        "400": neutralScale["400"] ?? "",
        "600": neutralScale["600"] ?? "",
        "800": neutralScale["800"] ?? "",
        "900": neutralScale["900"] ?? "",
      };
    }

    // ── Typography ──
    const fonts = extractFontFamilies(css);
    const typography: Partial<BrandLayer["typography"]> = {};
    if (fonts.heading) {
      typography.heading_font = fonts.heading.family;
      typography.heading_weight = fonts.heading.weight;
      typography.heading_line_height = parseFloat(fonts.heading.lineHeight) || 1.2;
    }
    if (fonts.body) {
      typography.body_font = fonts.body.family;
      typography.body_weight = fonts.body.weight;
      typography.body_line_height = parseFloat(fonts.body.lineHeight) || 1.5;
    }

    // ── Tokens (programmatic) ──
    const border_radius = classifyBorderRadius(css);
    const elevation = classifyElevation(css);

    // ── Logo ──
    const logo = detectLogos(html, url);

    // ── Dark Mode ──
    const modes = detectDarkMode(css, html);

    // ── Subjective Classification via Claude Haiku ──
    const cssData = {
      colors_found: chromatic.length,
      primary_color: chromatic[0] ?? null,
      neutrals_found: neutrals.length,
      border_radius,
      elevation,
      font_heading: fonts.heading?.family ?? null,
      font_body: fonts.body?.family ?? null,
      dark_mode: modes.dark_mode_supported,
    };

    let subjective: {
      imagery: BrandLayer["imagery"];
      motion: BrandLayer["motion"];
      tokens: { density: BrandLayer["tokens"]["density"] };
      accessibility: BrandLayer["accessibility"];
    } | null = null;

    try {
      const subjectiveResponse = await askClaude(
        buildBrandAssistPrompt(cssData, url),
        {
          system: CARTOGRAPHER_BRAND_ASSIST_PROMPT,
          model: "claude-haiku-4-5-20251001",
          maxTokens: 1024,
        }
      );
      subjective = parseClaudeJSON(subjectiveResponse);
    } catch (err) {
      console.error("Brand subjective classification failed:", err);
    }

    // ── Assemble Result ──
    const brandData: Partial<BrandLayer> = {};

    if (Object.keys(colors).length > 0) {
      brandData.colors = colors as BrandLayer["colors"];
    }

    if (Object.keys(typography).length > 0) {
      brandData.typography = typography as BrandLayer["typography"];
    }

    brandData.tokens = {
      border_radius,
      spacing_base: 4,
      spacing_scale: "linear",
      elevation,
      density: subjective?.tokens?.density ?? "balanced",
    };

    if (subjective?.imagery) brandData.imagery = subjective.imagery;
    if (subjective?.motion) brandData.motion = subjective.motion;

    brandData.modes = modes;

    brandData.accessibility = subjective?.accessibility ?? {
      wcag_level: "AA",
      min_contrast: 4.5,
      min_font_size: 14,
    };

    if (logo.wordmark_url || logo.icon_url) {
      brandData.logo = {
        wordmark_url: logo.wordmark_url,
        icon_url: logo.icon_url,
        monochrome_url: null,
      };
    }

    return {
      success: true,
      data: brandData,
      error: null,
      source_url: url,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Brand extraction failed:", message);
    return {
      success: false,
      data: null,
      error: `brand_extraction_failed: ${message}`,
      source_url: url,
    };
  }
}
