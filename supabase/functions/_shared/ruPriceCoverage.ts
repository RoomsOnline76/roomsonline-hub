// Independent channel price-coverage audit.
//
// The push read-back only re-reads the seasons we just sent, inside the window we just sent, and a
// read that could not be performed at all was still recorded as a success. That made a channel-side
// pricing shortfall invisible ("Please add more seasons with defined prices in the upcoming year").
//
// This module answers the question from the channel's own answer instead:
//
//   "for every night of the next year, does the channel hold a price above zero for this listing?"
//
// Verdicts:
//   verified          – the channel covers the whole audited window
//   channel_short     – the channel is short but ROL'OS holds a full priced year → safe to re-push
//   local_incomplete  – ROL'OS itself has unpriced nights → a push would re-send the same gap
//   unverified        – the read-back could not be performed (rate limited / unreadable)

import { invokeRuWithRetry } from './ruInvokeRetry.ts';
import { parseRuPriceSeasons } from './ruPriceParsing.ts';
import { computeLocalBookableWindow } from './ruLocalWindow.ts';
import { resolveRuChildAuth } from './ruBookingSync.ts';

export type PriceCoverageVerdict = 'verified' | 'channel_short' | 'local_incomplete' | 'unverified';

export interface PriceCoverageResult {
  verdict: PriceCoverageVerdict;
  property_id: string;
  channel_listing_id: string;
  unit_name: string | null;
  room_type_id: string | null;
  window_from: string;
  window_to: string;
  expected_days: number;
  channel_priced_days: number;
  channel_seasons: number;
  channel_zero_priced_days: number;
  /** First night inside the window the channel holds no usable price for. */
  first_gap_date: string | null;
  /** Consecutive missing nights starting at `first_gap_date`. */
  gap_length: number;
  local_unpriced_days: number;
  local_first_gap_date: string | null;
  gap_summary: string | null;
  error_message: string | null;
}

const AUDIT_DAYS = 365;
/** Nights at the very end of the window that may be unpriced without counting as a gap. */
const TAIL_TOLERANCE_DAYS = 10;

function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The channel never serves the current day, so the audit window starts tomorrow. */
function auditWindow(days: number): { from: string; to: string } {
  const from = addDays(new Date().toISOString().slice(0, 10), 1);
  return { from, to: addDays(from, days - 1) };
}

export interface AuditOptions {
  propertyId: string;
  ruPropertyId: number | string;
  unitName?: string | null;
  roomTypeId?: string | null;
  childAuth?: Record<string, unknown> | null;
  days?: number;
  /** Skip the local-pricing evaluation when the caller already knows it is complete. */
  localUnpricedDays?: number;
  localFirstGapDate?: string | null;
  /**
   * A `get_prices` response the caller already holds (the post-push verification read-back).
   * Supplying it makes the audit free: the channel allows roughly one price read per sliding
   * minute, so pulling the same year twice back-to-back only earned a 429 on the second read.
   */
  priceXml?: string | null;
  /** Window the supplied `priceXml` covers. Ignored unless `priceXml` is set. */
  windowFrom?: string | null;
  windowTo?: string | null;
}


/**
 * Pull the channel's own stored prices for the next year and derive coverage from that answer.
 * Never throws — an unreadable read becomes an `unverified` verdict.
 */
