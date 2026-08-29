/**
 * Where a ticked TOBI comment prints in the final report.
 *
 * `auto` mirrors the printed report's own routing: a line that opens with a
 * month inside the report window ("Mar 2026 — …") lands in that month's
 * commentary card, anything else prints under "Overall commentary". A reviewer
 * can override that with an explicit placement, which the report builder
 * honours ahead of the text-sniffing rule.
 */
export type InsightPlacement =
  | "auto"
  | "overall"
  | `month:${string}`
  | "min_stay_notes"
  | "promotions_notes"
  | "rate_override_notes"
  | "free_commentary";

export const NOTE_FIELD_PLACEMENTS = [
  "min_stay_notes",
  "promotions_notes",
  "rate_override_notes",
  "free_commentary",
] as const;

const NOTE_LABELS: Record<string, string> = {
  min_stay_notes: "Minimum stay notes",
  promotions_notes: "Promotions notes",
  rate_override_notes: "Rate override notes",
  free_commentary: "General commentary notes",
};

const MONTH_NAMES = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

/** "2026-03" → "March 2026". */
export const monthKeyLabel = (key: string): string => {
  const [year, month] = key.split("-").map(Number);
  if (!year || !month) return key;
  const date = new Date(year, month - 1, 1);
  if (Number.isNaN(date.getTime())) return key;
  return date.toLocaleDateString("en-ZA", { month: "long", year: "numeric" });
};

/** Month tokens the printed report recognises for the run's window. */
const monthTokenIndex = (months: string[]): Map<string, string> => {
  const index = new Map<string, string>();
  for (const key of months) {
    const [year, monthNo] = key.split("-").map(Number);
    const name = MONTH_NAMES[(monthNo || 1) - 1] ?? "";
    const short = name.slice(0, 3);
    const yy = `${year}`.slice(-2);
    for (const token of [
      key,
      name,
      short,
      `${name} ${year}`,
      `${short} ${year}`,
      `${name} ${yy}`,
      `${short} ${yy}`,
      `${name} '${yy}`,
      `${short} '${yy}`,
    ]) {
      if (!index.has(token)) index.set(token, key);
    }
  }
  return index;
};

/** Resolves the destination the report would pick from the wording alone. */
export const resolveAutoPlacement = (text: string, months: string[]): InsightPlacement => {
  const index = monthTokenIndex(months);
  for (const raw of String(text ?? "").split(/\n+/)) {
    const line = raw.replace(/^[•\-\u2022*]\s*/, "").trim();
    if (!line) continue;
    const match = line.match(/^([A-Za-z]{3,9}\s*'?\s*\d{0,4}|\d{4}-\d{2})\s*[:\u2013\u2014-]\s*(.+)$/);
    if (!match) continue;
    const token = match[1].replace(/\s+/g, " ").trim().toLowerCase();
    const key = index.get(token);
    if (key) return `month:${key}` as InsightPlacement;
  }
  return "overall";
};

/** Effective destination for a selection, honouring an explicit override. */
export const effectivePlacement = (
  placement: string | undefined,
  text: string,
  months: string[],
): InsightPlacement => {
  if (placement && placement !== "auto") return placement as InsightPlacement;
  return resolveAutoPlacement(text, months);
};

/** Short human label for a destination, e.g. "March 2026 commentary card". */
export const placementLabel = (placement: InsightPlacement): string => {
  if (placement === "overall") return "Overall commentary";
  if (placement.startsWith("month:")) {
    return `${monthKeyLabel(placement.slice(6))} commentary card`;
  }
  return NOTE_LABELS[placement] ?? "Overall commentary";
};

/** Options for the placement picker, in the order a reviewer expects them. */
export const placementOptions = (
  months: string[],
): { value: InsightPlacement; label: string }[] => [
  { value: "auto", label: "Automatic (from wording)" },
  { value: "overall", label: "Overall commentary" },
  ...months.map((key) => ({
    value: `month:${key}` as InsightPlacement,
    label: `${monthKeyLabel(key)} commentary card`,
  })),
  ...NOTE_FIELD_PLACEMENTS.map((field) => ({
    value: field as InsightPlacement,
    label: NOTE_LABELS[field],
  })),
];
