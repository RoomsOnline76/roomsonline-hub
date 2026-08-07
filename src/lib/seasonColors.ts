/**
 * Colour assignment for Calendar seasons.
 *
 * The Calendar is the authoring surface: each season carries an authored colour
 * (`amenities.seasons[].color`). Every other surface — Rate Plan cards, the
 * 7-night sample strip — must reuse that colour so a season reads the same
 * everywhere. When no authored colour is known we fall back to a stable hash.
 */
export interface SeasonColor {
  tint: string;
  dot: string;
  text: string;
}

/** Mirrors SEASON_COLORS in SeasonsCalendar (the authoring palette). */
const CALENDAR_COLORS: Record<string, SeasonColor> = {
  red: { tint: "bg-red-500/20 dark:bg-red-400/20", dot: "bg-red-500", text: "text-red-700 dark:text-red-300" },
  orange: { tint: "bg-orange-500/20 dark:bg-orange-400/20", dot: "bg-orange-500", text: "text-orange-700 dark:text-orange-300" },
  amber: { tint: "bg-amber-500/25 dark:bg-amber-400/20", dot: "bg-amber-500", text: "text-amber-700 dark:text-amber-300" },
  yellow: { tint: "bg-yellow-500/25 dark:bg-yellow-400/20", dot: "bg-yellow-500", text: "text-yellow-700 dark:text-yellow-300" },
  teal: { tint: "bg-teal-500/20 dark:bg-teal-400/20", dot: "bg-teal-500", text: "text-teal-700 dark:text-teal-300" },
  blue: { tint: "bg-blue-500/20 dark:bg-blue-400/20", dot: "bg-blue-500", text: "text-blue-700 dark:text-blue-300" },
  purple: { tint: "bg-purple-500/20 dark:bg-purple-400/20", dot: "bg-purple-500", text: "text-purple-700 dark:text-purple-300" },
  green: { tint: "bg-green-500/20 dark:bg-green-400/20", dot: "bg-green-500", text: "text-green-700 dark:text-green-300" },
};

const PALETTE: SeasonColor[] = [
  CALENDAR_COLORS.blue,
  CALENDAR_COLORS.green,
  CALENDAR_COLORS.purple,
  CALENDAR_COLORS.orange,
  CALENDAR_COLORS.teal,
  CALENDAR_COLORS.red,
];

/** Lower-cased season name -> authored Calendar colour value (e.g. "red"). */
export type SeasonColorMap = Record<string, string>;

/** Deterministic colour for a season, preferring the colour authored in the Calendar. */
export const seasonColor = (name: string | null | undefined, map?: SeasonColorMap): SeasonColor => {
  const key = (name ?? "").trim().toLowerCase();
  const authored = map?.[key];
  if (authored && CALENDAR_COLORS[authored]) return CALENDAR_COLORS[authored];
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) % 100000;
  return PALETTE[hash % PALETTE.length];
};

/** Build a name -> colour map from Calendar season records. */
export const buildSeasonColorMap = (
  seasons: { name?: string | null; title?: string | null; color?: string | null }[] | null | undefined,
): SeasonColorMap => {
  const map: SeasonColorMap = {};
  for (const s of seasons ?? []) {
    const name = (s?.name ?? s?.title ?? "").trim().toLowerCase();
    const color = (s?.color ?? "").trim().toLowerCase();
    if (name && color) map[name] = color;
  }
  return map;
};
