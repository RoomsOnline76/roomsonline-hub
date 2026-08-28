// ── Rentals United currency resolution ────────────────────────────────────────
// RU stores currency on the LOCATION (LocationID), not on the property. A property
// push carries <CurrencyID>, but RU resolves the effective currency from the location,
// so ZAR only "sticks" when the location itself is set to ZAR.
//
// Order of authority:
//   1. RU location currency (authoritative — what RU actually publishes in)
//   2. Property's authored currency (banking/amenities)
//   3. Country default
//
// When the location is NOT on the authored currency we attempt Push_ChangeCurrency_RQ.
// If RU refuses the flip (shared / master-owned location), we fall back to publishing
// USD-converted rates at a live rate + safety margin, and record that decision so the
// owner-facing Channel Manager notice and the inbound reservation handler can use it.

import { readInvokeErrorBody } from './ruInvokeBody.ts';

export const FX_MARGIN_PCT = 3;
export const FALLBACK_ISO = 'USD';

export const RU_CURRENCY_BY_ISO: Record<string, number> = {
  ZAR: 48, USD: 144, EUR: 47, GBP: 49, NAD: 91, BWP: 24,
};

export const ISO_BY_RU_CURRENCY_ID: Record<number, string> = Object.fromEntries(
  Object.entries(RU_CURRENCY_BY_ISO).map(([iso, id]) => [id, iso]),
);

export type CurrencyDecision = {
  location_id: number;
  authored_iso: string;
  location_iso: string | null;
  published_iso: string;
  conversion_in_force: boolean;
  fx_rate: number | null;
  margin_pct: number;
  effective_rate: number | null;
  flip_outcome: 'not_needed' | 'already_set' | 'already_set_readback' | 'flipped' | 'failed' | 'unknown_location' | 'deferred';
  reason: string;
  /** True when no Push_ChangeCurrency_RQ was sent because the channel already holds the ISO. */
  write_skipped?: boolean;
  skip_reason?: 'currency_already_set' | 'currency_already_set_readback';
  blocked?: boolean;
  block_reason?: string;
  /** The RU account the flip/verification was performed as ('master' or the sub-user OwnerID). */
  owner_scope?: string;
  /** Currency RU itself reported on read-back (Pull_GetProperty_RQ). Null = never verified. */
  ru_reported_iso?: string | null;
  /** Location RU itself reported on the same read-back. Null = not reported. */
  ru_reported_location_id?: number | null;
  verified_at?: string | null;
  verified_ru_property_id?: number | null;

};

/** RU applies currency per authenticating account, so every cached value is scoped to one. */
export function ruOwnerScopeKey(childAuth: Record<string, unknown> = {}): string {
  const owner = (childAuth as Record<string, unknown>)?.owner_id;
  const s = owner == null ? '' : String(owner).trim();
  return s ? s : 'master';
}

/**
 * Scoped location-currency cache. Unlike `ru_locations` (a global dictionary), rows here
 * are per RU account, and `source` records HOW we know: only `ru_readback` is evidence.
 */
export async function getScopedLocationCurrency(
  supabase: any,
  locationId: number,
  ownerScope: string,
): Promise<{ iso: string | null; source: string; verified_at: string | null; stale: boolean } | null> {
  if (!locationId || locationId <= 1) return null;
  try {
    const { data } = await supabase
      .from('ru_location_currency_scope')
      .select('currency_iso, source, verified_at, last_synced_at')
      .eq('location_id', locationId)
      .eq('owner_scope', ownerScope)
      .maybeSingle();
    if (!data) return null;
    const synced = data.last_synced_at ? Date.parse(data.last_synced_at) : 0;
    return {
      iso: data.currency_iso ? String(data.currency_iso).toUpperCase() : null,
      source: data.source ?? 'unverified',
      verified_at: data.verified_at ?? null,
      stale: !synced || Date.now() - synced > 7 * 86400000,
    };
  } catch {
    return null;
  }
}

export async function recordScopedLocationCurrency(
  supabase: any,
  locationId: number,
  ownerScope: string,
  iso: string | null,
  source: 'ru_readback' | 'flip' | 'dictionary' | 'unverified',
): Promise<void> {
  if (!locationId || locationId <= 1) return;
  try {
    await supabase.from('ru_location_currency_scope').upsert({
      location_id: locationId,
      owner_scope: ownerScope,
      currency_iso: iso ? iso.toUpperCase() : null,
      currency_ru_id: iso ? (RU_CURRENCY_BY_ISO[iso.toUpperCase()] ?? null) : null,
      source,
      verified_at: source === 'ru_readback' ? new Date().toISOString() : null,
      last_synced_at: new Date().toISOString(),
    }, { onConflict: 'location_id,owner_scope' });
  } catch (e) {
    console.warn('[ruCurrency] Failed to record scoped location currency:', e instanceof Error ? e.message : e);
  }
}

