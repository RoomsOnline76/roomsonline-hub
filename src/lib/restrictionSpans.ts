import { addDays, differenceInCalendarDays, eachDayOfInterval, format, parseISO } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { currentBlockAttribution, isBookingOccupancyRow, systemBlockLabel } from "@/lib/blockAttribution";

/**
 * Restrictions are stored one row per night in `property_availability` (and one row per
 * night per rate plan in `rolos_rate_plan_stop_sell`). Operators think in *spans*
 * ("Oester blocked 14–21 Aug"), so we group consecutive identical nights into a single
 * editable span and write changes back night-by-night.
 */

export type RestrictionKind = "block" | "min_stay" | "max_stay" | "lead_advance" | "lead_post" | "rate_plan_closure";

export interface AvailabilityNightRow {
  id?: string;
  property_id: string;
  room_type: string;
  date: string;
  available_units: number | null;
  is_stop_sell: boolean | null;
  minimum_stay: number | null;
  maximum_stay: number | null;
  lead_days_advance: number | null;
  lead_days_post: number | null;
  external_system: string | null;
  blocked_by?: string | null;
  blocked_by_label?: string | null;
  blocked_reason?: string | null;
  blocked_at?: string | null;
}

export interface RestrictionSpan {
  /** Stable identity for React keys and focus-on-open. */
  key: string;
  kind: RestrictionKind;
  propertyId: string;
  propertyName?: string;
  /** Room type name for availability rows; rate plan label for closures. */
  target: string;
  /** Rate plan id — only set for `rate_plan_closure`. */
  ratePlanId?: string;
  start: string;
  end: string;
  nights: number;
  /** min/max stay or lead-days value. */
  value: number | null;
  reason: string | null;
  attributionLabel: string | null;
  attributedAt: string | null;
  source: string | null;
  /** Channel-owned spans can be viewed but not edited — the next sync would overwrite. */
  editable: boolean;
  /** Dates that make up the span, in order. */
  dates: string[];
}

const MANUAL_SOURCES = new Set(["manual", "rol", "rolos", ""]);

export const isManualSource = (source: string | null | undefined): boolean =>
  MANUAL_SOURCES.has((source ?? "").trim().toLowerCase());

export const RESTRICTION_KIND_LABELS: Record<RestrictionKind, string> = {
  block: "Blocked",
  min_stay: "Min stay",
  max_stay: "Max stay",
  lead_advance: "Lead days advance",
  lead_post: "Lead days post",
  rate_plan_closure: "Rate plan closed",
};

/**
 * A night is blocked only when it says so explicitly. `available_units === 0` counts only for
 * channel-owned rows (the channel genuinely reporting no inventory) — a manual row that exists
 * purely to carry a min stay must never read as a block.
 */
const isBlocked = (row: AvailabilityNightRow): boolean =>
  !isBookingOccupancyRow(row.external_system, row.blocked_reason, row.blocked_by) &&
  (row.is_stop_sell === true || (row.available_units === 0 && !isManualSource(row.external_system)));

/** The restriction kinds a single night row carries. */
function kindsOnRow(row: AvailabilityNightRow): { kind: RestrictionKind; value: number | null }[] {
  const out: { kind: RestrictionKind; value: number | null }[] = [];
  if (isBlocked(row)) out.push({ kind: "block", value: null });
  if ((row.minimum_stay ?? 0) > 0) out.push({ kind: "min_stay", value: row.minimum_stay! });
  if ((row.maximum_stay ?? 0) > 0) out.push({ kind: "max_stay", value: row.maximum_stay! });
  if ((row.lead_days_advance ?? 0) > 0) out.push({ kind: "lead_advance", value: row.lead_days_advance! });
  if ((row.lead_days_post ?? 0) > 0) out.push({ kind: "lead_post", value: row.lead_days_post! });
  return out;
}

const spanIdentity = (
  row: AvailabilityNightRow,
  kind: RestrictionKind,
  value: number | null,
): string =>
  [
    row.property_id,
    row.room_type.trim().toLowerCase(),
    kind,
    value ?? "",
    (row.blocked_reason ?? "").trim().toLowerCase(),
    (row.external_system ?? "").trim().toLowerCase(),
  ].join("|");

