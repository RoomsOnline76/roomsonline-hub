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
  flip_outcome: 'not_needed' | 'already_set' | 'flipped' | 'failed' | 'unknown_location';
  reason: string;
  blocked?: boolean;
  block_reason?: string;
};

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
    dryRun?: boolean;
    persist?: boolean;
  },
): Promise<CurrencyDecision> {
  const authored = (opts.authoredIso || 'ZAR').toUpperCase();
  const childAuth = opts.childAuth ?? {};
  const marginPct = FX_MARGIN_PCT;

  let cached = await getLocationCurrencyIso(supabase, opts.locationId);
  // Empty or stale cache is the root cause of currency drift going undetected —
  // seed it on demand before deciding anything.
  if (!cached || !cached.iso || cached.stale) {
    await refreshRuLocationsCache(supabase, childAuth);
    cached = await getLocationCurrencyIso(supabase, opts.locationId);
  }

  const decide = (d: Omit<CurrencyDecision, 'location_id' | 'authored_iso' | 'margin_pct'>): CurrencyDecision => ({
    location_id: opts.locationId,
    authored_iso: authored,
    margin_pct: marginPct,
    ...d,
  });

  const locationIso = cached?.iso ?? null;

  // Location already publishes in the authored currency — nothing to do.
  if (locationIso && locationIso === authored) {
    const d = decide({
      location_iso: locationIso,
      published_iso: authored,
      conversion_in_force: false,
      fx_rate: null,
      effective_rate: null,
      flip_outcome: 'already_set',
      reason: `Rentals United location ${opts.locationId} is set to ${authored}.`,
    });
    await persistDecision(supabase, opts.propertyId, d, opts.persist !== false && !opts.dryRun);
    return d;
  }

  // Location currency unknown even after a cache refresh — attempt the flip anyway;
  // a 339 ("already set") tells us it was correct all along.
  let flip: CurrencyDecision['flip_outcome'] = locationIso ? 'failed' : 'unknown_location';
  let flipMessage = '';
  if (!opts.dryRun) {
    try {
      const { data, error } = await supabase.functions.invoke('rentalsunited-api', {
        body: { action: 'push_change_currency', location_id: opts.locationId, currency_iso: authored, ...childAuth },
      });
      if (error || !data?.success) {
        flip = 'failed';
        flipMessage = error?.message || data?.error?.message || 'Push_ChangeCurrency was refused';
      } else {
        flip = data.already_set ? 'already_set' : 'flipped';
        await supabase.from('ru_locations').upsert({
          id: opts.locationId,
          name: `Location ${opts.locationId}`,
          country: opts.country || cached?.country || 'Unknown',
          currency_iso: authored,
          currency_ru_id: RU_CURRENCY_BY_ISO[authored] ?? null,
          last_synced_at: new Date().toISOString(),
        }, { onConflict: 'id' });
      }
    } catch (e) {
      flip = 'failed';
      flipMessage = e instanceof Error ? e.message : 'Push_ChangeCurrency threw';
    }
  }

  if (flip === 'flipped' || flip === 'already_set') {
    const d = decide({
      location_iso: authored,
      published_iso: authored,
      conversion_in_force: false,
      fx_rate: null,
      effective_rate: null,
      flip_outcome: flip,
      reason:
        flip === 'flipped'
          ? `Rentals United location ${opts.locationId} was switched to ${authored}; rates publish in ${authored}.`
          : `Rentals United location ${opts.locationId} already holds ${authored}.`,
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
  try {
    await supabase.from('ru_currency_state').upsert({
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
      decided_at: new Date().toISOString(),
    }, { onConflict: 'property_id' });
  } catch (e) {
    console.warn('[ruCurrency] Failed to persist currency decision:', e instanceof Error ? e.message : e);
  }
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