/**
 * Forget what we believe about a location's currency for ONE account. Used when a
 * post-push read-back reports drift: the stale scoped row must not skip the corrective flip.
 */
export async function clearScopedLocationCurrency(
  supabase: any,
  locationId: number,
  ownerScope: string,
): Promise<void> {
  if (!locationId || locationId <= 1) return;
  try {
    await supabase
      .from('ru_location_currency_scope')
      .delete()
      .eq('location_id', locationId)
      .eq('owner_scope', ownerScope);
  } catch (e) {
    console.warn('[ruCurrency] Failed to clear scoped location currency:', e instanceof Error ? e.message : e);
  }
}


/**
 * Ask RU what currency it actually holds for a listing. This is the only trustworthy
 * source: our own post-flip cache write is an assumption, not an observation.
 */
export async function verifyRuPropertyCurrency(
  supabase: any,
  ruPropertyId: number,
  childAuth: Record<string, unknown> = {},
): Promise<{ iso: string | null; currency_id: number | null; location_id?: number | null; error?: string; deferred?: boolean; retry_after_ms?: number }> {
  if (!ruPropertyId || ruPropertyId <= 0) return { iso: null, currency_id: null, error: 'no ru_property_id' };
  try {
    // Batch verification fans out many invocations; a single transport blip (worker boot
    // limit, cold start) must not be reported as a currency mismatch. Retry transient
    // transport failures before giving up.
    let data: any = null;
    let error: any = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      ({ data, error } = await supabase.functions.invoke('rentalsunited-api', {
        body: { action: 'get_property', ru_property_id: ruPropertyId, ...childAuth },
      }));
      const transient = !!error && /failed to send a request|fetch failed|network|timeout|shutdown|boot/i.test(String(error?.message ?? ''));
      if (!transient) break;
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
    }
    if (error || !data?.success) {
      // The channel allows one identical read per sliding minute. A verification run fired
      // immediately after a successful one is HELD, not refused — it must never be reported
      // as "no currency" (which reads as a failed verification).
      const body = error ? await readInvokeErrorBody(error) : null;
      const errObj = ((body?.error ?? data?.error) ?? null) as { code?: string; message?: string; retry_after_ms?: number } | null;
      const code = String(errObj?.code ?? '');
      const msg = String(errObj?.message ?? error?.message ?? '');
      if (/RU_RATE_DEFERRED/i.test(code) || /rate limit|less than a minute ago/i.test(msg)) {
        return {
          iso: null,
          currency_id: null,
          deferred: true,
          retry_after_ms: Number(errObj?.retry_after_ms) || 60_000,
          error: 'RU_RATE_DEFERRED: the channel allows one identical read per minute — verification is queued.',
        };
      }
      return { iso: null, currency_id: null, error: msg || data?.error?.message || 'Pull_GetProperty failed' };
    }


    // RU reports the listing currency as an ISO attribute on <Property Currency="USD">,
    // not as a <CurrencyID> element — read the attribute first, then fall back.
    let iso: string | null = typeof data.currency_iso === 'string' && data.currency_iso ? String(data.currency_iso).toUpperCase() : null;
    let currencyId: number | null = Number.isFinite(Number(data.currency_id)) ? Number(data.currency_id) : null;
    if (!iso && typeof data.raw_xml === 'string') {
      const attr = data.raw_xml.match(/<Property\b[^>]*\bCurrency="([A-Za-z]{3})"/i);
      if (attr) iso = attr[1].toUpperCase();
    }
    if (currencyId == null && typeof data.raw_xml === 'string') {
      const m = data.raw_xml.match(/<CurrencyID>\s*(\d+)\s*<\/CurrencyID>/i);
      if (m) currencyId = parseInt(m[1], 10);
    }
    if (!iso && currencyId != null) iso = ISO_BY_RU_CURRENCY_ID[currencyId] ?? null;
    if (iso && currencyId == null) currencyId = RU_CURRENCY_BY_ISO[iso] ?? null;
    // The same read carries the listing's published location, so the location comparison
    // costs nothing extra — it must never be a separate write or a separate read.
    const locId = Number(data.detailed_location_id);
    return {
      iso,
      currency_id: currencyId,
      location_id: Number.isFinite(locId) && locId > 0 ? locId : null,
      error: iso == null ? 'RU response carried no currency' : undefined,
    };


  } catch (e) {
    return { iso: null, currency_id: null, error: e instanceof Error ? e.message : 'read-back threw' };
  }
}


