/**
 * Rentals United discount ladder resolver — single source of truth for
 * Push_PutLongStayDiscounts_RQ and Push_PutLastMinuteDiscounts_RQ.
 *
 * Both the production push (`push-property-to-ru`) and the certification suite
 * (`ru-cert-portal`) resolve their tiers here so a certification pass proves
 * exactly what production sends.
 *
 * Sources merged, in this order:
 *   1. `ru_discounts`      — manual RU ladder authored in the certification console.
 *   2. `property_specials` — deal-type aware specials authored in the Specials Wizard.
 *
 * RU semantics:
 *   LongStay   → Bigger = min nights, Smaller = max nights (omitted when open-ended)
 *   LastMinute → DaysToArrivalFrom / DaysToArrivalTo (omitted when open-ended)
 *   Inner text = percentage off. RU discounts are percentage-only.
 */

export type RuTierSource = "manual" | "special";

export interface RuLongStayTier {
  date_from: string;
  date_to: string;
  nights_from: number;
  nights_to: number | null;
  percentage: number;
  source: RuTierSource;
  source_label: string;
  source_id?: string;
}

export interface RuLastMinuteTier {
  date_from: string;
  date_to: string;
  days_to_arrival_from: number;
  days_to_arrival_to: number | null;
  percentage: number;
  source: RuTierSource;
  source_label: string;
  source_id?: string;
}

export interface RuUnmappedSpecial {
  id: string;
  name: string;
  reason: string;
}

export interface RuDiscountLadder {
  longStay: RuLongStayTier[];
  lastMinute: RuLastMinuteTier[];
  /** Non-blocking notes (e.g. clamped windows). */
  warnings: string[];
  /** Specials that cannot be represented on the RU discount endpoints. */
  unmapped: RuUnmappedSpecial[];
  counts: {
    manual_long_stay: number;
    manual_last_minute: number;
    special_long_stay: number;
    special_last_minute: number;
  };
}

/** Wire shape accepted by `rentalsunited-api` (RUDiscountEntry). */
export interface RuDiscountWire {
  date_from: string;
  date_to: string;
  nights_from: number;
  nights_to: number | null;
  discount_percentage: number;
}

interface RuDiscountRuleRow {
  id?: string;
  discount_type: string;
  threshold: number;
  discount_percent: number;
  date_from: string | null;
  date_to: string | null;
}

interface SpecialRow {
  id: string;
  name: string;
  special_type: string | null;
  deal_type: string | null;
  discount_percent: number | null;
  min_stay: number | null;
  max_stay: number | null;
  lead_days_min: number | null;
  lead_days_max: number | null;
  lead_hours_max: number | null;
  book_from: string | null;
  book_until: string | null;
  valid_from: string | null;
  valid_to: string | null;
  applicable_room_ids: string[] | null;
}

const SPECIAL_SELECT =
  "id, name, special_type, deal_type, discount_percent, min_stay, max_stay, lead_days_min, lead_days_max, lead_hours_max, book_from, book_until, valid_from, valid_to, applicable_room_ids";

const isoDay = (d: Date): string => d.toISOString().slice(0, 10);

const addDays = (base: Date, days: number): string => isoDay(new Date(base.getTime() + days * 86400000));

const PERCENT_TYPES = new Set(["discount", "percentage"]);

/**
 * Resolve the merged long-stay + last-minute ladder for a property.
 * When `roomTypeId` is given, specials scoped to other rooms are excluded.
 */