/**
 * Group night rows into spans: one per (property, room type, kind, value, reason, source),
 * split wherever the dates are not consecutive.
 */
export function buildRestrictionSpans(
  rows: AvailabilityNightRow[],
  propertyNames?: Record<string, string>,
): RestrictionSpan[] {
  const buckets = new Map<string, { row: AvailabilityNightRow; kind: RestrictionKind; value: number | null; dates: string[] }>();

  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  for (const row of sorted) {
    for (const { kind, value } of kindsOnRow(row)) {
      const id = spanIdentity(row, kind, value);
      const existing = buckets.get(id);
      if (existing) existing.dates.push(row.date);
      else buckets.set(id, { row, kind, value, dates: [row.date] });
    }
  }

  const spans: RestrictionSpan[] = [];
  for (const [id, bucket] of buckets) {
    // Split on gaps so two separate blocks never merge into one bogus range.
    let run: string[] = [];
    const flush = () => {
      if (run.length === 0) return;
      const start = run[0];
      const end = run[run.length - 1];
      const source = bucket.row.external_system ?? null;
      spans.push({
        key: `${id}|${start}`,
        kind: bucket.kind,
        propertyId: bucket.row.property_id,
        propertyName: propertyNames?.[bucket.row.property_id],
        target: bucket.row.room_type,
        start,
        end,
        nights: run.length,
        value: bucket.value,
        reason: bucket.row.blocked_reason ?? null,
        attributionLabel: bucket.row.blocked_by_label ?? null,
        attributedAt: bucket.row.blocked_at ?? null,
        source,
        editable: isManualSource(source),
        dates: [...run],
      });
      run = [];
    };
    for (const date of bucket.dates) {
      if (run.length === 0) {
        run.push(date);
        continue;
      }
      const prev = parseISO(run[run.length - 1]);
      if (differenceInCalendarDays(parseISO(date), prev) === 1) run.push(date);
      else {
        flush();
        run.push(date);
      }
    }
    flush();
  }

  return spans.sort((a, b) => a.start.localeCompare(b.start) || a.target.localeCompare(b.target));
}

export interface RatePlanClosureRow {
  rate_plan_id: string;
  property_id: string;
  date: string;
  planName?: string;
}

/** Same grouping for rate-plan closures (delete-only spans). */
export function buildRatePlanClosureSpans(
  rows: RatePlanClosureRow[],
  planNames: Record<string, string>,
  propertyNames?: Record<string, string>,
): RestrictionSpan[] {
  const byPlan = new Map<string, RatePlanClosureRow[]>();
  for (const row of [...rows].sort((a, b) => a.date.localeCompare(b.date))) {
    const list = byPlan.get(row.rate_plan_id) || [];
    list.push(row);
    byPlan.set(row.rate_plan_id, list);
  }

  const spans: RestrictionSpan[] = [];
  for (const [planId, list] of byPlan) {
    let run: RatePlanClosureRow[] = [];
    const flush = () => {
      if (run.length === 0) return;
      spans.push({
        key: `rate_plan|${planId}|${run[0].date}`,
        kind: "rate_plan_closure",
        propertyId: run[0].property_id,
        propertyName: propertyNames?.[run[0].property_id],
        target: planNames[planId] || "Rate plan",
        ratePlanId: planId,
        start: run[0].date,
        end: run[run.length - 1].date,
        nights: run.length,
        value: null,
        reason: null,
        attributionLabel: null,
        attributedAt: null,
        source: "manual",
        editable: true,
        dates: run.map((r) => r.date),
      });
      run = [];
    };
    for (const row of list) {
      if (run.length === 0) {
        run.push(row);
        continue;
      }
      if (differenceInCalendarDays(parseISO(row.date), parseISO(run[run.length - 1].date)) === 1) run.push(row);
      else {
        flush();
        run.push(row);
      }
    }
    flush();
  }
  return spans.sort((a, b) => a.start.localeCompare(b.start));
}

/* ────────────────────────────── writers ────────────────────────────── */

const dateList = (start: string, end: string): string[] =>
  eachDayOfInterval({ start: parseISO(start), end: parseISO(end) }).map((d) => format(d, "yyyy-MM-dd"));

