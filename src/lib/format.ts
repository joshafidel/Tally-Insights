export function formatMean(v: number | null | undefined): string {
  if (v == null) return "insufficient sample";
  return v.toFixed(2);
}

export function formatN(n: number | null | undefined): string {
  if (n == null) return "n=0";
  return `n=${n.toLocaleString("en-US")}`;
}

export function formatDelta(v: number | null): string {
  if (v == null) return "n/a";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(2)}`;
}

export function deltaArrow(v: number | null): string {
  if (v == null || Math.abs(v) < 0.005) return "";
  return v > 0 ? "▲" : "▼";
}

/* Movement semantics everywhere: up is green, down is red, and the words
   next to an arrow carry the same color as the arrow. */
export const UP_COLOR = "#15803d";
export const DOWN_COLOR = "#b91c1c";
export function deltaColor(v: number | null): string | undefined {
  if (v == null || Math.abs(v) < 0.005) return undefined;
  return v > 0 ? UP_COLOR : DOWN_COLOR;
}

export const PARTY_LABEL: Record<string, string> = {
  D: "Democrats",
  R: "Republicans",
  I: "Independents",
};

export const PARTY_COLOR: Record<string, string> = {
  D: "var(--party-d)",
  R: "var(--party-r)",
  I: "var(--party-i)",
};

/* Light to deep purple, values 1 (disagree) to 5 (agree) */
export const SENTIMENT_RAMP = [
  "#c9b3e8",
  "#ad8ddb",
  "#8f66c9",
  "#6f44ae",
  "#4f2b8c",
];

export const SEX_LABEL: Record<string, string> = {
  m: "Men",
  f: "Women",
};

export function statusLabel(s: string): string {
  return s.replaceAll("_", " ");
}