export async function resolveRuDiscounts(
  supabase: any,
  propertyId: string,
  opts: { roomTypeId?: string | null; horizonDays?: number } = {},
): Promise<RuDiscountLadder> {
  const today = new Date();
  const todayStr = isoDay(today);
  const horizonStr = addDays(today, opts.horizonDays ?? 365);

  const ladder: RuDiscountLadder = {
    longStay: [],
    lastMinute: [],
    warnings: [],
    unmapped: [],
    counts: { manual_long_stay: 0, manual_last_minute: 0, special_long_stay: 0, special_last_minute: 0 },
  };

  // ── 1. Manual RU rules ──
  const { data: rules, error: rulesErr } = await supabase
    .from("ru_discounts")
    .select("id, discount_type, threshold, discount_percent, date_from, date_to")
    .eq("property_id", propertyId)
    .eq("is_active", true)
    .order("threshold");

  if (rulesErr) {
    ladder.warnings.push(`Failed to load RU discount rules: ${rulesErr.message}`);
  }

  for (const r of (rules ?? []) as RuDiscountRuleRow[]) {
    const from = r.date_from || todayStr;
    const to = r.date_to || horizonStr;
    const pct = Number(r.discount_percent);
    const threshold = Number(r.threshold);
    if (r.discount_type === "long_stay") {
      ladder.longStay.push({
        date_from: from,
        date_to: to,
        nights_from: threshold,
        nights_to: null,
        percentage: pct,
        source: "manual",
        source_label: `Manual ${threshold}+ nights`,
        source_id: r.id,
      });
      ladder.counts.manual_long_stay++;
    } else if (r.discount_type === "last_minute") {
      ladder.lastMinute.push({
        date_from: from,
        date_to: to,
        days_to_arrival_from: 0,
        days_to_arrival_to: threshold,
        percentage: pct,
        source: "manual",
        source_label: `Manual within ${threshold} days`,
        source_id: r.id,
      });
      ladder.counts.manual_last_minute++;
    }
  }

  // ── 2. Specials authored in the Specials Wizard ──
  const { data: specials, error: specErr } = await supabase
    .from("property_specials")
    .select(SPECIAL_SELECT)
    .eq("property_id", propertyId)
    .eq("is_active", true);

  if (specErr) {
    ladder.warnings.push(`Failed to load specials: ${specErr.message}`);
    return ladder;
  }

  for (const s of (specials ?? []) as SpecialRow[]) {
    // Room scoping — a special limited to other rooms is not this unit's business.
    if (
      opts.roomTypeId &&
      Array.isArray(s.applicable_room_ids) &&
      s.applicable_room_ids.length > 0 &&
      !s.applicable_room_ids.includes(opts.roomTypeId)
    ) {
      continue;
    }

    const dealType = s.deal_type ?? "basic";
    const specialType = s.special_type ?? "discount";
    const pct = Number(s.discount_percent ?? 0);
    const dateFrom = s.valid_from || todayStr;
    const dateTo = s.valid_to || horizonStr;

    if (!PERCENT_TYPES.has(specialType)) {
      ladder.unmapped.push({
        id: s.id,
        name: s.name,
        reason:
          specialType === "package"
            ? "Packages have no Rentals United discount endpoint — publish as a rate plan instead."
            : "Rentals United discounts are percentage-only; fixed amounts and fixed prices cannot be pushed.",
      });
      continue;
    }
    if (!(pct > 0 && pct < 100)) {
      ladder.unmapped.push({ id: s.id, name: s.name, reason: `Discount percentage ${pct}% is outside the 1–99% range RU accepts.` });
      continue;
    }

    if (dealType === "long_stay") {
      const nightsFrom = Number(s.min_stay ?? 0);
      if (!(nightsFrom > 0)) {
        ladder.unmapped.push({ id: s.id, name: s.name, reason: "Long-stay deal has no minimum nights set (RU needs Bigger)." });
        continue;
      }
      const nightsTo = s.max_stay != null && Number(s.max_stay) >= nightsFrom ? Number(s.max_stay) : null;
      ladder.longStay.push({
        date_from: dateFrom,
        date_to: dateTo,
        nights_from: nightsFrom,
        nights_to: nightsTo,
        percentage: pct,
        source: "special",
        source_label: s.name,
        source_id: s.id,
      });
      ladder.counts.special_long_stay++;
      continue;
    }

    if (dealType === "last_minute") {
      // "Book within N days of arrival" → DaysToArrivalFrom .. DaysToArrivalTo.
      let from = 0;
      let to: number | null = null;
      if (s.lead_hours_max != null) {
        to = Math.max(0, Math.floor(Number(s.lead_hours_max) / 24));
      }
      if (s.lead_days_max != null) {
        to = Number(s.lead_days_max);
      }
      if (s.lead_days_min != null) from = Math.max(0, Number(s.lead_days_min));
      if (to == null && (s.book_from || s.book_until)) {
        // Legacy fallback: derive the arrival window from the booking window.
        const arrival = new Date(`${dateFrom}T00:00:00`);
        const bookUntil = s.book_until ? new Date(`${s.book_until}T00:00:00`) : today;
        const bookFrom = s.book_from ? new Date(`${s.book_from}T00:00:00`) : today;
        from = Math.max(0, Math.floor((arrival.getTime() - bookUntil.getTime()) / 86400000));
        to = Math.min(365, Math.max(from + 1, Math.floor((arrival.getTime() - bookFrom.getTime()) / 86400000)));
        ladder.warnings.push(`"${s.name}": last-minute window derived from the booking window — set a max lead time for an exact ladder.`);
      }
      if (to == null) {
        ladder.unmapped.push({ id: s.id, name: s.name, reason: "Last-minute deal has no maximum lead time (RU needs DaysToArrivalTo)." });
        continue;
      }
      if (to < from) {
        ladder.unmapped.push({ id: s.id, name: s.name, reason: `Lead-time window is inverted (${from} → ${to} days).` });
        continue;
      }
      ladder.lastMinute.push({
        date_from: dateFrom,
        date_to: dateTo,
        days_to_arrival_from: from,
        days_to_arrival_to: to,
        percentage: pct,
        source: "special",
        source_label: s.name,
        source_id: s.id,
      });
      ladder.counts.special_last_minute++;
      continue;
    }

    if (dealType === "advance_purchase") {
      // Book far ahead → the arrival window starts at the minimum lead time.
      const from = s.lead_days_min != null ? Math.max(0, Number(s.lead_days_min)) : null;
      if (from == null) {
        ladder.unmapped.push({ id: s.id, name: s.name, reason: "Advance-purchase deal has no minimum lead time (RU needs DaysToArrivalFrom)." });
        continue;
      }
      const to = s.lead_days_max != null ? Number(s.lead_days_max) : 365;
      if (to < from) {
        ladder.unmapped.push({ id: s.id, name: s.name, reason: `Lead-time window is inverted (${from} → ${to} days).` });
        continue;
      }
      ladder.lastMinute.push({
        date_from: dateFrom,
        date_to: dateTo,
        days_to_arrival_from: from,
        days_to_arrival_to: to,
        percentage: pct,
        source: "special",
        source_label: `${s.name} (advance purchase)`,
        source_id: s.id,
      });
      ladder.counts.special_last_minute++;
      continue;
    }

    // basic / rate_grid / anything else — not a RU discount endpoint.
    ladder.unmapped.push({
      id: s.id,
      name: s.name,
      reason:
        dealType === "rate_grid"
          ? "Rate-grid deals are pushed as prices, not as RU discounts."
          : "Only long-stay, last-minute and advance-purchase deals map to RU discount endpoints.",
    });
  }

  ladder.longStay.sort((a, b) => a.nights_from - b.nights_from || a.date_from.localeCompare(b.date_from));
  ladder.lastMinute.sort(
    (a, b) => a.days_to_arrival_from - b.days_to_arrival_from || a.date_from.localeCompare(b.date_from),
  );

  return ladder;
}