const KIND_COLUMN: Partial<Record<RestrictionKind, "minimum_stay" | "maximum_stay" | "lead_days_advance" | "lead_days_post">> = {
  min_stay: "minimum_stay",
  max_stay: "maximum_stay",
  lead_advance: "lead_days_advance",
  lead_post: "lead_days_post",
};

/** The columns each restriction kind owns — clearing one never touches another's. */
const CLEARED_FIELDS: Record<Exclude<RestrictionKind, "rate_plan_closure">, Record<string, unknown>> = {
  block: {
    is_stop_sell: false,
    available_units: null,
    blocked_by: null,
    blocked_by_label: null,
    blocked_reason: null,
    blocked_at: null,
  },
  min_stay: { minimum_stay: null },
  max_stay: { maximum_stay: null },
  lead_advance: { lead_days_advance: null },
  lead_post: { lead_days_post: null },
};

/**
 * Clear one restriction from a set of nights. Only that restriction's own columns are reset;
 * every other rule on the same night survives. The night row itself is deleted only once
 * nothing meaningful is left on it.
 */
export async function clearNights(
  propertyId: string,
  roomType: string,
  dates: string[],
  kind: RestrictionKind,
): Promise<void> {
  if (dates.length === 0 || kind === "rate_plan_closure") return;

  const patch = CLEARED_FIELDS[kind];
  if (!patch) return;

  const { data, error } = await supabase
    .from("property_availability")
    .select(
      "id, property_id, room_type, date, available_units, is_stop_sell, minimum_stay, maximum_stay, lead_days_advance, lead_days_post, external_system",
    )
    .eq("property_id", propertyId)
    .eq("room_type", roomType)
    .in("date", dates);
  if (error) throw error;

  const rows = (data || []) as AvailabilityNightRow[];
  const emptyIds: string[] = [];
  for (const row of rows) {
    const next = { ...row, ...patch } as AvailabilityNightRow;
    const stillMeaningful =
      isBlocked(next) ||
      (next.minimum_stay ?? 0) > 0 ||
      (next.maximum_stay ?? 0) > 0 ||
      (next.lead_days_advance ?? 0) > 0 ||
      (next.lead_days_post ?? 0) > 0;
    if (stillMeaningful) {
      const { error: upErr } = await supabase
        .from("property_availability")
        .update(patch as never)
        .eq("id", row.id!);
      if (upErr) throw upErr;
    } else if (row.id) {
      emptyIds.push(row.id);
    }
  }
  if (emptyIds.length > 0) {
    const { error: delErr } = await supabase.from("property_availability").delete().in("id", emptyIds);
    if (delErr) throw delErr;
  }
}

async function writeNights(
  propertyId: string,
  roomType: string,
  dates: string[],
  kind: RestrictionKind,
  value: number | null,
  reason: string | null,
): Promise<void> {
  if (dates.length === 0) return;

  if (kind === "block") {
    const attribution = await currentBlockAttribution(reason);
    const records = dates.map((date) => ({
      property_id: propertyId,
      room_type: roomType,
      date,
      is_stop_sell: true,
      available_units: 0,
      external_system: "manual",
      ...attribution,
    }));
    const { error } = await supabase
      .from("property_availability")
      .upsert(records as never, { onConflict: "property_id,room_type,date", ignoreDuplicates: false });
    if (error) throw error;
    return;
  }

  const column = KIND_COLUMN[kind];
  if (!column) return;
  const records = dates.map((date) => ({
    property_id: propertyId,
    room_type: roomType,
    date,
    external_system: "manual",
    [column]: value,
  }));
  const { error } = await supabase
    .from("property_availability")
    .upsert(records as never, { onConflict: "property_id,room_type,date", ignoreDuplicates: false });
  if (error) throw error;
}

export interface RestrictionSpanEdit {
  start: string;
  end: string;
  value: number | null;
  reason: string | null;
}

/** Rewrite a span: drop the nights that fell out of the range, write the ones that came in. */
export async function applyRestrictionSpan(span: RestrictionSpan, edit: RestrictionSpanEdit): Promise<void> {
  if (span.kind === "rate_plan_closure") {
    await applyRatePlanClosureSpan(span, edit);
    return;
  }
  const nextDates = dateList(edit.start, edit.end);
  const nextSet = new Set(nextDates);
  const removed = span.dates.filter((d) => !nextSet.has(d));

  await clearNights(span.propertyId, span.target, removed, span.kind);
  await writeNights(span.propertyId, span.target, nextDates, span.kind, edit.value, edit.reason);
}

