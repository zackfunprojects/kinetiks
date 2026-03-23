export interface BrandColors {
  primary: string;
  secondary: string;
  accent: string;
  semantic: {
    success: string;
    warning: string;
    error: string;
    info: string;
  };
  neutrals: {
    "50": string;
    "100": string;
    "200": string;
    "400": string;
    "600": string;
    "800": string;
    "900": string;
  };
}

export interface BrandTypography {
  heading_font: string;
  body_font: string;
  accent_font: string | null;
  type_scale: number;
  heading_weight: string;
  body_weight: string;
  body_line_height: number;
  heading_line_height: number;
}

export interface BrandTokens {
  border_radius: "sharp" | "subtle" | "rounded" | "pill";
  spacing_base: number;
  spacing_scale: string;
  elevation: "flat" | "subtle" | "layered";
  density: "tight" | "balanced" | "airy";
}

export interface BrandLayer {
  colors: BrandColors;
  typography: BrandTypography;
  tokens: BrandTokens;
  imagery: {
    style: "photography" | "illustration" | "3d" | "abstract" | "mixed";
    treatment: "warm" | "cool" | "neutral";
    subject: "human" | "product" | "abstract" | "lifestyle";
  };
  motion: {
    level: "none" | "subtle" | "expressive";
    transition_speed: "fast" | "medium" | "deliberate";
  };
  modes: {
    dark_mode_supported: boolean;
    default_mode: "light" | "dark";
  };
  accessibility: {
    wcag_level: "AA" | "AAA";
    min_contrast: number;
    min_font_size: number;
  };
  logo: {
    wordmark_url: string | null;
    icon_url: string | null;
    monochrome_url: string | null;
  };
  social_visual_id: {
    instagram: Record<string, unknown>;
    linkedin: Record<string, unknown>;
    twitter: Record<string, unknown>;
  };
}
