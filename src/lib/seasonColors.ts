/**
 * Stable colour assignment for Calendar seasons.
 * Used by the Rate Plan cards and the 7-night sample strip so a season is always
 * the same colour wherever it appears.
 */
const PALETTE = [
  { tint: "bg-sky-500/20 dark:bg-sky-400/20", dot: "bg-sky-500", text: "text-sky-700 dark:text-sky-300" },
  { tint: "bg-emerald-500/20 dark:bg-emerald-400/20", dot: "bg-emerald-500", text: "text-emerald-700 dark:text-emerald-300" },
  { tint: "bg-violet-500/20 dark:bg-violet-400/20", dot: "bg-violet-500", text: "text-violet-700 dark:text-violet-300" },
  { tint: "bg-orange-500/20 dark:bg-orange-400/20", dot: "bg-orange-500", text: "text-orange-700 dark:text-orange-300" },
  { tint: "bg-teal-500/20 dark:bg-teal-400/20", dot: "bg-teal-500", text: "text-teal-700 dark:text-teal-300" },
  { tint: "bg-rose-500/20 dark:bg-rose-400/20", dot: "bg-rose-500", text: "text-rose-700 dark:text-rose-300" },
] as const;

export type SeasonColor = (typeof PALETTE)[number];

/** Deterministic colour for a season name (case-insensitive). */
export const seasonColor = (name: string | null | undefined): SeasonColor => {
  const key = (name ?? "").trim().toLowerCase();
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) % 100000;
  return PALETTE[hash % PALETTE.length];
};