/** Shift a span by whole days, keeping its length. */
export async function moveRestrictionSpan(span: RestrictionSpan, offsetDays: number): Promise<void> {
  if (offsetDays === 0) return;
  const start = format(addDays(parseISO(span.start), offsetDays), "yyyy-MM-dd");
  const end = format(addDays(parseISO(span.end), offsetDays), "yyyy-MM-dd");
  return moveRestrictionSpanTo(span, start, end);
}

/** Relocate a span to an explicit start date, keeping its length. */
export async function moveRestrictionSpanToStart(span: RestrictionSpan, newStart: string): Promise<void> {
  const length = differenceInCalendarDays(parseISO(span.end), parseISO(span.start));
  const end = format(addDays(parseISO(newStart), length), "yyyy-MM-dd");
  return moveRestrictionSpanTo(span, newStart, end);
}

async function moveRestrictionSpanTo(span: RestrictionSpan, start: string, end: string): Promise<void> {
  if (span.kind === "rate_plan_closure") {
    await removeRestrictionSpan(span);
    await writeRatePlanClosure(span, dateList(start, end));
    return;
  }
  const nextDates = dateList(start, end);
  const nextSet = new Set(nextDates);
  await clearNights(
    span.propertyId,
    span.target,
    span.dates.filter((d) => !nextSet.has(d)),
    span.kind,
  );
  await writeNights(span.propertyId, span.target, nextDates, span.kind, span.value, span.reason);
}

/** Remove a span entirely. */
export async function removeRestrictionSpan(span: RestrictionSpan): Promise<void> {
  if (span.kind === "rate_plan_closure") {
    const { error } = await supabase
      .from("rolos_rate_plan_stop_sell")
      .delete()
      .eq("rate_plan_id", span.ratePlanId!)
      .in("date", span.dates);
    if (error) throw error;
    return;
  }
  await clearNights(span.propertyId, span.target, span.dates, span.kind);
}

async function writeRatePlanClosure(span: RestrictionSpan, dates: string[]): Promise<void> {
  const { data: user } = await supabase.auth.getUser();
  const records = dates.map((date) => ({
    rate_plan_id: span.ratePlanId!,
    property_id: span.propertyId,
    date,
    created_by: user.user?.id ?? null,
  }));
  const { error } = await supabase
    .from("rolos_rate_plan_stop_sell")
    .upsert(records as never, { onConflict: "rate_plan_id,date", ignoreDuplicates: true });
  if (error) throw error;
}

async function applyRatePlanClosureSpan(span: RestrictionSpan, edit: RestrictionSpanEdit): Promise<void> {
  const nextDates = dateList(edit.start, edit.end);
  const nextSet = new Set(nextDates);
  const removed = span.dates.filter((d) => !nextSet.has(d));
  if (removed.length > 0) {
    const { error } = await supabase
      .from("rolos_rate_plan_stop_sell")
      .delete()
      .eq("rate_plan_id", span.ratePlanId!)
      .in("date", removed);
    if (error) throw error;
  }
  await writeRatePlanClosure(span, nextDates);
}

/** Human summary, e.g. "14 – 21 Aug 2026 · 8 nights". */
export function formatSpanRange(span: { start: string; end: string; nights: number }): string {
  const start = parseISO(span.start);
  const end = parseISO(span.end);
  const startLabel =
    start.getFullYear() === end.getFullYear()
      ? format(start, start.getMonth() === end.getMonth() ? "d" : "d MMM")
      : format(start, "d MMM yyyy");
  return `${startLabel} – ${format(end, "d MMM yyyy")} · ${span.nights} night${span.nights === 1 ? "" : "s"}`;
}

/** "By Dawie Kotze · 12 Aug 2026 09:14" / "Channel Manager". */
export function formatSpanAttribution(span: RestrictionSpan): string {
  const who = span.attributionLabel || systemBlockLabel(span.source);
  if (!who) return "Source unknown";
  const when = span.attributedAt ? format(new Date(span.attributedAt), "d MMM yyyy HH:mm") : null;
  return when ? `By ${who} · ${when}` : who;
}