// ── RU location cache ────────────────────────────────────────────────────────
export async function getLocationCurrencyIso(
  supabase: any,
  locationId: number,
): Promise<{ iso: string | null; country: string | null; stale: boolean } | null> {
  if (!locationId || locationId <= 1) return null;
  try {
    const { data } = await supabase
      .from('ru_locations')
      .select('currency_iso, country, last_synced_at')
      .eq('id', locationId)
      .maybeSingle();
    if (!data) return null;
    const synced = data.last_synced_at ? Date.parse(data.last_synced_at) : 0;
    return {
      iso: data.currency_iso ? String(data.currency_iso).toUpperCase() : null,
      country: data.country ?? null,
      stale: !synced || Date.now() - synced > 7 * 86400000,
    };
  } catch {
    return null;
  }
}

// Pull RU's master city/currency list and upsert EVERY location (not just southern
// Africa) so currency drift can be detected on any location we might resolve to.
export async function refreshRuLocationsCache(
  supabase: any,
  childAuth: Record<string, unknown> = {},
): Promise<{ success: boolean; upserted: number; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('rentalsunited-api', {
      body: { action: 'list_cities_and_currencies', ...childAuth },
    });
    if (error || !data?.success) {
      return { success: false, upserted: 0, error: error?.message || data?.error?.message || 'list failed' };
    }
    if (data.endpoint_disabled) {
      // Dictionary not enabled for this integration — not an error; the per-location
      // Push_ChangeCurrency probe in decideRuCurrency establishes the currency instead.
      return { success: true, upserted: 0, error: data.note };
    }
    const all: any[] = data.locations || [];
    const ISO_TO_COUNTRY: Record<string, string> = {
      ZAR: 'South Africa', NAD: 'Namibia', BWP: 'Botswana', USD: 'United States', EUR: 'Eurozone', GBP: 'United Kingdom',
    };
    const rows = all
      .filter((l) => Number.isFinite(l?.id))
      .map((l) => ({
        id: l.id,
        name: l.name || `Location ${l.id}`,
        country: ISO_TO_COUNTRY[l.currency_iso] || l.currency_iso || 'Unknown',
        currency_iso: l.currency_iso ? String(l.currency_iso).toUpperCase() : null,
        currency_ru_id: l.currency_iso ? (RU_CURRENCY_BY_ISO[String(l.currency_iso).toUpperCase()] ?? null) : null,
        last_synced_at: new Date().toISOString(),
      }));

    let upserted = 0;
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const { error: upErr } = await supabase.from('ru_locations').upsert(chunk, { onConflict: 'id' });
      if (upErr) return { success: false, upserted, error: upErr.message };
      upserted += chunk.length;
    }
    return { success: true, upserted };
  } catch (e) {
    return { success: false, upserted: 0, error: e instanceof Error ? e.message : 'unknown' };
  }
}

