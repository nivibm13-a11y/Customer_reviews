import type { Category, Sentiment, Urgency } from "@/types";

export const CATEGORY_LABELS: Record<Category, string> = {
  food_quality: "Food quality",
  delivery: "Delivery",
  price: "Price",
  staff: "Staff",
  packaging: "Packaging",
  app: "App / ordering",
};

export const SENTIMENT_LABELS: Record<Sentiment, string> = {
  positive: "Positive",
  neutral: "Neutral",
  negative: "Negative",
};

export const URGENCY_LABELS: Record<Urgency, string> = { high: "High", medium: "Medium", low: "Low" };

/**
 * Sentiment is polarity, so it uses a diverging blue <-> red pair with a gray midpoint
 * (status green/red are reserved for state). Validated with the dataviz palette checker:
 * light passes all gates; dark sits in the CVD 6-8 band, so charts always add direct
 * labels, 2px surface gaps and a table view as secondary encoding.
 */
export const SENTIMENT_COLORS: Record<"light" | "dark", Record<Sentiment, string>> = {
  light: { positive: "#2a78d6", neutral: "#8a8a85", negative: "#e34948" },
  dark: { positive: "#3987e5", neutral: "#6e6e6a", negative: "#e66767" },
};

/** Single-series magnitude colour (platform volume). */
export const SERIES_COLOR: Record<"light" | "dark", string> = { light: "#2a78d6", dark: "#3987e5" };

export const CHART_INK: Record<"light" | "dark", { grid: string; axis: string; surface: string }> = {
  light: { grid: "#e7e6e2", axis: "#6b6b66", surface: "#ffffff" },
  dark: { grid: "#2c2c2a", axis: "#a3a39e", surface: "#131a2a" },
};
