/**
 * Parser for Rentals United availability calendars.
 *
 * RU answers Pull_ListPropertyAvailabilityCalendar_RQ with `CalDay` elements that carry
 * the unit count as an ATTRIBUTE and the stay restrictions as CHILD ELEMENTS:
 *
 *   <PropertyCalendar PropertyID="5655615">
 *     <CalDay Date="2026-08-05" Units="1" Reservations="0" MSMXTypeID="1">
 *       <IsBlocked>false</IsBlocked><MinStay>1</MinStay><Changeover>3</Changeover><MaxStay>30</MaxStay>
 *     </CalDay>
 *   </PropertyCalendar>
 *
 * Earlier code looked for `<CalendarDay ... />` self-closing tags (a format RU does not
 * emit) and counted "open days" by matching any numeric text node — so a calendar that
 * was fully pushed read back as empty and readiness reported
 * "no open availability day in the next 365 days". Always parse through this helper.
 */

import { fromWireChangeover } from './ruChangeover.ts';

export interface RuCalendarDay {
  date: string;
  /** Units bookable that day (0 when RU reports the day blocked). */
  units: number | null;
  min_stay: number | null;
  max_stay: number | null;
  /** ROL'OS internal changeover code (0=none, 1=arrival only, 2=departure only, 3=both) —
   *  RU's wire value (1..4) is translated on parse via `fromWireChangeover`. */
  changeover: number | null;
  blocked: boolean;
  /** Confirmed reservations RU holds for that day — such days cannot be re-opened by a push. */
  reservations: number | null;
}


const attr = (s: string, name: string): string | null => {
  const m = new RegExp(`\\b${name}="([^"]*)"`, 'i').exec(s);
  return m ? m[1] : null;
};

const childNum = (s: string, name: string): number | null => {
  const m = new RegExp(`<${name}>\\s*([^<\\s]+)\\s*</${name}>`, 'i').exec(s);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
};

const num = (v: string | null): number | null => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Every calendar day RU returned, keyed by ISO date. */
export function parseRuAvailabilityDays(xml: string): Map<string, RuCalendarDay> {
  const days = new Map<string, RuCalendarDay>();
  const source = String(xml ?? '');
  if (!source) return days;

  // <CalDay ...>children</CalDay> and the self-closing <CalDay ... /> variant,
  // plus the legacy <CalendarDay .../> spelling.
  const dayRegex = /<(CalDay|CalendarDay)\b([^>]*?)(\/)?>(?:([\s\S]*?)<\/\1>)?/gi;
  let m: RegExpExecArray | null;
  while ((m = dayRegex.exec(source)) !== null) {
    const attrs = m[2] ?? '';
    const inner = m[3] ? '' : (m[4] ?? '');
    const date = attr(attrs, 'Date');
    if (!date) continue;

    const blockedRaw = childNum(inner, 'IsBlocked');
    const blockedText = /<IsBlocked>\s*true\s*<\/IsBlocked>/i.test(inner);
    const blockedAttr = (attr(attrs, 'IsBlocked') ?? '').toLowerCase() === 'true';
    const blocked = blockedText || blockedAttr || blockedRaw === 1;

    let units = num(attr(attrs, 'Units'));
    if (units == null) units = childNum(inner, 'Units');
    if (units == null) {
      const isAvailable = (attr(attrs, 'IsAvailable') ?? '').toLowerCase();
      if (isAvailable) units = isAvailable === 'true' ? 1 : 0;
    }
    if (blocked) units = 0;

    days.set(date, {
      date,
      units,
      min_stay: num(attr(attrs, 'MinStay')) ?? childNum(inner, 'MinStay'),
      max_stay: num(attr(attrs, 'MaxStay')) ?? childNum(inner, 'MaxStay'),
      changeover: fromWireChangeover(num(attr(attrs, 'Changeover')) ?? childNum(inner, 'Changeover')),
      blocked,
      reservations: num(attr(attrs, 'Reservations')) ?? childNum(inner, 'Reservations'),
    });
  }

  if (days.size > 0) return days;

  // Range form: <DateRange DateFrom="..." DateTo="..." Units="..." MinStay="..." />
  const rangeRegex = /<DateRange\b([^>]*?)\/?>/gi;
  while ((m = rangeRegex.exec(source)) !== null) {
    const attrs = m[1] ?? '';
    const from = attr(attrs, 'DateFrom');
    const to = attr(attrs, 'DateTo');
    if (!from || !to) continue;
    const units = num(attr(attrs, 'Units'));
    const minStay = num(attr(attrs, 'MinStay'));
    const maxStay = num(attr(attrs, 'MaxStay'));
    const changeover = fromWireChangeover(num(attr(attrs, 'Changeover')));
    const start = new Date(`${from}T00:00:00Z`);
    const end = new Date(`${to}T00:00:00Z`);
    for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      const iso = d.toISOString().slice(0, 10);
      days.set(iso, { date: iso, units, min_stay: minStay, max_stay: maxStay, changeover, blocked: units === 0, reservations: null });
    }
  }
  return days;
}

/** Days RU reports as bookable (at least one unit, not blocked). */
export function countRuOpenDays(xml: string): number {
  let open = 0;
  for (const day of parseRuAvailabilityDays(xml).values()) {
    if (!day.blocked && (day.units ?? 0) > 0) open += 1;
  }
  return open;
}