// ── FX ───────────────────────────────────────────────────────────────────────
// rate = units of `quote` per 1 unit of `base` (e.g. ZAR→USD ≈ 0.054).
// Cached for 24h in public.ru_fx_rates; a live fetch failure falls back to the most
// recent cached rate up to 7 days old, and otherwise reports failure (never guesses).
export async function getFxRate(
  supabase: any,
  baseIso: string,
  quoteIso: string,
): Promise<{ rate: number; source: string; fetched_at: string } | { rate: null; error: string }> {
  const base = baseIso.toUpperCase();
  const quote = quoteIso.toUpperCase();
  if (base === quote) return { rate: 1, source: 'identity', fetched_at: new Date().toISOString() };

  let cached: { rate: number; source: string; fetched_at: string } | null = null;
  try {
    const { data } = await supabase
      .from('ru_fx_rates')
      .select('rate, source, fetched_at')
      .eq('base_iso', base)
      .eq('quote_iso', quote)
      .order('fetched_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data?.rate) cached = { rate: Number(data.rate), source: data.source, fetched_at: data.fetched_at };
  } catch { /* cache miss is fine */ }

  const fresh = cached && Date.now() - Date.parse(cached.fetched_at) < 24 * 3600 * 1000;
  if (fresh && cached) return cached;

  try {
    const res = await fetch(`https://open.er-api.com/v6/latest/${base}`);
    const json = await res.json();
    const rate = Number(json?.rates?.[quote]);
    if (!Number.isFinite(rate) || rate <= 0) throw new Error('rate missing in FX response');
    const fetched_at = new Date().toISOString();
    try {
      await supabase.from('ru_fx_rates').insert({ base_iso: base, quote_iso: quote, rate, source: 'open.er-api.com', fetched_at });
    } catch { /* logging failure must not block the push */ }
    return { rate, source: 'open.er-api.com', fetched_at };
  } catch (e) {
    if (cached && Date.now() - Date.parse(cached.fetched_at) < 7 * 86400000) return cached;
    return { rate: null, error: e instanceof Error ? e.message : 'FX fetch failed' };
  }
}

export function applyMargin(rate: number, marginPct = FX_MARGIN_PCT): number {
  return rate * (1 + marginPct / 100);
}

// Published amount in the fallback currency. Rounded UP to a whole unit so FX drift
// and rounding can never underprice a night.
export function convertAmount(amount: number, effectiveRate: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.ceil(amount * effectiveRate);
}

export function convertPriceEntries<T extends { price: number; extra_guest_price?: number | null }>(
  entries: T[],
  effectiveRate: number,
): T[] {
  return entries.map((e) => ({
    ...e,
    price: convertAmount(Number(e.price), effectiveRate),
    extra_guest_price:
      e.extra_guest_price != null && Number(e.extra_guest_price) > 0
        ? convertAmount(Number(e.extra_guest_price), effectiveRate)
        : e.extra_guest_price,
  }));
}

// Reverse a published fallback-currency amount back into the authored currency.
export function revertAmount(amount: number, effectiveRate: number): number {
  if (!Number.isFinite(amount) || amount <= 0 || !effectiveRate) return 0;
  return Math.round((amount / effectiveRate) * 100) / 100;
}

// ── The decision ─────────────────────────────────────────────────────────────
export async function decideRuCurrency(
  supabase: any,
  opts: {
    propertyId: string;
    locationId: number;
    authoredIso: string;
    country?: string | null;
    childAuth?: Record<string, unknown>;
    /** RU account the calls are made as; defaults to childAuth.owner_id or 'master'. */
    ownerScope?: string;
    dryRun?: boolean;
    persist?: boolean;
  },
): Promise<CurrencyDecision> {
  const authored = (opts.authoredIso || 'ZAR').toUpperCase();
  const childAuth = opts.childAuth ?? {};
  const ownerScope = opts.ownerScope || ruOwnerScopeKey(childAuth);
  const marginPct = FX_MARGIN_PCT;

  // Only a read-back from RU on THIS account counts as knowing the currency. The global
  // ru_locations dictionary describes the master account and must never stand in for a
  // white-label sub-user (that is how a USD sub-account reported "ZAR" for months).
  const scoped = await getScopedLocationCurrency(supabase, opts.locationId, ownerScope);
  let cached = ownerScope === 'master' ? await getLocationCurrencyIso(supabase, opts.locationId) : null;
  if (ownerScope === 'master' && (!cached || !cached.iso || cached.stale)) {
    await refreshRuLocationsCache(supabase, childAuth);
    cached = await getLocationCurrencyIso(supabase, opts.locationId);
  }

  const decide = (d: Omit<CurrencyDecision, 'location_id' | 'authored_iso' | 'margin_pct'>): CurrencyDecision => ({
    location_id: opts.locationId,
    authored_iso: authored,
    margin_pct: marginPct,
    owner_scope: ownerScope,
    ...d,
  });

  const verifiedIso = scoped?.source === 'ru_readback' && !scoped.stale ? scoped.iso : null;
  const locationIso = verifiedIso ?? (ownerScope === 'master' ? cached?.iso ?? null : null);

  // Verified-by-read-back only: an assumed value never short-circuits the flip.
  if (verifiedIso && verifiedIso === authored) {
    const d = decide({
      location_iso: verifiedIso,
      published_iso: authored,
      conversion_in_force: false,
      fx_rate: null,
      effective_rate: null,
      flip_outcome: 'already_set',
      ru_reported_iso: verifiedIso,
      verified_at: scoped?.verified_at ?? new Date().toISOString(),
      write_skipped: true,
      skip_reason: 'currency_already_set',
      reason: `Rentals United confirmed location ${opts.locationId} holds ${authored} for account ${ownerScope}.`,
    });
    await persistDecision(supabase, opts.propertyId, d, opts.persist !== false && !opts.dryRun);
    return d;
  }

  /**
   * A previous successful write on THIS account (recorded as an assumption, source 'flip')
   * is enough to skip a *repeat* write for the same OwnerID + LocationID + ISO. It does not
   * count as verification, so the ZAR-vs-USD publication decision is unchanged: the value is
   * the authored ISO either way, and the read-back path still owns the verified verdict.
   */
  if (!verifiedIso && scoped?.source === 'flip' && !scoped.stale && scoped.iso === authored) {
    const d = decide({
      location_iso: authored,
      published_iso: authored,
      conversion_in_force: false,
      fx_rate: null,
      effective_rate: null,
      flip_outcome: 'already_set',
      write_skipped: true,
      skip_reason: 'currency_already_set',
      reason: `Location ${opts.locationId} was already set to ${authored} on account ${ownerScope} by an earlier write — no currency write needed.`,
    });
    await persistDecision(supabase, opts.propertyId, d, opts.persist !== false && !opts.dryRun);
    return d;
  }

  /**
   * No scoped location read-back, but this property already carries a durable, listing-level
   * verdict from the channel's own answer on the SAME account and location for the SAME ISO.
   * Firing Push_ChangeCurrency_RQ again in that state changes nothing at the channel and only
   * burns a write inside the sliding minute (it is what throttled the tail of an onboarding run).
   */
  if (!verifiedIso) {
    const durable = await loadCurrencyState(supabase, opts.propertyId);
    const durableIso = String(durable?.ru_reported_currency_iso ?? '').toUpperCase();
    const durableScope = String(durable?.owner_scope ?? '').trim();
    const sameScope = !durableScope || durableScope === ownerScope;
    const sameLocation = !durable?.ru_location_id || Number(durable.ru_location_id) === Number(opts.locationId);
    if (durable?.verified_at && durableIso === authored && sameScope && sameLocation) {
      const d = decide({
        location_iso: authored,
        published_iso: authored,
        conversion_in_force: false,
        fx_rate: null,
        effective_rate: null,
        flip_outcome: 'already_set',
        ru_reported_iso: authored,
        verified_at: String(durable.verified_at),
        write_skipped: true,
        skip_reason: 'currency_already_set',
        reason: `Rentals United already reported ${authored} for this listing on account ${ownerScope} (verified ${durable.verified_at}) — no currency write needed.`,
      });
      await persistDecision(supabase, opts.propertyId, d, opts.persist !== false && !opts.dryRun);
      return d;
    }
  }

  /**
   * NOTE: cross-account location knowledge is deliberately NOT consulted here. Rentals United
   * applies a location's currency per authenticating account, so another OwnerID's answer is not
   * evidence for this one — skipping the write on it left brand-new sub-accounts publishing USD
   * while the tracker echoed our own assumption back as ZAR. A first list on a new OwnerID always
   * sends exactly one child-scoped Push_ChangeCurrency_RQ.
   */






  // Location currency unknown or unverified — attempt the flip as the owning account;
  // a 339 ("already set") tells us it was correct all along.
  let flip: CurrencyDecision['flip_outcome'] = locationIso ? 'failed' : 'unknown_location';
  let flipMessage = '';
  if (!opts.dryRun) {
    try {
      const { data, error } = await supabase.functions.invoke('rentalsunited-api', {
        body: { action: 'push_change_currency', location_id: opts.locationId, currency_iso: authored, ...childAuth },
      });
      if (error || !data?.success) {
        // Our own sliding-window rate gate answers an identical repeat call with 429 /
        // RU_RATE_DEFERRED. That is *not* RU refusing ZAR — treating it as a refusal used to
        // tip the property into the USD conversion fallback on nothing but a repeat click.
        const errBody = error ? await readInvokeErrorBody(error) : null;
        const errCode = String((errBody as any)?.error?.code ?? (data as any)?.error?.code ?? '');
        const errText = String(error?.message ?? (data as any)?.error?.message ?? '');
        if (errCode === 'RU_RATE_DEFERRED' || /RU_RATE_DEFERRED|rate limit/i.test(errText)) {
          flip = 'deferred';
          flipMessage = ((errBody as any)?.error?.message as string) || errText || 'Channel rate limit — flip deferred';
        } else {
          flip = 'failed';
          flipMessage = errText || 'Push_ChangeCurrency was refused';
        }
      } else {
        flip = data.already_set ? 'already_set' : 'flipped';
        // Record as an ASSUMPTION scoped to this account (source: 'flip'), pending read-back.
        await recordScopedLocationCurrency(supabase, opts.locationId, ownerScope, authored, 'flip');
        // The global dictionary only ever describes the master account.
        if (ownerScope === 'master') {
          await supabase.from('ru_locations').upsert({
            id: opts.locationId,
            name: `Location ${opts.locationId}`,
            country: opts.country || cached?.country || 'Unknown',
            currency_iso: authored,
            currency_ru_id: RU_CURRENCY_BY_ISO[authored] ?? null,
            last_synced_at: new Date().toISOString(),
          }, { onConflict: 'id' });
        }
      }
    } catch (e) {
      flip = 'failed';
      flipMessage = e instanceof Error ? e.message : 'Push_ChangeCurrency threw';
    }
  }


  if (flip === 'deferred') {
    // Inconclusive: keep publishing in the authored currency and let the next run confirm.
    const d = decide({
      location_iso: locationIso,
      published_iso: authored,
      conversion_in_force: false,
      fx_rate: null,
      effective_rate: null,
      flip_outcome: 'deferred',
      reason: `Currency flip for location ${opts.locationId} was deferred by the channel rate limit${flipMessage ? ` (${flipMessage})` : ''}. ${authored} is retained; the flip will be retried.`,
    });
    await persistDecision(supabase, opts.propertyId, d, opts.persist !== false && !opts.dryRun);
    return d;
  }

  if (flip === 'flipped' || flip === 'already_set') {
    // "Already set" is Rentals United answering, on THIS account, that the location holds the
    // authored currency (status 339). That answer IS a read-back — recording it as an
    // assumption left the property permanently "currency unverified" and blocked onboarding
    // for every listing whose currency was correct from the start.
    const readBack = flip === 'already_set';
    if (readBack) {
      await recordScopedLocationCurrency(supabase, opts.locationId, ownerScope, authored, 'ru_readback');
    }
    const d = decide({
      location_iso: authored,
      published_iso: authored,
      conversion_in_force: false,
      fx_rate: null,
      effective_rate: null,
      flip_outcome: flip,
      ...(readBack ? { ru_reported_iso: authored, verified_at: new Date().toISOString() } : {}),
      reason:
        flip === 'flipped'
          ? `Rentals United location ${opts.locationId} was switched to ${authored}; rates publish in ${authored}.`
          : `Rentals United confirmed location ${opts.locationId} already holds ${authored} for account ${ownerScope}.`,
    });
    await persistDecision(supabase, opts.propertyId, d, opts.persist !== false && !opts.dryRun);
    return d;
  }


  // ZAR cannot be held for this location → USD fallback with live rate + margin.
  const fx = await getFxRate(supabase, authored, FALLBACK_ISO);
  if (fx.rate == null) {
    const d = decide({
      location_iso: locationIso,
      published_iso: authored,
      conversion_in_force: false,
      fx_rate: null,
      effective_rate: null,
      flip_outcome: flip,
      reason: `Rentals United will not hold ${authored} for location ${opts.locationId}${flipMessage ? ` (${flipMessage})` : ''}, and no ${authored}→${FALLBACK_ISO} rate is available.`,
      blocked: true,
      block_reason: `RU_FX_UNAVAILABLE: cannot publish rates — Rentals United refused ${authored} for location ${opts.locationId} and no exchange rate could be obtained (${(fx as any).error}). Prices were not sent.`,
    });
    await persistDecision(supabase, opts.propertyId, d, opts.persist !== false && !opts.dryRun);
    return d;
  }

  const effective = applyMargin(fx.rate, marginPct);
  const d = decide({
    location_iso: locationIso,
    published_iso: FALLBACK_ISO,
    conversion_in_force: true,
    fx_rate: fx.rate,
    effective_rate: effective,
    flip_outcome: flip,
    reason: `Rentals United holds ${locationIso ?? 'a non-' + authored + ' currency'} for location ${opts.locationId} and refused a switch to ${authored}${flipMessage ? ` (${flipMessage})` : ''}. Rates are published in ${FALLBACK_ISO} at ${fx.rate.toFixed(5)} + ${marginPct}% margin.`,
  });
  await persistDecision(supabase, opts.propertyId, d, opts.persist !== false && !opts.dryRun);
  return d;
}

export async function persistDecision(
  supabase: any,
  propertyId: string,
  d: CurrencyDecision,
  enabled = true,
): Promise<void> {
  if (!enabled || !propertyId) return;
  const { error } = await supabase.from('ru_currency_state').upsert({
      property_id: propertyId,
      ru_location_id: d.location_id,
      location_currency_iso: d.location_iso,
      authored_currency_iso: d.authored_iso,
      published_currency_iso: d.published_iso,
      conversion_in_force: d.conversion_in_force,
      fx_rate: d.fx_rate,
      margin_pct: d.margin_pct,
      effective_rate: d.effective_rate,
      reason: d.reason,
      flip_outcome: d.flip_outcome,
      owner_scope: d.owner_scope ?? null,
      ru_reported_currency_iso: d.ru_reported_iso ?? null,
      verified_at: d.verified_at ?? null,
      verified_ru_property_id: d.verified_ru_property_id ?? null,
      decided_at: new Date().toISOString(),
    }, { onConflict: 'property_id' });
  if (error) {
    console.error('[ruCurrency] Failed to persist currency decision:', error.message);
    throw new Error(`RU_CURRENCY_STATE_PERSIST_FAILED: ${error.message}`);
  }
}

/**
 * Read the currency RU actually holds for one pushed listing and write it to state.
 * Drift (RU says USD while we authored ZAR) is recorded as flip_outcome 'failed' so the
 * tracker shows red instead of echoing our own assumption back at us.
 */
export async function verifyAndRecordCurrency(
  supabase: any,
  opts: {
    propertyId: string;
    locationId: number;
    authoredIso: string;
    ruPropertyId: number;
    childAuth?: Record<string, unknown>;
    ownerScope?: string;
    decision?: CurrencyDecision | null;
    /**
     * Currency already read back for this listing by the caller. The channel allows one
     * identical read per sliding minute, so re-reading here was deferred and the verdict was
     * never persisted — a visibly "verified" run left no `ru_currency_state` row and the
     * wizard gate stayed open. Reuse the caller's answer instead.
     */
    knownIso?: string | null;
    /** Location already read back for this listing by the caller (same single read). */
    knownLocationId?: number | null;
    /** Location we authored locally, so the read-back doubles as the location verdict. */
    expectedLocationId?: number | null;
  },
): Promise<{
  ru_reported_iso: string | null;
  matches: boolean;
  persisted: boolean;
  error?: string;
  ru_reported_location_id?: number | null;
  location_matches?: boolean | null;
}> {
  const childAuth = opts.childAuth ?? {};
  const ownerScope = opts.ownerScope || ruOwnerScopeKey(childAuth);
  const expected = (opts.decision?.published_iso || opts.authoredIso || 'ZAR').toUpperCase();
  const readback = opts.knownIso
    ? { iso: opts.knownIso, location_id: opts.knownLocationId ?? null, error: undefined as string | undefined }
    : await verifyRuPropertyCurrency(supabase, opts.ruPropertyId, childAuth);
  if (!readback.iso) {
    return { ru_reported_iso: null, matches: false, persisted: false, error: readback.error };
  }

  const iso = readback.iso.toUpperCase();
  await recordScopedLocationCurrency(supabase, opts.locationId, ownerScope, iso, 'ru_readback');

  const reportedLocationId = Number.isFinite(Number(readback.location_id)) && Number(readback.location_id) > 0
    ? Number(readback.location_id)
    : (opts.knownLocationId ?? null);
  const expectedLocationId = Number.isFinite(Number(opts.expectedLocationId)) && Number(opts.expectedLocationId) > 0
    ? Number(opts.expectedLocationId)
    : null;
  const locationMatches = reportedLocationId == null || expectedLocationId == null
    ? null
    : reportedLocationId === expectedLocationId;

  const matches = iso === expected;
  const base = opts.decision ?? {
    location_id: opts.locationId,
    authored_iso: (opts.authoredIso || 'ZAR').toUpperCase(),
    location_iso: iso,
    published_iso: expected,
    conversion_in_force: false,
    fx_rate: null,
    margin_pct: FX_MARGIN_PCT,
    effective_rate: null,
    flip_outcome: 'unknown_location' as CurrencyDecision['flip_outcome'],
    reason: '',
  };
  const wroteThisRun = base.flip_outcome === 'flipped';
  const d: CurrencyDecision = {
    ...base,
    owner_scope: ownerScope,
    location_iso: iso,
    ru_reported_iso: iso,
    ru_reported_location_id: reportedLocationId,
    verified_at: new Date().toISOString(),
    verified_ru_property_id: opts.ruPropertyId,
    flip_outcome: matches ? (wroteThisRun ? 'flipped' : 'already_set_readback') : 'failed',
    ...(matches && !wroteThisRun
      ? { write_skipped: true, skip_reason: 'currency_already_set_readback' as const }
      : {}),
    reason: matches
      ? `Verified against Rentals United: listing ${opts.ruPropertyId} publishes in ${iso} on account ${ownerScope}${wroteThisRun ? '' : ' — already set at the channel, no write sent'}.${base.reason ? ` ${base.reason}` : ''}`
      : `Currency drift: Rentals United reports ${iso} for listing ${opts.ruPropertyId} on account ${ownerScope}, but we publish in ${expected}. The location currency did not take effect for this account.`,
  };
  await persistDecision(supabase, opts.propertyId, d, true);
  return {
    ru_reported_iso: iso,
    matches,
    persisted: true,
    error: matches ? undefined : 'RU_CURRENCY_DRIFT',
    ru_reported_location_id: reportedLocationId,
    location_matches: locationMatches,
  };
}

/**
 * Corrective flip after a post-push read-back reported drift (RU says USD while we authored ZAR).
 *
 * Sends exactly ONE more child-scoped Push_ChangeCurrency_RQ for this OwnerID + Location and
 * re-reads the listing once. Rates are never converted to USD here: if the re-read still
 * disagrees, the verdict stays `failed` (red drift) and publication keeps the authored ISO.
 * A rate-limited attempt (429 / RU_RATE_DEFERRED) is inconclusive, not a refusal.
 */
export async function correctCurrencyDrift(
  supabase: any,
  opts: {
    propertyId: string;
    locationId: number;
    authoredIso: string;
    ruPropertyId: number;
    childAuth?: Record<string, unknown>;
    ownerScope: string;
    expectedLocationId?: number | null;
  },
): Promise<{
  attempted: boolean;
  reflip_outcome: 'flipped' | 'already_set' | 'deferred' | 'failed';
  message?: string;
  ru_reported_iso?: string | null;
  matches?: boolean;
}> {
  const authored = (opts.authoredIso || 'ZAR').toUpperCase();
  if (!opts.locationId || opts.locationId <= 1 || !opts.ruPropertyId) {
    return { attempted: false, reflip_outcome: 'failed', message: 'No location or listing id for a corrective flip' };
  }

  // A stale scoped row must not make the next run skip the write.
  await clearScopedLocationCurrency(supabase, opts.locationId, opts.ownerScope);

  let outcome: 'flipped' | 'already_set' | 'deferred' | 'failed' = 'failed';
  let message = '';
  try {
    const { data, error } = await supabase.functions.invoke('rentalsunited-api', {
      body: { action: 'push_change_currency', location_id: opts.locationId, currency_iso: authored, ...(opts.childAuth ?? {}) },
    });
    if (error || !data?.success) {
      const body = error ? await readInvokeErrorBody(error) : null;
      const code = String((body as any)?.error?.code ?? (data as any)?.error?.code ?? '');
      const text = String(error?.message ?? (data as any)?.error?.message ?? '');
      if (code === 'RU_RATE_DEFERRED' || /RU_RATE_DEFERRED|rate limit/i.test(text)) {
        outcome = 'deferred';
        message = text || 'Channel rate limit — corrective flip deferred';
      } else {
        outcome = 'failed';
        message = text || 'Push_ChangeCurrency was refused';
      }
    } else {
      outcome = data.already_set ? 'already_set' : 'flipped';
      await recordScopedLocationCurrency(
        supabase,
        opts.locationId,
        opts.ownerScope,
        authored,
        data.already_set ? 'ru_readback' : 'flip',
      );
    }
  } catch (e) {
    outcome = 'failed';
    message = e instanceof Error ? e.message : 'Push_ChangeCurrency threw';
  }

  if (outcome === 'deferred' || outcome === 'failed') {
    return { attempted: true, reflip_outcome: outcome, message };
  }

  // Re-read once. The sliding-minute window can hold an identical read; that is inconclusive,
  // so the existing drift verdict simply stands until the next run.
  await new Promise((r) => setTimeout(r, 1200));
  const v = await verifyAndRecordCurrency(supabase, {
    propertyId: opts.propertyId,
    locationId: opts.locationId,
    authoredIso: authored,
    ruPropertyId: opts.ruPropertyId,
    childAuth: opts.childAuth,
    ownerScope: opts.ownerScope,
    decision: null,
    expectedLocationId: opts.expectedLocationId ?? opts.locationId,
  });
  return {
    attempted: true,
    reflip_outcome: outcome,
    message: message || undefined,
    ru_reported_iso: v.ru_reported_iso,
    matches: v.matches,
  };
}


export async function loadCurrencyState(supabase: any, propertyId: string) {
  try {
    const { data } = await supabase
      .from('ru_currency_state')
      .select('*')
      .eq('property_id', propertyId)
      .maybeSingle();
    return data ?? null;
  } catch {
    return null;
  }
}
