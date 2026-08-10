/**
 * Rentals United White-Label content-quality validators.
 *
 * These implement the certification checklist items that go beyond simple
 * presence checks: property-name hygiene, the 700-character description gate,
 * the certification image dimensions and the "3 consecutive bookable days with
 * a price > 0" window.
 *
 * Both the live push gate (push-property-to-ru) and the certification console
 * (ru-cert-portal) must use these helpers so a property scores identically
 * everywhere.
 */

import { parseRuAvailabilityDays } from "./ruAvailabilityParsing.ts";
import { parseRuPriceSeasons } from "./ruPriceParsing.ts";

/** RU certification minimum description length. */
export const RU_CERT_MIN_DESCRIPTION = 700;

/** RU certification image dimensions (stricter than the ROL'OS upload rule). */
export const RU_CERT_MIN_IMAGE_WIDTH = 1024;
export const RU_CERT_MIN_IMAGE_HEIGHT = 768;

/** Minimum run of consecutive bookable, priced days RU requires. */
export const RU_MIN_BOOKABLE_WINDOW = 3;

/** Minimum useful length for ArrivalInstructions / how-to-arrive copy. */
export const RU_MIN_ARRIVAL_INSTRUCTIONS = 20;

export interface RuNameCheck {
  clean: boolean;
  /** Machine-readable reasons: "emoji" | "special_characters" | "all_caps" | "too_short". */
  reasons: string[];
  detail: string | null;
}

// Emoji / pictographs / dingbats / variation selectors.
const EMOJI_RE =
  /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{1F1E6}-\u{1F1FF}\u{2190}-\u{21FF}\u{2900}-\u{297F}]/u;

// Characters RU rejects in property names. Ampersand, apostrophes, dashes,
// commas, dots, slashes and parentheses are accepted by RU and stay allowed.
const SPECIAL_RE = /[<>{}\[\]|\\^~`*_=+#@$%;:"?!]/;

/**
 * Property / unit name hygiene: no emoji, no RU-rejected specials, not ALL CAPS.
 * Short acronyms ("B&B", "ROL") are tolerated — the all-caps rule only applies
 * once the name carries at least 4 letters.
 */
export function checkRuPropertyName(name: string | null | undefined): RuNameCheck {
  const raw = String(name ?? "").trim();
  const reasons: string[] = [];

  if (raw.length < 3) reasons.push("too_short");
  if (EMOJI_RE.test(raw)) reasons.push("emoji");
  if (SPECIAL_RE.test(raw)) reasons.push("special_characters");

  const letters = raw.replace(/[^A-Za-z\u00C0-\u024F]/g, "");
  if (letters.length >= 4 && letters === letters.toUpperCase()) reasons.push("all_caps");

  const messages: Record<string, string> = {
    too_short: "name is shorter than 3 characters",
    emoji: "name contains emoji or pictographs",
    special_characters: "name contains special characters the Channel Manager rejects",
    all_caps: "name is written in ALL CAPS — use title case",
  };

  return {
    clean: reasons.length === 0,
    reasons,
    detail: reasons.length === 0 ? null : reasons.map((r) => messages[r] ?? r).join("; "),
  };
}

/** Title-case suggestion used by the fix hints in the console. */
export function suggestRuPropertyName(name: string | null | undefined): string {
  return String(name ?? "")
    .replace(EMOJI_RE, "")
    .replace(SPECIAL_RE, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/(^|[\s\-/(])([a-z\u00C0-\u024F])/g, (_m, p, c) => `${p}${c.toUpperCase()}`);
}

export interface RuBookableWindow {
  ok: boolean;
  /** First day of the qualifying run. */
  start: string | null;
  /** Longest run of consecutive open + priced days found. */
  longest_run: number;
  /** Open days that carry no positive price. */
  unpriced_open_days: number;
  /** Days RU reported as open (units > 0, not blocked). */
  open_days: number;
  /** Open days that also carry a MinStay value. */
  min_stay_days: number;
  min_stay_set: boolean;
}

function pricedDates(priceXml: string): { has: (iso: string) => boolean; any: boolean } {
  const seasons = parseRuPriceSeasons(priceXml).filter((s) => (s.price ?? 0) > 0);
  const ranges = seasons
    .map((s) => ({ from: (s.date_from ?? "").slice(0, 10), to: (s.date_to ?? s.date_from ?? "").slice(0, 10) }))
    .filter((r) => r.from);
  return {
    any: ranges.length > 0,
    has: (iso: string) => ranges.some((r) => iso >= r.from && iso <= (r.to || r.from)),
  };
}

/**
 * Finds the first run of `minRun` consecutive days that RU reports as bookable
 * (units > 0, not blocked) AND that carry a positive price.
 */
export function findRuBookableWindow(
  availabilityXml: string,
  priceXml: string,
  minRun = RU_MIN_BOOKABLE_WINDOW,
): RuBookableWindow {
  const days = [...parseRuAvailabilityDays(availabilityXml).values()].sort((a, b) => a.date.localeCompare(b.date));
  const prices = pricedDates(priceXml);

  let run = 0;
  let runStart: string | null = null;
  let longest = 0;
  let start: string | null = null;
  let openDays = 0;
  let unpricedOpen = 0;
  let minStayDays = 0;
  let previous: string | null = null;

  const nextIso = (iso: string) => {
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  };

  for (const day of days) {
    const open = !day.blocked && (day.units ?? 0) > 0;
    if (open) {
      openDays += 1;
      if ((day.min_stay ?? 0) > 0) minStayDays += 1;
    }
    const priced = prices.has(day.date);
    if (open && !priced) unpricedOpen += 1;

    const contiguous = previous == null || day.date === nextIso(previous);
    if (open && priced && contiguous) {
      run += 1;
      if (run === 1) runStart = day.date;
    } else if (open && priced) {
      run = 1;
      runStart = day.date;
    } else {
      run = 0;
      runStart = null;
    }
    if (run > longest) {
      longest = run;
      if (run >= minRun && !start) start = runStart;
    }
    previous = day.date;
  }

  return {
    ok: longest >= minRun,
    start,
    longest_run: longest,
    unpriced_open_days: unpricedOpen,
    open_days: openDays,
    min_stay_days: minStayDays,
    min_stay_set: openDays > 0 && minStayDays > 0,
  };
}