export async function auditChannelPriceCoverage(
  admin: any,
  opts: AuditOptions,
): Promise<PriceCoverageResult> {
  const days = opts.days ?? AUDIT_DAYS;
  const supplied = typeof opts.priceXml === 'string' && opts.priceXml.trim().length > 0
    ? { xml: opts.priceXml, from: opts.windowFrom ?? null, to: opts.windowTo ?? null }
    : null;
  const fallbackWindow = auditWindow(days);
  const from = supplied?.from ?? fallbackWindow.from;
  const to = supplied?.to ?? fallbackWindow.to;
  const expectedDays = Math.max(
    1,
    Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1,
  );
  const listingId = String(opts.ruPropertyId ?? '').trim();

  const result: PriceCoverageResult = {
    verdict: 'unverified',
    property_id: opts.propertyId,
    channel_listing_id: listingId,
    unit_name: opts.unitName ?? null,
    room_type_id: opts.roomTypeId ?? null,
    window_from: from,
    window_to: to,
    expected_days: Number.isFinite(expectedDays) ? expectedDays : days,
    channel_priced_days: 0,
    channel_seasons: 0,
    channel_zero_priced_days: 0,
    first_gap_date: null,
    gap_length: 0,
    local_unpriced_days: 0,
    local_first_gap_date: opts.localFirstGapDate ?? null,
    gap_summary: null,
    error_message: null,
  };

  if (!listingId) {
    result.error_message = 'No channel listing id for this unit';
    return result;
  }

  let rawXml = supplied?.xml ?? null;

  if (!rawXml) {
    // Owner-scoped credentials are mandatory: an unscoped read hits the master account and comes
    // back "Property does not exist", which previously looked like a channel-side gap.
    let childAuth = opts.childAuth ?? null;
    if (!childAuth || !(childAuth as Record<string, unknown>).owner_id) {
      childAuth = await resolveRuChildAuth(admin, opts.propertyId);
    }
    if (!childAuth) {
      result.error_message = 'No channel sub-account credentials resolved for this property';
      return result;
    }

    const attempt = await invokeRuWithRetry(
      admin,
      { action: 'get_prices', ru_property_id: Number(listingId), date_from: from, date_to: to, property_id: opts.propertyId, ...childAuth },
      { label: `price_coverage ${listingId}` },
    );

    if (!attempt.ok || !attempt.data?.raw_xml) {
      result.error_message = attempt.message || attempt.errorCode || 'Channel price read-back could not be performed';
      result.gap_summary = 'Price coverage could not be verified at the channel — re-queued for another read.';
      return result;
    }
    rawXml = String(attempt.data.raw_xml);
  }

  const seasons = parseRuPriceSeasons(String(rawXml)).filter(
    (s): s is typeof s & { date_from: string; date_to: string } => Boolean(s.date_from && s.date_to),

  );
  result.channel_seasons = seasons.length;

  const priced = new Set<string>();
  let zeroPriced = 0;
  for (const s of seasons) {
    const price = typeof s.price === 'number' ? s.price : Number(s.price ?? 0);
    const usable = Number.isFinite(price) && price > 0;
    const start = new Date(s.date_from + 'T00:00:00Z');
    const end = new Date(s.date_to + 'T00:00:00Z');
    for (const d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      const iso = d.toISOString().slice(0, 10);
      if (iso < from || iso > to) continue;
      if (usable) priced.add(iso);
      else zeroPriced += 1;
    }
  }
  result.channel_priced_days = priced.size;
  result.channel_zero_priced_days = zeroPriced;

  // First missing night and how long the gap runs.
  let lastMissingIndex = -1;
  let firstMissingIndex = -1;
  for (let i = 0; i < result.expected_days; i++) {
    const iso = addDays(from, i);
    if (!priced.has(iso)) {
      if (firstMissingIndex < 0) firstMissingIndex = i;
      lastMissingIndex = i;
    }
    if (priced.has(iso)) {
      if (result.first_gap_date) break;
      continue;
    }
    if (!result.first_gap_date) result.first_gap_date = iso;
    result.gap_length += 1;
  }

  // The channel's own year rolls a few nights behind ours: rates are held to the end of the last
  // authored season, so the final handful of nights in a 365-day window are routinely unpriced with
  // nothing wrong locally. Treating that tail as a gap made the wizard warning impossible to clear —
  // a re-check would pass the read and still paint amber. Only real gaps inside the window count.
  const tailOnly =
    firstMissingIndex >= 0 && firstMissingIndex >= result.expected_days - TAIL_TOLERANCE_DAYS && lastMissingIndex === result.expected_days - 1;
  const channelComplete = result.channel_priced_days >= result.expected_days || tailOnly;

  // Local truth: only consulted when the channel is short, because a complete channel year needs
  // no repair regardless of how ROL'OS authored it.
  if (!channelComplete) {
    if (typeof opts.localUnpricedDays === 'number') {
      result.local_unpriced_days = opts.localUnpricedDays;
    } else {
      try {
        const local = await computeLocalBookableWindow(admin, opts.propertyId, { days });
        const unit = opts.unitName
          ? local.unit_windows.find((u) => u.name.trim().toLowerCase() === String(opts.unitName).trim().toLowerCase())
          : null;
        result.local_unpriced_days = unit ? unit.unpriced_open_days : local.unpriced_open_days;
      } catch (e) {
        result.local_unpriced_days = 0;
        result.error_message = e instanceof Error ? e.message : 'Local pricing evaluation failed';
      }
    }
  }

  if (channelComplete) {
    result.verdict = 'verified';
    result.gap_summary = tailOnly && result.channel_priced_days < result.expected_days
      ? `The channel holds prices for ${result.channel_priced_days} of ${result.expected_days} nights — the shortfall is only the tail of the rolling year and clears as seasons roll forward.`
      : null;
  } else if (result.local_unpriced_days > 0) {
    result.verdict = 'local_incomplete';
    result.gap_summary = `${result.local_unpriced_days} night${result.local_unpriced_days === 1 ? '' : 's'} in the next year have no rate in ROL'OS — author them in Rate Manager and the channel will be updated automatically.`;
  } else {
    result.verdict = 'channel_short';
    const missing = result.expected_days - result.channel_priced_days;
    result.gap_summary = `The channel holds prices for ${result.channel_priced_days} of ${result.expected_days} nights${result.first_gap_date ? ` (first gap ${result.first_gap_date}, ${result.gap_length} night${result.gap_length === 1 ? '' : 's'})` : ''} — ${missing} night${missing === 1 ? '' : 's'} short. Rates are being re-sent.`;

  }

  return result;
}