const windowsOverlap = (aFrom: string, aTo: string, bFrom: string, bTo: string): boolean =>
  aFrom <= bTo && bFrom <= aTo;

const rangesOverlap = (aFrom: number, aTo: number | null, bFrom: number, bTo: number | null): boolean => {
  const aEnd = aTo ?? Number.MAX_SAFE_INTEGER;
  const bEnd = bTo ?? Number.MAX_SAFE_INTEGER;
  return aFrom <= bEnd && bFrom <= aEnd;
};

/**
 * Validate a ladder against the rules RU enforces: percentage range, ordered
 * bounds, and no overlapping tiers inside the same stay window.
 */
export function validateRuLadder(ladder: RuDiscountLadder): { ok: boolean; errors: string[] } {
  const errors: string[] = [];

  const checkPercent = (kind: string, label: string, pct: number) => {
    if (!Number.isFinite(pct) || pct <= 0 || pct >= 100) {
      errors.push(`${kind} "${label}": percentage must be between 1 and 99 (got ${pct}).`);
    }
  };

  for (const t of ladder.longStay) {
    checkPercent("Long stay", t.source_label, t.percentage);
    if (t.date_from > t.date_to) errors.push(`Long stay "${t.source_label}": stay window is inverted (${t.date_from} → ${t.date_to}).`);
    if (!(t.nights_from > 0)) errors.push(`Long stay "${t.source_label}": minimum nights must be at least 1.`);
    if (t.nights_to != null && t.nights_to < t.nights_from) {
      errors.push(`Long stay "${t.source_label}": maximum nights (${t.nights_to}) is below the minimum (${t.nights_from}).`);
    }
  }
  for (let i = 0; i < ladder.longStay.length; i++) {
    for (let j = i + 1; j < ladder.longStay.length; j++) {
      const a = ladder.longStay[i];
      const b = ladder.longStay[j];
      if (
        windowsOverlap(a.date_from, a.date_to, b.date_from, b.date_to) &&
        rangesOverlap(a.nights_from, a.nights_to, b.nights_from, b.nights_to)
      ) {
        errors.push(`Long stay: "${a.source_label}" and "${b.source_label}" overlap on the same dates and night range — RU rejects overlapping tiers.`);
      }
    }
  }

  for (const t of ladder.lastMinute) {
    checkPercent("Last minute", t.source_label, t.percentage);
    if (t.date_from > t.date_to) errors.push(`Last minute "${t.source_label}": stay window is inverted (${t.date_from} → ${t.date_to}).`);
    if (t.days_to_arrival_from < 0) errors.push(`Last minute "${t.source_label}": days to arrival cannot be negative.`);
    if (t.days_to_arrival_to != null && t.days_to_arrival_to < t.days_to_arrival_from) {
      errors.push(`Last minute "${t.source_label}": lead-time window is inverted.`);
    }
  }
  for (let i = 0; i < ladder.lastMinute.length; i++) {
    for (let j = i + 1; j < ladder.lastMinute.length; j++) {
      const a = ladder.lastMinute[i];
      const b = ladder.lastMinute[j];
      if (
        windowsOverlap(a.date_from, a.date_to, b.date_from, b.date_to) &&
        rangesOverlap(a.days_to_arrival_from, a.days_to_arrival_to, b.days_to_arrival_from, b.days_to_arrival_to)
      ) {
        errors.push(`Last minute: "${a.source_label}" and "${b.source_label}" overlap on the same dates and lead-time range — RU rejects overlapping tiers.`);
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

export const longStayToWire = (tiers: RuLongStayTier[]): RuDiscountWire[] =>
  tiers.map((t) => ({
    date_from: t.date_from,
    date_to: t.date_to,
    nights_from: t.nights_from,
    nights_to: t.nights_to,
    discount_percentage: t.percentage,
  }));

export const lastMinuteToWire = (tiers: RuLastMinuteTier[]): RuDiscountWire[] =>
  tiers.map((t) => ({
    date_from: t.date_from,
    date_to: t.date_to,
    nights_from: t.days_to_arrival_from,
    nights_to: t.days_to_arrival_to,
    discount_percentage: t.percentage,
  }));

/** Human summary used in step details, e.g. "3 tiers — 1 manual, 2 specials". */
export const describeTierSources = (tiers: Array<{ source: RuTierSource }>): string => {
  const manual = tiers.filter((t) => t.source === "manual").length;
  const special = tiers.length - manual;
  const parts: string[] = [];
  if (manual) parts.push(`${manual} manual`);
  if (special) parts.push(`${special} from specials`);
  return `${tiers.length} tier${tiers.length === 1 ? "" : "s"}${parts.length ? ` — ${parts.join(", ")}` : ""}`;
};

/**
 * Parse a RU discount echo (Pull_ListProperty{LongStay,LastMinute}Discounts_RS)
 * into attribute maps. RU echoes either `<Discount .../>` rows or the
 * `<LongStay>`/`<LastMinute>` element form with the percentage as inner text.
 */
export function parseRuDiscountEcho(rawXml: string, element: "LongStay" | "LastMinute"): Array<Record<string, string>> {
  const out: Array<Record<string, string>> = [];
  const collect = (attrText: string, innerText?: string) => {
    const attrs: Record<string, string> = {};
    const attrRe = /(\w+)="([^"]*)"/g;
    let am: RegExpExecArray | null;
    while ((am = attrRe.exec(attrText)) !== null) attrs[am[1]] = am[2];
    if (innerText != null && innerText.trim() !== "") attrs.Percentage = attrs.Percentage ?? innerText.trim();
    out.push(attrs);
  };

  const elemRe = new RegExp(`<${element}\\s*([^/>]*)(?:/>|>([^<]*)</${element}>)`, "g");
  let m: RegExpExecArray | null;
  while ((m = elemRe.exec(rawXml)) !== null) collect(m[1] ?? "", m[2]);

  const genericRe = /<Discount\s+([^/>]+)\/?>/g;
  while ((m = genericRe.exec(rawXml)) !== null) collect(m[1]);

  return out;
}

const num = (v: string | undefined): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Diff what we pushed against what RU echoes back. */
export function diffRuDiscountEcho(
  rawXml: string,
  element: "LongStay" | "LastMinute",
  requested: RuDiscountWire[],
): { requested: number; returned: number; matches: number; mismatches: RuDiscountWire[]; firstMismatch: string | null } {
  const returned = parseRuDiscountEcho(rawXml, element);
  const fromKeys = element === "LongStay" ? ["Bigger", "NightsFrom"] : ["DaysToArrivalFrom", "DaysFrom"];
  const mismatches: RuDiscountWire[] = [];
  let matches = 0;

  for (const req of requested) {
    const hit = returned.find((r) => {
      const from = fromKeys.map((k) => num(r[k])).find((v) => v != null);
      const pct = num(r.Percentage) ?? num(r.Discount);
      const dateOk = !r.DateFrom || !r.DateTo || (r.DateFrom === req.date_from && r.DateTo === req.date_to);
      return dateOk && from === req.nights_from && pct != null && Math.abs(pct - req.discount_percentage) < 0.01;
    });
    if (hit) matches++;
    else mismatches.push(req);
  }

  const first = mismatches[0];
  const firstMismatch = first
    ? `RU did not echo ${element === "LongStay" ? `${first.nights_from}+ nights` : `${first.nights_from} days to arrival`} @ ${first.discount_percentage}% (${first.date_from} → ${first.date_to})`
    : null;

  return { requested: requested.length, returned: returned.length, matches, mismatches, firstMismatch };
}