/** Persist the verdict so the wizard/console reads a stored answer instead of re-probing. */
export async function persistPriceCoverage(
  admin: any,
  result: PriceCoverageResult,
  extra: { repush_attempts?: number; last_repush_at?: string | null; details?: Record<string, unknown> } = {},
): Promise<void> {
  try {
    const row: Record<string, unknown> = {
      property_id: result.property_id,
      room_type_id: result.room_type_id,
      unit_name: result.unit_name,
      channel: 'rentals_united',
      channel_listing_id: result.channel_listing_id,
      verdict: result.verdict,
      window_from: result.window_from,
      window_to: result.window_to,
      expected_days: result.expected_days,
      channel_priced_days: result.channel_priced_days,
      channel_seasons: result.channel_seasons,
      channel_zero_priced_days: result.channel_zero_priced_days,
      local_unpriced_days: result.local_unpriced_days,
      first_gap_date: result.verdict === 'local_incomplete' ? (result.local_first_gap_date ?? result.first_gap_date) : result.first_gap_date,
      gap_summary: result.gap_summary,
      last_audit_at: new Date().toISOString(),
      error_message: result.error_message,
      details: { gap_length: result.gap_length, ...(extra.details ?? {}) },
    };
    if (typeof extra.repush_attempts === 'number') row.repush_attempts = extra.repush_attempts;
    if (extra.last_repush_at !== undefined) row.last_repush_at = extra.last_repush_at;

    await admin
      .from('channel_price_coverage_status')
      .upsert(row, { onConflict: 'property_id,channel,channel_listing_id' });
  } catch (_e) {
    // Evidence only — never let persistence failure break a push or cron run.
  }
}

/** Current stored attempt count for a listing (used to cap auto re-pushes at one cycle). */
export async function readPriceCoverageAttempts(
  admin: any,
  propertyId: string,
  listingId: string,
): Promise<number> {
  try {
    const { data } = await admin
      .from('channel_price_coverage_status')
      .select('repush_attempts, verdict')
      .eq('property_id', propertyId)
      .eq('channel', 'rentals_united')
      .eq('channel_listing_id', String(listingId))
      .maybeSingle();
    if (!data) return 0;
    // A verified listing that later drifts starts a fresh repair cycle.
    return data.verdict === 'verified' ? 0 : Number(data.repush_attempts ?? 0);
  } catch (_e) {
    return 0;
  }
}
