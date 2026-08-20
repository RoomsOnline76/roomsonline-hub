import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  mandatoryGaps,
  localBookableWindowChecks,
  RU_MIN_AMENITIES,
  RU_MIN_IMAGES,
  RU_MIN_IMAGE_HEIGHT,
  RU_MIN_IMAGE_WIDTH,
  RU_BED_COVERAGE,
} from '../_shared/ruReadiness.ts';
import {
  checkRuPropertyName,
  RU_CERT_MIN_DESCRIPTION,
  RU_CERT_MIN_IMAGE_HEIGHT,
  RU_CERT_MIN_IMAGE_WIDTH,
  RU_MIN_ARRIVAL_INSTRUCTIONS,
} from '../_shared/ruContentQuality.ts';
import { evaluatePhases, phaseBlockedResponse, findOwnerAccount } from '../_shared/ruPhaseGate.ts';
import { markLedgerStaleForScope, writeLedgerRows } from '../_shared/channelStepLedger.ts';
import { enqueueJob } from '../_shared/jobQueue.ts';

import { computeLocalBookableWindow } from '../_shared/ruLocalWindow.ts';
import { loadCanonicalRooms, normaliseRoomName } from '../_shared/canonicalRooms.ts';
import {
  RU_CHARGE_COLUMNS,
  resolveRuCleaningFee,
  resolveRuSecurityDeposit,
  type RuChargeRow,
} from '../_shared/ruDeposits.ts';
import { resolveMcqChannelId } from '../_shared/ruMcq.ts';
import { resolveRuAmenityIds } from '../_shared/ruAmenityMap.ts';
import {
  normalizeRuImageTagMap,
  findMainImageUrl,
  resolvePrimaryRuTag,
  resolveSecondaryRuTags,
  RU_TAG_INTERIOR,
  RU_TAG_MAIN,
  RuImageTagMap,
} from '../_shared/ruImageTags.ts';
import {
  createRateResolver,
  compressToPeriods,
  describeCoverage,
  normalizePriceWindow,
  findPeriodOverlaps,
  type DayRate,
  type UnitRateContext,
} from '../_shared/rateResolution.ts';

import { parseRuPriceSeasons } from '../_shared/ruPriceParsing.ts';
import { auditChannelPriceCoverage, persistPriceCoverage, type PriceCoverageResult } from '../_shared/ruPriceCoverage.ts';
import { parseRuAvailabilityDays } from '../_shared/ruAvailabilityParsing.ts';
import { invokeRuWithRetry } from '../_shared/ruInvokeRetry.ts';

/**
 * Field-scoped push metadata for an ARI exchange.
 *
 * Certification asks not only that a refresh happened but what it carried. `changed_fields` names
 * the RU fields inside the payload, `fingerprint` identifies the exact payload so two runs can be
 * told apart (or proven identical) from the exchange log alone.
 */
async function ariPushMeta(
  pushType: string,
  changedFields: string[],
  payload: unknown,
): Promise<{ push_type: string; changed_fields: string[]; fingerprint: string }> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(payload)));
  const fingerprint = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32);
  return { push_type: pushType, changed_fields: changedFields, fingerprint };
}

import { summarizeRuExchanges } from '../_shared/ruApiLog.ts';
import { loadPropertyDistances } from '../_shared/ruDistances.ts';
import {
  decideRuCurrency,
  verifyAndRecordCurrency,
  verifyRuPropertyCurrency,
  convertPriceEntries,
  refreshRuLocationsCache,
  loadCurrencyState,
  getFxRate,
  applyMargin,
  FX_MARGIN_PCT,
  RU_CURRENCY_BY_ISO as RU_CCY_BY_ISO,
  type CurrencyDecision,
} from '../_shared/ruCurrency.ts';
import {
  resolveRuDiscounts,
  validateRuLadder,
  longStayToWire,
  lastMinuteToWire,
  describeTierSources,
  diffRuDiscountEcho,
  type RuDiscountWire,
} from '../_shared/ruDiscounts.ts';



/**
 * Push Property to Rentals United — Multi-Unit Building Support
 * 
 * For properties with room types (multi-unit buildings like Seesig):
 *  1. Create/update an RU Building container
 *  2. Push each room type as an individual RU Property within that building
 *  3. Push ARI (availability, rates, inventory) per unit
 * 
 * For single-unit properties (no room types):
 *  Push as a single RU Property (legacy behaviour)
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface ListingVerification {
  verified: boolean;
  /** The push succeeded but the channel has not answered the read-back yet — not a failure. */
  pending?: boolean;
  verified_units?: number;
  expected_units?: number;
  unmatched?: string[];
  owner?: string | null;
  listing_status?: { scope: string; name: string; ru_property_id: string | null; status: string; owner_label?: string }[];
  error?: string;
}


/**
 * Reading the listings back is part of publishing, not a separate chore: a push whose
 * listings were never pulled back is a claim, not a fact. This runs the same resolver the
 * console offers manually (`resolve_ru_property_ids`) straight after a successful live push,
 * so the wizard lands on "confirmed" or on an explicit reason — never on a silent
 * "pushed but not read back" with nothing to click.
 *
 * Best-effort: a failed read-back leaves the property unverified but never fails the push.
 */
/**
 * `functions.invoke` collapses a non-2xx into "Edge Function returned a non-2xx status code"
 * and discards the JSON body, which hides the channel's real reason (rate limit, missing
 * sub-account keys). Recover it from the FunctionsHttpError context.
 */
// deno-lint-ignore no-explicit-any
async function readInvokeErrorBody(err: any): Promise<any | null> {
  const res = err?.context;
  if (!res || typeof res.text !== 'function') return null;
  try {
    return JSON.parse(await res.text());
  } catch {
    return null;
  }
}

async function verifyListingsAfterPush(
  supabase: ReturnType<typeof createClient>,
  propertyId: string,
  /**
   * The caller's own bearer token. The nested console function used to receive the
   * service-role key, which resolves to no user and answered "Invalid session" every time,
   * so every automatic read-back failed. Forward the caller's session when there is one;
   * background/cron pushes fall back to the service key, which the console now accepts as an
   * internal call for this read-only action.
   */
  callerAuthHeader?: string | null,
): Promise<ListingVerification> {
  // Phase 2 ledger: a successful push invalidates the publish and currency grades.
  // Bookkeeping only — never allowed to affect the push outcome.
  await markLedgerStaleForScope(supabase, { propertyId }, ["publish", "currency"], "push_succeeded");
  try {

    let attempt = 0;
    // deno-lint-ignore no-explicit-any
    let data: any = null;
    // deno-lint-ignore no-explicit-any
    let body: any = null;
    /**
     * The read-back is a system call: invoking with the function's own service-role client
     * (no forwarded user header) keeps it working for crons and background pushes alike.
     * Forwarding the caller's header made the call fail with "Invalid session" whenever the
     * push ran without a user JWT.
     */
    void callerAuthHeader;
    const invokeOptions = {};

    while (attempt < 2) {
      attempt++;
      const res = await supabase.functions.invoke('ru-cert-portal', {
        body: { action: 'resolve_ru_property_ids', property_id: propertyId },
        ...invokeOptions,
      });
      data = res.data;
      body = res.data ?? (await readInvokeErrorBody(res.error));
      if (!res.error && body?.success === true) break;

      const code = typeof body?.error?.code === 'string' ? body.error.code : null;
      const retryMs = Number(body?.retry_after_ms ?? body?.error?.retry_after_ms ?? 0);
      // The push itself just consumed the channel's sliding window — one paced retry turns
      // "not read back" into a real confirmation instead of a manual chore.
      if (attempt < 2 && (code === 'RU_RATE_DEFERRED' || !code)) {
        const waitMs = code === 'RU_RATE_DEFERRED' && retryMs > 0 && retryMs <= 20000 ? retryMs + 500 : 2500;
        console.log(`[push-property-to-ru] read-back not confirmed (${code ?? 'no code'}) — retrying in ${waitMs}ms`);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      const message = body?.error?.message ?? res.error?.message ?? 'The channel did not return its listing set';
      console.warn(`[push-property-to-ru] listing read-back failed for ${propertyId}: ${message}`);
      // The push already succeeded; a read-back that could not answer is pending, not failed.
      const pending = !code || code === 'RU_RATE_DEFERRED';
      return { verified: false, pending, error: message };
    }
    data = body;

    const payload = data as {
      matched?: { scope?: string }[];
      unmatched?: string[];
      ru_owner_label?: string;
      listings_verified?: boolean;
      listing_status?: ListingVerification['listing_status'];
    };
    const { data: row } = await supabase
      .from('properties')
      .select('ru_listings_verified_at, ru_listings_verified_units, ru_listings_expected_units, ru_listings_verified_owner')
      .eq('id', propertyId)
      .maybeSingle();
    const r = row as Record<string, unknown> | null;
    return {
      verified: !!String(r?.ru_listings_verified_at ?? '').trim(),
      verified_units: Number(r?.ru_listings_verified_units ?? 0),
      expected_units: Number(r?.ru_listings_expected_units ?? 0),
      unmatched: Array.isArray(payload.unmatched) ? payload.unmatched : [],
      owner: (r?.ru_listings_verified_owner as string | null) ?? payload.ru_owner_label ?? null,
      listing_status: Array.isArray(payload.listing_status) ? payload.listing_status : undefined,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Listing read-back failed';
    console.warn(`[push-property-to-ru] listing read-back threw for ${propertyId}: ${message}`);
    return { verified: false, pending: true, error: message };
  }
}


// ── RU Type Mapping ──────────────────────────────────────────

const PROPERTY_TYPE_MAP: Record<string, number> = {
  apartment: 1, house: 3, villa: 5, cottage: 12, cabin: 12, chalet: 12,
  bungalow: 16, townhouse: 20, studio: 25, loft: 25, hotel: 7,
  guest_house: 11, guesthouse: 11, bed_and_breakfast: 8, bnb: 8,
  self_catering: 12, lodge: 11, resort: 7, farm_stay: 12, boutique_hotel: 7,
};

/**
 * ObjectTypeIDs come from the curated PROPERTY_TYPE_MAP above.
 *
 * There is no RU pull endpoint for the ObjectType dictionary: `Pull_ListPropTypes_RQ`
 * returns bedroom *layouts* (Studio, One Bedroom, …), a different field whose ids overlap
 * ObjectTypeIDs numerically. Resolving listing kinds from that cache would publish the
 * wrong type, so the static map is authoritative here.
 */

/** Resolve a ROL'OS type slug to an RU ObjectTypeID (listing kind: Apartment, Villa, …). */
function resolveRuTypeId(slug: string): number | undefined {
  return PROPERTY_TYPE_MAP[slug];
}

/**
 * RU `PropertyTypeID` is NOT the listing kind — it is the bedroom LAYOUT
 * (`Pull_ListPropTypes_RQ`: 1=Studio, 2=One Bedroom, 3=Two Bedroom, …). Sending the listing
 * kind here is what made an Apartment publish as a studio-style "All Suite" in RU.
 * Verified against the live `ru_property_types` cache.
 */
const RU_LAYOUT_TYPE_BY_BEDROOMS: Record<number, number> = {
  0: 1, 1: 2, 2: 3, 3: 4, 4: 12, 5: 11, 6: 26, 7: 27, 8: 28, 9: 29, 10: 30,
  11: 34, 12: 35, 13: 36, 14: 37, 15: 38, 16: 39, 17: 40, 18: 41, 19: 42, 20: 43,
  21: 44, 22: 45, 23: 46, 24: 47, 25: 48, 26: 49, 27: 50, 28: 51, 29: 52, 30: 53,
  31: 54, 32: 55,
};

/** Bedroom count → RU PropertyTypeID (layout). Anything above the dictionary clamps to 32. */
function resolveRuLayoutTypeId(bedrooms: unknown): number {
  const count = Math.max(0, Math.floor(Number(bedrooms) || 0));
  return RU_LAYOUT_TYPE_BY_BEDROOMS[Math.min(count, 32)] ?? 1;
}



/**
 * RU bed-type amenity IDs (verified against the live RU amenity dictionary in `ru_amenities`).
 *
 * These MUST come from RU's "Bedroom & Beds" group. The previous values (97-101) were guesses
 * and actually resolve to Living-Area items — RU rendered our bedrooms as "2 x Corridor" and
 * counted zero beds ("Add sufficient amount of beds").
 *   61  = double bed          323 = single bed        324 = king size bed
 *   485 = Queen size bed      440 = Pair of twin beds 444 = Bunk Bed
 *   237 = sofabed             200 = double sofa bed   624 = Pull-Out Bed
 *   501 = day bed             515 = Wallbed           833 = Baby cot
 *   209 = Extra Bed
 */
const RU_BED = {
  single: 323,
  twin: 323,
  twinPair: 440,
  double: 61,
  queen: 485,
  king: 324,
  bunk: 444,
  sofaBed: 237,
  doubleSofaBed: 200,
  pullOut: 624,
  dayBed: 501,
  wallBed: 515,
  cot: 833,
  extra: 209,
} as const;

/** Every ID that RU counts as a real sleeping place. */
const RU_BED_AMENITY_IDS: number[] = Object.values(RU_BED);
const RU_DEFAULT_BED_ID = RU_BED.double;

/**
 * How many people each RU bed type sleeps. Coverage is measured in SLEEPING PLACES,
 * not bed count: 2 doubles + 2 singles = 6 people, not 4 beds.
 */
const RU_BED_SLEEPS: Record<number, number> = {
  [RU_BED.single]: 1,
  [RU_BED.twinPair]: 2,
  [RU_BED.double]: 2,
  [RU_BED.queen]: 2,
  [RU_BED.king]: 2,
  [RU_BED.bunk]: 2,
  [RU_BED.sofaBed]: 1,
  [RU_BED.doubleSofaBed]: 2,
  [RU_BED.pullOut]: 1,
  [RU_BED.dayBed]: 1,
  [RU_BED.wallBed]: 1,
  [RU_BED.cot]: 0,
  [RU_BED.extra]: 1,
};
const sleepsForBedId = (id: number): number => RU_BED_SLEEPS[id] ?? 1;

const BED_AMENITY_MAP: Record<string, number> = {
  single: RU_BED.single,
  twin: RU_BED.twin,
  double: RU_BED.double,
  queen: RU_BED.queen,
  king: RU_BED.king,
  'king-twin': RU_BED.king,
  'sofa-bed': RU_BED.sofaBed,
  sofa: RU_BED.sofaBed,
  'double-sofa-bed': RU_BED.doubleSofaBed,
  'sleeper-couch': RU_BED.doubleSofaBed,
  bunk: RU_BED.bunk,
};

/**
 * Normalise a free-text ROLOS bed label to an RU bed amenity ID.
 *
 * RU rejects a unit with "Add sufficient amount of beds" when the bed amenities
 * inside the <CompositionRoomAmenities RoomID="257"> blocks cover less than half of
 * CanSleepMax. ROLOS labels are authored by owners ("Queen Bed", "2 x Twin beds",
 * "3/4 bed", "sleeper couch"), so a strict slug lookup silently lost most of them.
 */
export function resolveBedAmenityId(rawLabel: unknown): { id: number | null; normalized: string } {
  const label = String(rawLabel ?? '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\b\d+\s*[x×]\s*/g, ' ')      // "2 x queen" → "queen"
    .replace(/\bbeds?\b/g, ' ')
    .replace(/[^a-z0-9/¾ -]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const has = (...needles: string[]) => needles.some((n) => label.includes(n));

  // Order matters: the most specific label wins.
  if (has('bunk', 'loft bunk', 'triple bunk')) return { id: RU_BED.bunk, normalized: label };
  if (has('pull out', 'pull-out', 'trundle')) return { id: RU_BED.pullOut, normalized: label };
  if (has('murphy', 'wall bed', 'wallbed', 'fold away', 'foldaway')) return { id: RU_BED.wallBed, normalized: label };
  if (has('day bed', 'daybed')) return { id: RU_BED.dayBed, normalized: label };
  if (has('double sofa', 'sleeper couch', 'sleeper-couch')) return { id: RU_BED.doubleSofaBed, normalized: label };
  if (has('sofa', 'couch', 'futon', 'day')) return { id: RU_BED.sofaBed, normalized: label };
  if (has('cot', 'crib', 'baby')) return { id: RU_BED.cot, normalized: label };
  if (has('extra', 'rollaway', 'roll away', 'stretcher', 'camp')) return { id: RU_BED.extra, normalized: label };
  if (has('twin pair', 'pair of twin', '2 singles', 'two singles')) return { id: RU_BED.twinPair, normalized: label };
  if (has('king single', 'king-single', 'super single')) return { id: RU_BED.single, normalized: label };
  if (has('king', 'super king', 'emperor')) return { id: RU_BED.king, normalized: label };
  if (has('queen')) return { id: RU_BED.queen, normalized: label };
  if (has('double', 'full', 'french')) return { id: RU_BED.double, normalized: label };
  if (has('single', 'twin', '3/4', '¾', 'three quarter', 'three-quarter'))
    return { id: RU_BED.single, normalized: label };

  const slug = label.replace(/\s+/g, '-');
  const direct = BED_AMENITY_MAP[slug] ?? BED_AMENITY_MAP[label];
  return { id: direct ?? null, normalized: label };
}

/**
 * Normalise a stored bed_configuration into array entries.
 *
 * Legacy rows keep a single string label ("king-twin", "queen"). Those units used to emit
 * ZERO bedroom composition blocks, so RU content quality failed on "at least one bedroom"
 * while ROL'OS read green. Convert the string into the equivalent entries instead of
 * dropping it; unmapped labels are still reported and still block the push.
 */
export function normalizeBedConfiguration(
  bedConfiguration: unknown,
): { type: string; count: number; room?: { index: number; kind: string } }[] {
  if (Array.isArray(bedConfiguration)) {
    return (bedConfiguration as Record<string, unknown>[])
      .filter((entry) => entry && typeof entry === 'object')
      .map((entry) => {
        const slot = entry?.room as Record<string, unknown> | undefined;
        return {
          type: String(entry?.type ?? ''),
          count: Math.max(1, Number(entry?.count) || 1),
          room: slot
            ? {
                index: Math.max(1, Number(slot?.index) || 1),
                kind: slot?.kind === 'living' ? 'living' : 'bedroom',
              }
            : undefined,
        };
      });
  }
  if (typeof bedConfiguration === 'string' && bedConfiguration.trim()) {
    return bedConfiguration
      .split(/[,+]/)
      .map((part) => part.trim())
      .filter((part) => part.length > 0)
      .map((part) => ({ type: part, count: 1 }));
  }
  return [];
}

/** RU composition room ids used for sleeping spaces. */
const RU_ROOM_BEDROOM = 257;
const RU_ROOM_LIVING_BEDROOM = 372;

/**
 * Group beds into their authored sleeping spaces.
 *
 * Beds carry `room: { index, kind }`. Legacy entries with no slot fold into bedroom 1 in
 * authored order — one bedroom per entry — which preserves the previous behaviour for rows
 * that were never grouped. Living-area sleepers go to 372 so they never claim a bedroom.
 */
export function bedGroupsFromConfiguration(bedConfiguration: unknown): {
  groups: { kind: string; index: number; beds: { type: string; count: number }[] }[];
  totalBeds: number;
} {
  const normalized = normalizeBedConfiguration(bedConfiguration);
  const groups: { kind: string; index: number; beds: { type: string; count: number }[] }[] = [];
  let totalBeds = 0;
  normalized.forEach((entry, i) => {
    const kind = entry.room?.kind ?? 'bedroom';
    const index = entry.room?.index ?? i + 1;
    let group = groups.find((g) => g.kind === kind && g.index === index);
    if (!group) {
      group = { kind, index, beds: [] };
      groups.push(group);
    }
    group.beds.push({ type: entry.type, count: entry.count });
    totalBeds += entry.count;
  });
  return { groups, totalBeds };
}

/** Aggregate a bed_configuration into RU composition blocks + total bed count. */
function bedBlocksFromConfiguration(
  bedConfiguration: unknown,
): { rooms: { room_id: number; amenities: { id: number; count: number }[] }[]; totalBeds: number; unmapped: string[] } {
  const rooms: { room_id: number; amenities: { id: number; count: number }[] }[] = [];
  const unmapped: string[] = [];
  const { groups, totalBeds } = bedGroupsFromConfiguration(bedConfiguration);
  for (const group of groups) {
    const amenities: { id: number; count: number }[] = [];
    for (const bed of group.beds) {
      const { id } = resolveBedAmenityId(bed.type);
      if (id == null && bed.type) unmapped.push(String(bed.type));
      amenities.push({ id: id ?? RU_DEFAULT_BED_ID, count: bed.count });
    }
    if (amenities.length === 0) continue;
    rooms.push({
      room_id: group.kind === 'living' ? RU_ROOM_LIVING_BEDROOM : RU_ROOM_BEDROOM,
      amenities,
    });
  }
  return { rooms, totalBeds, unmapped };
}



const PAYMENT_METHOD_MAP: Record<string, number> = {
  cash: 1, visa: 2, mastercard: 3, amex: 4, bank_transfer: 5, paypal: 6,
  credit_card: 2, debit_card: 2, eft: 5,
};

// ── Types ────────────────────────────────────────────────────

interface PropertyRow {
  id: string;
  name: string;
  description: string | null;
  property_type: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  postal_code: string | null;
  latitude: number | null;
  longitude: number | null;
  max_guests: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  toilets: number | null;
  separate_kitchen: boolean | null;
  amenities: Record<string, unknown> | null;
  images: unknown[] | null;
  rentalsunited_property_id: string | null;
  rentalsunited_building_id: string | null;
}

interface RoomTypeRow {
  id: string;
  name: string;
  description: string | null;
  max_guests: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  beds: number | null;
  bed_configuration: { type: string; count: number }[] | null;
  linked_rolos_id: string | null;
  amenities: Record<string, unknown> | null;
  images: unknown[] | null;
  check_in_time: string | null;
  check_out_time: string | null;
  cleaning_fee: number | null;
  security_deposit: number | null;
  address_street: string | null;
  address_postal_code: string | null;
  latitude: number | null;
  longitude: number | null;
  property_type: string | null;
  cancellation_policy: string | null;
  room_size: number | null;
  check_in_instructions: string | null;
  rentalsunited_property_id: string | null;
}

function toFiniteNumber(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

// ── Mapping Functions ────────────────────────────────────────

function mapAmenities(amenitiesData: Record<string, unknown> | null): { id: number; count: number; padded?: boolean }[] {
  if (!amenitiesData) return [];
  // Canonical resolution: `ru:<id>` / `ru:<id>:<count>` tokens picked in ROLOS, plus
  // legacy free-text labels resolved through the shared RU dictionary map. No padding —
  // a unit that falls short of RU's 10-amenity minimum must be fixed by the owner, and
  // the readiness scorecard reports it.
  const { ids, counts } = resolveRuAmenityIds(amenitiesData);
  return ids.map((id) => ({ id, count: Math.max(1, counts[id] || 1) }));
}



interface RuImage {
  url: string;
  type_id: number;
  is_main: boolean;
  width?: number | null;
  height?: number | null;
  /** Extra RU tags for the same photo, emitted as repeated <Image> nodes. */
  extra_type_ids?: number[];
  /** Set once the URL has been fetched and accepted by the RU image probe. */
  verified?: boolean;
}

function toDimension(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}


/**
 * Resolve a usable postal / ZIP code: unit → property field → trailing code in
 * the address line (e.g. "Groot Jongensfontein 6675"). '0000' means unresolved.
 */
function resolveZipCode(unitZip: string | null | undefined, property: { postal_code?: string | null; address?: string | null }): string {
  const direct = (unitZip || property.postal_code || '').trim();
  if (direct) return direct;
  const m = String(property.address || '').match(/\b(\d{4,6})\b(?!.*\b\d{4,6}\b)/);
  return m ? m[1] : '0000';
}

function mapImages(images: unknown[] | null, tagMap?: unknown): RuImage[] {
  if (!Array.isArray(images) || images.length === 0) return [];
  const tags: RuImageTagMap = normalizeRuImageTagMap(tagMap);
  const urls = images
    .map((img) => (typeof img === 'string' ? img : ((img as Record<string, unknown>)?.url as string) || ''))
    .filter(Boolean);
  // The owner's explicit main-photo flag (tag 1) wins; fall back to the first
  // gallery photo only when no photo carries the flag.
  const mainUrl = findMainImageUrl(tags, urls) ?? urls[0] ?? '';
  return images.map((img) => {
    const rec = (typeof img === 'string' ? null : img) as Record<string, unknown> | null;
    const url = typeof img === 'string' ? img : (rec?.url as string) || '';
    // Authored tags win; untagged photos keep RU's Interior (3) default instead of
    // being silently overwritten.
    const authored = tags[url] || [];
    const isMain = !!url && url === mainUrl;
    const primary = resolvePrimaryRuTag(authored, isMain);
    return {
      url,
      type_id: primary,
      extra_type_ids: resolveSecondaryRuTags(authored, primary),
      is_main: isMain,
      width: toDimension(rec?.width),
      height: toDimension(rec?.height),
    };
  }).filter(img => img.url);
}

/**
 * Re-stamp the main flag after ordering/dedup without discarding authored tags:
 * the photo the owner flagged Main keeps Main (1) — index 0 is used only when no
 * photo carries the flag. Every other photo keeps its resolved tag.
 */
function restampRuImages(images: RuImage[]): RuImage[] {
  const flagged = images.findIndex((img) => img.is_main);
  const mainIndex = flagged >= 0 ? flagged : 0;
  return images.map((img, index) => {
    const authored = index === mainIndex
      ? []
      : [img.type_id, ...(img.extra_type_ids || [])].filter((id) => id && id !== RU_TAG_MAIN);
    const primary = index === mainIndex ? RU_TAG_MAIN : (authored[0] ?? RU_TAG_INTERIOR);
    return {
      ...img,
      is_main: index === mainIndex,
      type_id: primary,
      extra_type_ids: resolveSecondaryRuTags(authored, primary),
    };
  });
}

/**
 * Probe an image URL the way Rentals United does: RU fetches every URL during
 * validation and flags the photo ("Image N may be invalid") when it is unreachable,
 * not an image, or below its minimum pixel size. Signed / expiring URLs and private
 * bucket paths fail on RU's side even though they render inside ROLOS.
 */
interface RuImageProbe {
  url: string;
  ok: boolean;
  reason?: string;
  width?: number | null;
  height?: number | null;
}

function readPixelDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // PNG
  if (bytes.length > 24 && bytes[0] === 0x89 && bytes[1] === 0x50) {
    return { width: dv.getUint32(16), height: dv.getUint32(20) };
  }
  // GIF
  if (bytes.length > 10 && bytes[0] === 0x47 && bytes[1] === 0x49) {
    return { width: dv.getUint16(6, true), height: dv.getUint16(8, true) };
  }
  // WebP (VP8X extended, VP8 lossy, VP8L lossless)
  if (bytes.length > 30 && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') {
    const chunk = String.fromCharCode(...bytes.slice(12, 16));
    if (chunk === 'VP8X') return { width: 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)), height: 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16)) };
    if (chunk === 'VP8 ' && bytes.length > 30) {
      return { width: (bytes[26] | (bytes[27] << 8)) & 0x3fff, height: (bytes[28] | (bytes[29] << 8)) & 0x3fff };
    }
    if (chunk === 'VP8L' && bytes.length > 25) {
      const bits = (bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24)) >>> 0;
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
  }
  // AVIF / HEIC (ISOBMFF): the image size lives in the `ispe` box inside `meta`.
  if (bytes.length > 16 && String.fromCharCode(...bytes.slice(4, 8)) === 'ftyp') {
    const ispe = readIsobmffIspe(bytes, dv);
    if (ispe) return ispe;
  }
  // JPEG: walk the segment markers for SOF0/SOF2
  if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) { offset += 1; continue; }
      const marker = bytes[offset + 1];
      // Standalone markers carry no length payload.
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) { offset += 2; continue; }
      const length = dv.getUint16(offset + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: dv.getUint16(offset + 5), width: dv.getUint16(offset + 7) };
      }
      if (length < 2) break;
      offset += 2 + length;
    }
  }
  return null;
}

/**
 * Scans an ISOBMFF byte range (AVIF/HEIC/HEIF) for the largest `ispe` box, which
 * declares the image's pixel dimensions. Without this every AVIF upload is reported
 * as "size could not be measured", which used to hard-block channel onboarding.
 */
function readIsobmffIspe(bytes: Uint8Array, dv: DataView): { width: number; height: number } | null {
  let best: { width: number; height: number } | null = null;
  const limit = bytes.length - 12;
  for (let i = 4; i < limit; i += 1) {
    if (bytes[i] !== 0x69 || bytes[i + 1] !== 0x73 || bytes[i + 2] !== 0x70 || bytes[i + 3] !== 0x65) continue;
    // ispe payload: 4 bytes version/flags, then width and height as big-endian u32.
    const width = dv.getUint32(i + 8);
    const height = dv.getUint32(i + 12);
    if (width > 0 && height > 0 && width < 100000 && height < 100000) {
      if (!best || width * height > best.width * best.height) best = { width, height };
    }
  }
  return best;
}


async function probeRuImage(url: string): Promise<RuImageProbe> {
  if (!/^https:\/\//i.test(url)) {
    return { url, ok: false, reason: 'URL is not https — Rentals United only fetches secure URLs' };
  }
  if (/[?&](token|X-Amz-|Signature|Expires)/i.test(url)) {
    return { url, ok: false, reason: 'URL carries an expiring access token — Rentals United needs a permanently public URL' };
  }
  try {
    const res = await fetch(url, { headers: { Range: 'bytes=0-65535' } });
    if (!res.ok && res.status !== 206) {
      return { url, ok: false, reason: `URL returned HTTP ${res.status} — Rentals United cannot download it` };
    }
    const contentType = res.headers.get('content-type') || '';
    const buf = new Uint8Array(await res.arrayBuffer());
    if (contentType && !/^image\//i.test(contentType)) {
      return { url, ok: false, reason: `URL is not an image (content-type ${contentType})` };
    }
    let dims = readPixelDimensions(buf);
    if (!dims) {
      // The first 64KB did not carry the size header (large EXIF blocks, AVIF with a
      // late `meta` box). Retry with a bigger window before calling it unmeasurable.
      try {
        const wide = await fetch(url, { headers: { Range: 'bytes=0-1048575' } });
        if (wide.ok || wide.status === 206) dims = readPixelDimensions(new Uint8Array(await wide.arrayBuffer()));
      } catch { /* keep the unmeasured result */ }
    }
    if (!dims) {
      // Reachable and served as an image, but the header block we read did not carry
      // dimensions. Accept it and report that the size could not be measured.
      return { url, ok: true, width: null, height: null, reason: 'reachable — pixel size could not be measured' };
    }

    if (dims.width < RU_MIN_IMAGE_WIDTH || dims.height < RU_MIN_IMAGE_HEIGHT) {
      return { url, ok: false, width: dims.width, height: dims.height, reason: `${dims.width}x${dims.height}px is below Rentals United's ${RU_MIN_IMAGE_WIDTH}x${RU_MIN_IMAGE_HEIGHT}px minimum` };
    }
    return { url, ok: true, width: dims.width, height: dims.height };
  } catch (e) {
    return { url, ok: false, reason: `URL could not be fetched (${e instanceof Error ? e.message : String(e)})` };
  }
}

const imageProbeCache = new Map<string, RuImageProbe>();

/**
 * Verify every image on a built payload, drop the ones Rentals United would reject,
 * and stamp measured dimensions so the readiness scorecard reports real pixel sizes.
 * Returns the rejected images with a plain-language reason each.
 */
async function applyImageVerification(
  payload: Record<string, any>,
): Promise<{ url: string; reason: string }[]> {
  const images: RuImage[] = Array.isArray(payload.images) ? payload.images : [];
  if (images.length === 0) return [];

  const probes: RuImageProbe[] = [];
  const CONCURRENCY = 6;
  for (let i = 0; i < images.length; i += CONCURRENCY) {
    const slice = images.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      slice.map(async (img) => {
        const cached = imageProbeCache.get(img.url);
        if (cached) return cached;
        const probe = await probeRuImage(img.url);
        imageProbeCache.set(img.url, probe);
        return probe;
      }),
    );
    probes.push(...results);
  }

  const rejected: { url: string; reason: string }[] = [];
  const accepted: RuImage[] = [];
  images.forEach((img, i) => {
    const probe = probes[i];
    if (!probe?.ok) {
      rejected.push({ url: img.url, reason: probe?.reason || 'image could not be verified' });
      return;
    }
    accepted.push({
      ...img,
      width: probe.width ?? img.width ?? null,
      height: probe.height ?? img.height ?? null,
      verified: true,
    } as RuImage);
  });

  payload.images = restampRuImages(accepted);
  payload.image_issues = rejected;
  return rejected;
}

/**
 * RU White-Label minimum inventory validation for a built payload.
 * Shared by every dry-run branch and by the live-push readiness gate so the
 * admin console, the ROLOS scorecard and the API all score identically.
 */
function buildValidation(payload: Record<string, any>): Record<string, unknown> {
  const images: RuImage[] = (payload.images || []) as RuImage[];
  const rooms: { room_id: number; amenities: { id: number; count: number }[] }[] = payload.rooms || [];
  const amenities: unknown[] = payload.amenities || [];
  const maxGuests = payload.can_sleep_max || 0;

  // Photos: count + pixel size. Certification requires every photo to MEASURE at
  // least 1024x768 — an image whose dimensions could not be read is reported as
  // unverified (advisory) and never counted as meeting the certification size.
  let sized = 0;
  let unverified = 0;
  let certSized = 0;
  let smallestWidth: number | null = null;
  let smallestHeight: number | null = null;
  for (const img of images) {
    if (img.width == null || img.height == null) {
      unverified += 1;
      // Only a probed-and-reachable image may pass the legacy (upload-rule) size check.
      if (img.verified) sized += 1;
      continue;
    }
    smallestWidth = smallestWidth == null ? img.width : Math.min(smallestWidth, img.width);
    smallestHeight = smallestHeight == null ? img.height : Math.min(smallestHeight, img.height);
    if (img.width >= RU_MIN_IMAGE_WIDTH && img.height >= RU_MIN_IMAGE_HEIGHT) sized += 1;
    if (img.width >= RU_CERT_MIN_IMAGE_WIDTH && img.height >= RU_CERT_MIN_IMAGE_HEIGHT) certSized += 1;
  }
  const imageIssues: { url: string; reason: string }[] = (payload.image_issues || []) as { url: string; reason: string }[];

  // Beds: RU measures coverage in SLEEPING PLACES against CanSleepMax, so a double
  // bed counts as 2 people. 2 doubles + 2 singles = 6 sleeping places (4 beds).
  const bedEntries = rooms.flatMap((r) =>
    (r.amenities || []).filter((a: any) => RU_BED_AMENITY_IDS.includes(Number(a.id))));
  const totalBeds = bedEntries.reduce((s: number, a: any) => s + (a.count || 1), 0);
  const totalBedCapacity = bedEntries.reduce(
    (s: number, a: any) => s + sleepsForBedId(Number(a.id)) * (a.count || 1), 0);

  const roomsWithAmenities = rooms.filter(r => (r.room_id || 0) > 0 && (r.amenities || []).length > 0).length;

  // Composition strictness: RU requires at least one bedroom block, a kitchen and a
  // bathroom, and beds must be DISTRIBUTED across the bedrooms of a multi-bedroom unit
  // (a single room holding every bed is rejected during content review).
  const RU_BEDROOM_ROOM_IDS = [257, 372, 517];
  const RU_KITCHEN_ROOM_IDS = [94, 101, 517];
  // Any kitchen flavour in the dictionary counts as "a kitchen is declared": Kitchen (101,
  // published as "Separate kitchen"), kitchen in the living room (94), modern kitchen (102),
  // fully equipped kitchen (135), kitchenette (157), kitchen corner (517), full kitchen (1262).
  const RU_KITCHEN_AMENITY_IDS = [94, 101, 102, 135, 157, 517, 1262];
  const bedroomBlocks = rooms.filter((r) => RU_BEDROOM_ROOM_IDS.includes(Number(r.room_id)));
  const bedroomsWithBeds = bedroomBlocks.filter((r) =>
    (r.amenities || []).some((a: any) => RU_BED_AMENITY_IDS.includes(Number(a.id)) && (a.count || 1) > 0)).length;
  const hasKitchenRoom = rooms.some((r) => RU_KITCHEN_ROOM_IDS.includes(Number(r.room_id)))
    || (amenities || []).some((a: any) => RU_KITCHEN_AMENITY_IDS.includes(Number(a?.id)));
  const hasBathroomRoom = rooms.some((r) => Number(r.room_id) === 81)
    || (amenities || []).some((a: any) => Number(a?.id) === 81 && (a.count || 0) > 0);
  // Distribution: every bedroom block must hold a bed, and the blocks must cover the
  // bedrooms the unit declares — a 3-bedroom unit sending one bedroom block is rejected.
  const declaredBedrooms = Math.max(0, Number(payload.declared_bedrooms) || 0);
  const bedsDistributed = bedroomBlocks.length >= 1
    && bedroomsWithBeds === bedroomBlocks.length
    && bedroomBlocks.length >= Math.max(1, declaredBedrooms);


  const nameCheck = checkRuPropertyName(payload.name);
  const descriptionText = (payload.descriptions?.[0]?.text || '').trim();
  const arrivalText = String(payload.arrival_how_to_arrive || '').trim();
  const timeRe = /^\d{1,2}:\d{2}$/;
  const checkInFrom = String(payload.check_in_from || '').trim();
  const checkOutUntil = String(payload.check_out_until || '').trim();

  return {
    images_count: images.length,
    images_rejected_count: imageIssues.length,
    image_issues: imageIssues,
    unmapped_bed_labels: payload.unmapped_bed_labels ?? [],
    images_meeting_size: sized,
    images_size_unverified: unverified,
    images_inherited_count: Number(payload.images_inherited_count || 0),
    images_meet_size: images.length > 0 && sized === images.length,
    meets_minimum_images: images.length >= RU_MIN_IMAGES,
    amenities_count: amenities.length,
    amenities_mapped_count: amenities.filter((a: any) => a?.padded !== true).length,
    amenities_padded_count: amenities.filter((a: any) => a?.padded === true).length,
    amenities_padded: amenities.some((a: any) => a?.padded === true),
    meets_minimum_amenities: amenities.length >= RU_MIN_AMENITIES,
    rooms_count: rooms.length,
    rooms_with_amenities: roomsWithAmenities,
    rooms_have_amenities: rooms.length > 0 && roomsWithAmenities === rooms.length,
    // RU minimum: every room/unit must carry at least 10 amenities.
    rooms_below_min_amenities: rooms.filter((r) => (r.amenities || []).length < RU_MIN_AMENITIES).length,
    rooms_meet_min_amenities:
      rooms.length > 0 && rooms.every((r) => (r.amenities || []).length >= RU_MIN_AMENITIES),

    total_beds: totalBeds,
    // Sleeping places implied by the bed configuration (a double sleeps 2).
    total_bed_capacity: totalBedCapacity,
    // Certification requires authored sleeping places to cover CanSleepMax.
    beds_cover_half: totalBedCapacity >= Math.ceil(Math.max(1, maxGuests) * RU_BED_COVERAGE),
    // Advisory only: sleeping places cover every guest.
    beds_meet_max_guests: totalBedCapacity === Math.max(1, maxGuests),
    max_guests: maxGuests,
    // Composition: RU treats bathrooms and toilets as mandatory counts (blank/zero rejected).
    has_bathrooms: (amenities || []).some((a: any) => a?.id === 81 && (a.count || 0) > 0),
    has_toilets: (amenities || []).some((a: any) => a?.id === 37 && (a.count || 0) > 0),
    bathrooms_count: Number((amenities || []).find((a: any) => a?.id === 81)?.count || 0),
    toilets_count: Number((amenities || []).find((a: any) => a?.id === 37)?.count || 0),

    has_coordinates: payload.latitude !== 0 && payload.longitude !== 0,
    has_zip_code: !!(payload.zip_code && payload.zip_code !== '0000'),
    has_space: (payload.space || 0) > 0,
    space_is_default: payload.space_is_default === true,
    has_floor: typeof payload.floor === 'number',
    floor_is_default: payload.floor_is_default === true,
    has_detailed_location_id: (payload.detailed_location_id || 0) > 1,
    // Authored in ROL'OS (Identity & Location → Channel Manager location) vs guessed from
    // coordinates. A guessed location still pushes, but the owner must confirm it.
    ru_location_authored: payload.location_authored !== false,
    has_payment_methods: (payload.payment_methods || []).length >= 1,
    payment_methods_is_default: payload.payment_methods_is_default === true,
    has_cancellation_policies: (payload.cancellation_policies || []).length >= 1,
    cancellation_policies_is_default: payload.cancellation_policies_is_default === true,
    has_name: !!(payload.name && String(payload.name).trim().length >= 3),
    // Certification name hygiene: no emoji, no rejected specials, not ALL CAPS.
    name_clean: nameCheck.clean,
    name_issues: nameCheck.reasons,
    name_issue_detail: nameCheck.detail,
    has_object_type_id: ((payload.object_type_id ?? payload.listing_type_id) || 0) > 0,
    // Guessed values that used to publish silently. Each is now a blocker in the scorer.
    object_type_is_default: payload.object_type_is_default === true,
    object_type_source: payload.object_type_source ?? null,
    currency_is_default: payload.currency_is_default === true,
    currency_iso: payload.currency_iso ?? null,
    beds_unmapped: payload.unmapped_bed_labels ?? [],
    beds_are_default: payload.beds_are_default === true,
    changeover_is_default: payload.changeover_is_default === true,

    can_sleep_max_ok: maxGuests >= 1,
    // Presence is mandatory, 100+ chars advisory, 700+ chars required for certification.
    description_length: descriptionText.length,
    has_description: descriptionText.length > 0,
    description_meets_recommended: descriptionText.length >= 100,
    description_meets_cert: descriptionText.length >= RU_CERT_MIN_DESCRIPTION,
    // Nice-to-have: how many nearby attractions carry a distance we can push.
    attraction_distance_count: Array.isArray(payload.distances) ? payload.distances.length : 0,
    // Composition strictness (certification).
    bedroom_blocks: bedroomBlocks.length,
    bedrooms_with_beds: bedroomsWithBeds,
    has_bedroom: bedroomBlocks.length >= 1,
    has_kitchen: hasKitchenRoom,
    has_bathroom_room: hasBathroomRoom,
    beds_distributed: bedsDistributed,
    // Arrival & stay times.
    arrival_instructions_length: arrivalText.length,
    has_arrival_instructions: arrivalText.length >= RU_MIN_ARRIVAL_INSTRUCTIONS,
    has_check_in_from: timeRe.test(checkInFrom),
    has_check_out_until: timeRe.test(checkOutUntil),
    check_in_from: checkInFrom || null,
    check_out_until: checkOutUntil || null,
    check_in_times_are_default: payload.check_in_times_are_default === true,
    // Photos (certification dimensions).
    images_meeting_cert_size: certSized,
    images_measured_count: Math.max(0, images.length - unverified),
    // Certification size is judged on the photos we could MEASURE. An unreadable URL
    // (CORS / hotlink protection) must not hard-block onboarding — it is reported by the
    // advisory "dimensions measured" check instead. Only a set where nothing at all could
    // be measured stays blocking, because then the rule genuinely cannot be verified.
    images_meet_cert_size:
      images.length > 0 && images.length - unverified > 0 && certSized === images.length - unverified,
    smallest_image_width: smallestWidth,
    smallest_image_height: smallestHeight,
    has_main_image: images.some((i) => i.is_main),
    has_street: !!(payload.street && String(payload.street).trim().length > 2),
  };
}


function mapPaymentMethods(amenities: Record<string, unknown> | null): { methods: number[]; isDefault: boolean } {
  const methods: number[] = [];
  const seen = new Set<number>();
  const paymentData = amenities?.payment_methods || amenities?.payments;
  if (Array.isArray(paymentData)) {
    for (const pm of paymentData) {
      const key = typeof pm === 'string' ? pm.toLowerCase().replace(/[\s-]+/g, '_') : '';
      const ruId = PAYMENT_METHOD_MAP[key];
      if (ruId && !seen.has(ruId)) { seen.add(ruId); methods.push(ruId); }
    }
  }
  // Nothing authored in the ROLOS UI: keep the payload valid (RU requires >= 1 method)
  // but flag it so the readiness scorecard reports an unconfirmed default, not a pass.
  if (methods.length === 0) return { methods: [1, 2], isDefault: true };
  return { methods, isDefault: false };
}

function mapCancellationPolicies(amenities: Record<string, unknown> | null): { rules: { valid_from: number; valid_to: number; percentage: number }[]; isDefault: boolean } {
  const policies = amenities?.cancellation_policies;
  if (!Array.isArray(policies) || policies.length === 0) {
    return {
      rules: [{ valid_from: 0, valid_to: 14, percentage: 100 }, { valid_from: 15, valid_to: 30, percentage: 50 }],
      isDefault: true,
    };
  }
  const sorted = [...policies]
    .filter((p: any) => p.days != null && p.forfeit != null)
    .map((p: any) => ({ days: Number(p.days), forfeit: Number(p.forfeit) }))
    .filter((p) => Number.isFinite(p.days) && Number.isFinite(p.forfeit) && p.days >= 0)
    .sort((a, b) => a.days - b.days);
  if (sorted.length === 0) return { rules: [{ valid_from: 0, valid_to: 30, percentage: 100 }], isDefault: true };
  const rules: { valid_from: number; valid_to: number; percentage: number }[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const policy = sorted[i] as any;
    const fromDays = i === 0 ? 0 : (sorted[i - 1] as any).days + 1;
    const toDays = policy.days;
    if (fromDays <= toDays) rules.push({ valid_from: fromDays, valid_to: toDays, percentage: policy.forfeit });
  }
  if (rules.length === 0) return { rules: [{ valid_from: 0, valid_to: 30, percentage: 100 }], isDefault: true };
  return { rules, isDefault: false };
}


// ── Currency mapping (RU CurrencyID dictionary) ──────────────
// Sourced from Pull_ListCurrencies_RQ. ZAR/NAD/BWP added explicitly because they're our
// primary southern-African markets and were silently falling back to the master default.
const RU_CURRENCY_BY_ISO: Record<string, number> = {
  ZAR: 48, USD: 144, EUR: 47, GBP: 49,
  NAD: 91, BWP: 24, AUD: 6, CAD: 32,
  CHF: 39, JPY: 76, NZD: 94, AED: 1,
  MZN: 88, ZMW: 175,
};

function mapCurrencyToRUId(amenities: Record<string, unknown> | null, country?: string | null): number {
  const banking = ((amenities as any)?.banking || {}) as Record<string, unknown>;
  const isoRaw =
    (banking.currency as string) ||
    ((amenities as any)?.currency as string) ||
    '';
  const iso = String(isoRaw || '').trim().toUpperCase();
  if (iso && RU_CURRENCY_BY_ISO[iso]) return RU_CURRENCY_BY_ISO[iso];
  // Country-based defaults for southern Africa where channel partners enforce currency.
  const c = String(country || '').trim().toUpperCase();
  if (c === 'SOUTH AFRICA' || c === 'ZA' || c === 'RSA') return 48;
  if (c === 'NAMIBIA' || c === 'NA') return 91;
  if (c === 'BOTSWANA' || c === 'BW') return 24;
  // Final fallback — ZAR (matches our primary market). Validation in adapter still rejects 0/null.
  return 48;
}

/**
 * Was the currency actually authored on the property, or is `mapCurrencyToRUId` about to
 * guess it from the country (or fall through to ZAR)? A guessed currency prices the whole
 * listing, so the readiness scorer blocks the push on it instead of publishing an assumption.
 */
function resolveAuthoredCurrency(amenities: Record<string, unknown> | null): { iso: string | null; authored: boolean } {
  const banking = ((amenities as any)?.banking || {}) as Record<string, unknown>;
  const iso = String(
    (banking.currency as string) || ((amenities as any)?.currency as string) || '',
  ).trim().toUpperCase();
  if (iso && RU_CURRENCY_BY_ISO[iso]) return { iso, authored: true };
  return { iso: iso || null, authored: false };
}


// ── Country → default city LocationID fallback ───────────────
// Used when Pull_GetLocationByCoordinates_RQ returns nothing usable. These IDs are real
// RU LocationIDs harvested via Pull_ListLocations_RQ. Better to tag a property "Cape Town"
// than fall through to LocationID=1 (Andorra/test) which fails channel eligibility checks.
const RU_DEFAULT_CITY_BY_COUNTRY: Record<string, number> = {
  'SOUTH AFRICA': 1611, // Cape Town
  ZA: 1611,
  RSA: 1611,
  NAMIBIA: 7867,        // Windhoek
  NA: 7867,
  BOTSWANA: 1495,       // Gaborone
  BW: 1495,
};

async function resolveLocationId(
  supabase: any,
  lat: number,
  lng: number,
  country?: string | null,
  cityName?: string | null,
  explicitLocationId?: number | null,
): Promise<number> {
  // 0. Explicit RU LocationID chosen in ROLOS (Identity & Location → RU location picker).
  //    An admin-selected ID always wins over any name/coordinate guess.
  const explicit = Number(explicitLocationId);
  if (Number.isFinite(explicit) && explicit > 1) {
    console.log(`[push-property-to-ru] Using explicit RU LocationID from ROLOS: ${explicit}`);
    return explicit;
  }
  // 1. Try RU coordinate lookup

  if (lat && lng) {
    try {
      const { data, error } = await supabase.functions.invoke('rentalsunited-api', {
        body: { action: 'get_location_by_coordinates', metadata: { latitude: lat, longitude: lng } },
      });
      const id = Number(data?.location_id);
      if (!error && data?.success && Number.isFinite(id) && id > 1) {
        console.log(`[push-property-to-ru] Resolved LocationID via coords: ${id}`);
        return id;
      }
      console.warn(`[push-property-to-ru] Coord lookup unusable (id=${data?.location_id}, err=${error?.message ?? 'none'}) — trying name lookup`);
    } catch (e) {
      console.warn(`[push-property-to-ru] Coord lookup threw — trying name lookup:`, e instanceof Error ? e.message : e);
    }
  }
  // 2. Name lookup — try ru_locations cache first (scoped to country), then RU live API.
  const candidates = [cityName, country].map(s => (s || '').trim()).filter(Boolean) as string[];
  for (const candidate of candidates) {
    try {
      const { data: cached } = await supabase
        .from('ru_locations')
        .select('id, country, currency_iso')
        .ilike('name', candidate)
        .limit(5);
      const countryUpper = (country || '').trim().toUpperCase();
      const match = (cached || []).find((r: any) => !countryUpper || (r.country || '').toUpperCase().includes(countryUpper));
      if (match?.id) {
        console.log(`[push-property-to-ru] Resolved LocationID via ru_locations cache for "${candidate}": ${match.id}`);
        return Number(match.id);
      }
    } catch { /* cache miss is fine */ }

    try {
      const { data, error } = await supabase.functions.invoke('rentalsunited-api', {
        body: { action: 'get_location_by_name', location_name: candidate },
      });
      const id = Number(data?.location_id);
      if (!error && data?.success && Number.isFinite(id) && id > 1) {
        console.log(`[push-property-to-ru] Resolved LocationID via name lookup "${candidate}": ${id}`);
        return id;
      }
    } catch (e) {
      console.warn(`[push-property-to-ru] Name lookup "${candidate}" threw:`, e instanceof Error ? e.message : e);
    }
  }
  // 3. Country fallback
  const key = String(country || '').trim().toUpperCase();
  if (key && RU_DEFAULT_CITY_BY_COUNTRY[key]) {
    const fallback = RU_DEFAULT_CITY_BY_COUNTRY[key];
    console.log(`[push-property-to-ru] Using country-default LocationID for "${key}": ${fallback}`);
    return fallback;
  }
  // 4. Hard fail — never silently return 1 (= Andorra / test sentinel).
  console.error(`[push-property-to-ru] LocationID unresolvable (lat=${lat}, lng=${lng}, country=${country}, city=${cityName}) — refusing to default to 1`);
  return 0;
}

// Look up the currency ISO RU has assigned to a given LocationID (from ru_locations cache).
async function getRuLocationCurrency(supabase: any, locationId: number): Promise<{ iso: string | null; country: string | null } | null> {
  if (!locationId) return null;
  try {
    const { data } = await supabase
      .from('ru_locations')
      .select('currency_iso, country')
      .eq('id', locationId)
      .maybeSingle();
    if (!data) return null;
    return { iso: data.currency_iso || null, country: data.country || null };
  } catch { return null; }
}

const ISO_BY_RU_CURRENCY_ID: Record<number, string> = {
  48: 'ZAR', 144: 'USD', 47: 'EUR', 49: 'GBP',
  91: 'NAD', 24: 'BWP', 6: 'AUD', 32: 'CAD',
  39: 'CHF', 76: 'JPY', 94: 'NZD', 1: 'AED',
  88: 'MZN', 175: 'ZMW',
};

// ── pms_mappings persistence helpers ─────────────────────────

async function loadRuPropertyMapping(
  supabase: any,
  propertyId: string,
): Promise<{ ru_location_id?: number; ru_currency_id?: number; ru_country?: string; coords_hash?: string } | null> {
  try {
    const { data } = await supabase
      .from('pms_mappings')
      .select('metadata')
      .eq('property_id', propertyId)
      .eq('system_type', 'rentals_united')
      .eq('mapping_type', 'field_mappings')
      .eq('external_id', '__property__')
      .maybeSingle();
    return (data?.metadata as any) || null;
  } catch { return null; }
}

async function persistRuPropertyMapping(
  supabase: any,
  propertyId: string,
  data: { ru_location_id: number; ru_currency_id: number; ru_country: string | null; coords_hash: string },
): Promise<void> {
  try {
    await supabase.from('pms_mappings').upsert({
      property_id: propertyId,
      mapping_type: 'field_mappings',
      system_type: 'rentals_united',
      external_id: '__property__',
      metadata: {
        mapping_kind: 'property_geo_currency',
        authority: 'rentals_united',
        ru_location_id: data.ru_location_id,
        ru_currency_id: data.ru_currency_id,
        ru_country: data.ru_country,
        coords_hash: data.coords_hash,
        updated_at: new Date().toISOString(),
      },
    }, { onConflict: 'property_id,system_type,mapping_type,external_id' });
  } catch (e) {
    console.warn('[push-property-to-ru] Failed to persist geo/currency mapping:', e instanceof Error ? e.message : e);
  }
}

function hashCoords(lat: number, lng: number): string {
  return `${(Number(lat) || 0).toFixed(5)},${(Number(lng) || 0).toFixed(5)}`;
}

/**
 * ARRIVAL CONTACT — RU's <ArrivalInstructions> Landlord/Email/Phone.
 *
 * ROL'OS authors these in Identity & Contact (`amenities.contact.owner|email|telephone`,
 * with `amenities.contact_email` / `amenities.telephone` as the flat legacy twins).
 * The old code read `contact.name`, a key the property form never writes, so RU received the
 * PROPERTY NAME as the landlord instead of the contact person. Property name is the last resort.
 */
function resolveArrivalContact(
  property: PropertyRow,
  amenities: Record<string, unknown>,
): { arrival_landlord: string; arrival_email: string; arrival_phone: string } {
  const contact = ((amenities as any)?.contact || {}) as Record<string, unknown>;
  const first = (...vals: unknown[]) => {
    for (const v of vals) {
      const s = typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim();
      if (s) return s;
    }
    return '';
  };
  return {
    arrival_landlord: first(
      contact.owner, contact.name, contact.contact_person,
      (amenities as any)?.key_representative,
      property.name,
    ) || 'RoomsOnline',
    arrival_email: first(
      contact.email, (amenities as any)?.contact_email, (property as any)?.owner_email,
    ) || 'dev@roomsonline.co.za',
    arrival_phone: first(
      contact.telephone, contact.phone, (amenities as any)?.telephone, (amenities as any)?.phone,
    ) || '+27 824602220',
  };
}

/**
 * CHECK-IN / CHECK-OUT TIMES — RU's <CheckInOut> block.
 *
 * RU enforces a rule its own UI states as "Check-out time must not be later than the
 * check-in time from": CheckOutUntil <= CheckInFrom. Pushing a violating trio leaves the
 * listing in a state RU refuses to edit, so we resolve, normalise and validate here and
 * report a violation instead of publishing values the channel will reject.
 *
 * Source order: unit-authored time, then property house rules, then our fallback.
 */
const RU_CHECK_IN_DEFAULTS = { from: '14:00', to: '22:00', out: '10:00' } as const;

/** Accepts `9:00`, `09:00:00`, `09h00` → `09:00`. Returns null when unusable. */
function normaliseTimeOfDay(value: unknown): string | null {
  const raw = typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();
  if (!raw) return null;
  const m = raw.match(/^(\d{1,2})\s*[:h.]?\s*(\d{2})?/);
  if (!m) return null;
  const hours = Number(m[1]);
  const minutes = Number(m[2] ?? '0');
  if (!Number.isFinite(hours) || hours < 0 || hours > 23) return null;
  if (!Number.isFinite(minutes) || minutes < 0 || minutes > 59) return null;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function minutesOfDay(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

interface RuCheckInOut {
  check_in_from: string;
  check_in_to: string;
  check_out_until: string;
  /** Which layer supplied the times, for the push report. */
  source: 'unit' | 'property' | 'default';
  /** True when any of the three fell back to our default rather than authored data. */
  is_default: boolean;
  /** Set when the authored trio breaks a channel rule — the unit must not be pushed. */
  violation: string | null;
}

function resolveCheckInOut(
  amenities: Record<string, unknown>,
  unitCheckIn?: unknown,
  unitCheckOut?: unknown,
): RuCheckInOut {
  const houseRules = ((amenities as any)?.house_rules || {}) as Record<string, unknown>;

  const unitFrom = normaliseTimeOfDay(unitCheckIn);
  const unitOut = normaliseTimeOfDay(unitCheckOut);
  const propFrom = normaliseTimeOfDay(houseRules.check_in_from);
  const propTo = normaliseTimeOfDay(houseRules.check_in_to);
  const propOut = normaliseTimeOfDay(houseRules.check_out_to ?? houseRules.check_out_until);

  const from = unitFrom ?? propFrom;
  const to = propTo;
  const out = unitOut ?? propOut;

  const source: RuCheckInOut['source'] = unitFrom || unitOut ? 'unit' : propFrom || propTo || propOut ? 'property' : 'default';
  const resolved: RuCheckInOut = {
    check_in_from: from ?? RU_CHECK_IN_DEFAULTS.from,
    check_in_to: to ?? RU_CHECK_IN_DEFAULTS.to,
    check_out_until: out ?? RU_CHECK_IN_DEFAULTS.out,
    source,
    is_default: !from || !to || !out,
    violation: null,
  };

  // Only authored values can be a violation — our defaults are always compliant.
  if (from && to && minutesOfDay(to) <= minutesOfDay(from)) {
    resolved.violation = `Check-in window is invalid: "to" (${to}) must be later than "from" (${from}).`;
  } else if (from && out && minutesOfDay(out) > minutesOfDay(from)) {
    resolved.violation = `Check-out time (${out}) must not be later than the check-in from time (${from}) — the channel refuses this combination.`;
  }
  return resolved;
}


function resolveArrivalInstructions(unitInstructions: unknown, amenities: Record<string, unknown>): string {
  const houseRules = ((amenities as any)?.house_rules || {}) as Record<string, unknown>;
  const policies = ((amenities as any)?.policies || {}) as Record<string, unknown>;
  const candidates = [
    unitInstructions,
    houseRules.check_in_instructions,
    houseRules.arrival_instructions,
    policies.check_in_instructions,
    policies.arrival_instructions,
  ];
  for (const c of candidates) {
    const s = typeof c === 'string' ? c.trim() : '';
    if (s) return s;
  }
  return '';
}


// ── Build RU payload for a single unit ───────────────────────

// Floor is authored per room type in ROLOS (amenities.room_types[].floor).
// Match the pushed unit back to that entry by name / pms id; fall back to ground floor.
function resolveUnitFloor(property: PropertyRow, unit: RoomTypeRow | null): { floor: number; isDefault: boolean } {
  const list = ((property.amenities as any)?.room_types || []) as any[];
  const norm = (v: unknown) => String(v ?? '').trim().toLowerCase();
  let match: any = null;
  if (Array.isArray(list) && list.length > 0) {
    if (unit) {
      match = list.find((rt) =>
        (rt?.pmsRoomId && norm(rt.pmsRoomId) === norm(unit.id)) ||
        (rt?.id && norm(rt.id) === norm(unit.id)) ||
        (rt?.name && norm(rt.name) === norm(unit.name))
      ) || null;
    }
    if (!match && list.length === 1) match = list[0];
  }
  const raw = match?.floor;
  const n = typeof raw === 'number' ? raw : raw === null || raw === undefined || raw === '' ? NaN : Number(raw);
  if (Number.isFinite(n)) return { floor: n, isDefault: false };
  // Fall back to the property-level floor authored in Setup Property → General.
  const propRaw = (property.amenities as any)?.property_floor;
  const propN = typeof propRaw === 'number' ? propRaw : propRaw === null || propRaw === undefined || propRaw === '' ? NaN : Number(propRaw);
  if (Number.isFinite(propN)) return { floor: propN, isDefault: false };
  return { floor: 0, isDefault: true };
}

/**
 * RU Space (property size in m²): unit room size → property-level size authored in
 * Setup Property → General → default 50. The default is flagged so readiness reports it.
 */
function resolvePropertySize(property: PropertyRow, unitSize: number | null | undefined): { space: number; isDefault: boolean } {
  const unitN = Number(unitSize);
  if (Number.isFinite(unitN) && unitN > 0) return { space: unitN, isDefault: false };
  const propN = Number((property.amenities as any)?.property_size_sqm);
  if (Number.isFinite(propN) && propN > 0) return { space: propN, isDefault: false };
  return { space: 50, isDefault: true };
}

/**
 * RU composition (bathrooms / toilets / separate kitchen) is authored per unit in the
 * Rooms tab. Unit values win; the property-wide Composition card is only the fallback.
 * Unit toilets / separate kitchen live in properties.amenities.room_types[] (same entry
 * that carries `floor`), matched back to the pushed unit by pms id / id / name.
 */
function resolveUnitComposition(
  property: PropertyRow,
  unit: RoomTypeRow | null,
): { bathrooms: number; toilets: number; separateKitchen: boolean } {
  const list = ((property.amenities as any)?.room_types || []) as any[];
  const norm = (v: unknown) => String(v ?? '').trim().toLowerCase();
  let match: any = null;
  if (Array.isArray(list) && list.length > 0) {
    if (unit) {
      match = list.find((rt) =>
        (rt?.pmsRoomId && norm(rt.pmsRoomId) === norm(unit.id)) ||
        (rt?.linkedRolosId && norm(rt.linkedRolosId) === norm(unit.id)) ||
        (unit.linked_rolos_id && rt?.id && norm(rt.id) === norm(unit.linked_rolos_id)) ||
        (rt?.id && norm(rt.id) === norm(unit.id)) ||
        (rt?.name && norm(rt.name) === norm(unit.name))
      ) || null;
    }
    if (!match && list.length === 1) match = list[0];
  }

  const num = (v: unknown) => {
    const n = typeof v === 'number' ? v : v === null || v === undefined || v === '' ? NaN : Number(v);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };

  // A multi-unit listing must explicitly author composition on the matching canonical
  // room entry. Never let a property-wide value hide a blank or unmatched unit field.
  const requiresExplicitUnitComposition = list.length > 1;
  const bathrooms = requiresExplicitUnitComposition
    ? num(match?.bathrooms)
    : num(match?.bathrooms) || num(unit?.bathrooms) || num(property.bathrooms);
  const toilets = requiresExplicitUnitComposition
    ? num(match?.toilets ?? match?.separateToilets)
    : num(match?.toilets ?? match?.separateToilets) || num(property.toilets);
  const separateKitchen =
    match?.separateKitchen === true || match?.separate_kitchen === true
      ? true
      : property.separate_kitchen === true;

  return { bathrooms, toilets, separateKitchen };
}

/**
 * RU derives the public Composition panel (bedrooms / bathrooms / toilets) from the
 * `CompositionRoomsAmenities` blocks — one block per room. Listing 81 (Bathroom) and
 * 37 (toilet) in the root <Amenities> list is stored but never counted there, which is
 * why properties published as "0 Bathroom / 0 Toilet".
 *
 * Valid composition room ids for this account: 53 WC, 81 Bathroom, 94 kitchen in the
 * living/dining room, 101 Kitchen, 249 Living room, 257 Bedroom, 372 Livingroom/Bedroom,
 * 517 Bedroom/Living room with kitchen corner.
 *
 * A block with an empty <Amenities/> is parsed by RU as amenity id 0 and rejected
 * ("Wrong composition room id:0"), so every block carries a real child amenity — taken
 * from the unit's own selection where possible, otherwise a truthful minimum.
 */
const RU_BATHROOM_FIXTURE_IDS = [
  35, 36, 46, 50, 52, 239, 245, 252, 315, 321, 29, 33, 6, 7, 8, 344, 351, 395,
];
const RU_KITCHEN_ITEM_IDS = [2, 3, 17, 124, 125, 130, 131, 157, 94];
/**
 * Kitchen flavours in the dictionary. RU renders composition room 101 as
 * "Separate kitchen", so only the 101 family may use that block. A kitchenette /
 * kitchen-in-the-living-room selection maps to room 94 ("kitchen in the living /
 * dining room") — otherwise ROLOS says kitchenette and the OTA says separate kitchen.
 */
const RU_SEPARATE_KITCHEN_IDS = [101, 102, 135, 1262];
const RU_OPEN_KITCHEN_IDS = [94, 157];
/** Composition room id to use for the kitchen block, or null when no kitchen is declared. */
function resolveKitchenRoomId(
  selected: { id: number }[],
  separateKitchen: boolean,
): number | null {
  const has = (id: number) => selected.some((a) => Number(a.id) === id);
  if (RU_SEPARATE_KITCHEN_IDS.some(has)) return 101;
  if (RU_OPEN_KITCHEN_IDS.some(has)) return 94;
  if (has(517)) return 517;
  return separateKitchen ? 101 : null;
}
const RU_BATHROOM_FALLBACK_ID = 245; // washbasin
const RU_TOILET_ID = 37;

function compositionRoomBlocks(
  comp: { bathrooms: number; toilets: number; separateKitchen: boolean },
  selected: { id: number; count: number }[],
): { room_id: number; amenities: { id: number; count: number }[] }[] {
  const has = (id: number) => selected.some((a) => a.id === id);
  const firstOf = (ids: number[]) => ids.find((id) => has(id));
  const blocks: { room_id: number; amenities: { id: number; count: number }[] }[] = [];

  const bathroomChild = firstOf(RU_BATHROOM_FIXTURE_IDS) ?? RU_BATHROOM_FALLBACK_ID;
  for (let i = 0; i < comp.bathrooms; i++) {
    blocks.push({ room_id: 81, amenities: [{ id: bathroomChild, count: 1 }] });
  }
  for (let i = 0; i < comp.toilets; i++) {
    blocks.push({ room_id: 53, amenities: [{ id: RU_TOILET_ID, count: 1 }] });
  }
  const kitchenRoomId = resolveKitchenRoomId(selected, comp.separateKitchen);
  if (kitchenRoomId !== null) {
    const kitchenChild = firstOf(RU_KITCHEN_ITEM_IDS) ?? 2; // cookware & kitchen utensils
    blocks.push({ room_id: kitchenRoomId, amenities: [{ id: kitchenChild, count: 1 }] });
  }
  return blocks;
}





function buildUnitPayload(
  property: PropertyRow,
  unit: RoomTypeRow,
  locationId: number,
  buildingId?: number,
  currencyId?: number,
  charges?: RuChargeRow[] | null,
) {
  const amenities = property.amenities || {};
  const authoredUnitType = unit.property_type || property.property_type || null;
  const unitType = (authoredUnitType || 'apartment').toLowerCase().replace(/[\s-]+/g, '_');
  // An unmapped type used to publish silently as Chalet (12). The value is still sent so the
  // XML stays schema-valid, but it is flagged so the readiness gate blocks the push.
  const mappedObjectTypeId = resolveRuTypeId(unitType);
  const objectTypeId = mappedObjectTypeId || 12;
  const objectTypeIsDefault = !mappedObjectTypeId;
  const currencyAuthored = resolveAuthoredCurrency(property.amenities);


  const lat = unit.latitude || property.latitude || 0;
  const lng = unit.longitude || property.longitude || 0;
  const street = unit.address_street || property.address || 'Not specified';
  const zipCode = resolveZipCode(unit.address_postal_code, property);
  const maxGuests = Number(unit.max_guests) || 0;
  const { space, isDefault: spaceIsDefault } = resolvePropertySize(property, unit.room_size);
  const paymentMethods = mapPaymentMethods(property.amenities);
  const cancellationPolicies = mapCancellationPolicies(amenities as Record<string, unknown>);
  const { floor: unitFloor, isDefault: unitFloorIsDefault } = resolveUnitFloor(property, unit);

  const houseRules = (amenities as any)?.house_rules || {};
  const contact = (amenities as any)?.contact || {};
  const checkTimes = resolveCheckInOut(
    amenities as Record<string, unknown>,
    unit.check_in_time,
    unit.check_out_time,
  );

  const banking = (amenities as any)?.banking || {};
  const depositPercent = toFiniteNumber(banking.deposit_percentage ?? banking.prepayment_percentage);
  const depositAmount = toFiniteNumber(banking.deposit_amount ?? banking.prepayment_amount);
  const deposit = depositPercent && depositPercent > 0 ? depositPercent : depositAmount && depositAmount > 0 ? depositAmount : 0;
  const depositTypeId = depositPercent && depositPercent > 0 ? 3 : depositAmount && depositAmount > 0 ? 5 : 1;
  // Charges tab is the only authority for the deposit: no active deposit charge that applies
  // to this unit means the listing carries no security deposit at all.
  const securityDeposit = resolveRuSecurityDeposit(charges, unit.id);
  const cleaningPrice = resolveRuCleaningFee(charges, unit.id) ?? toFiniteNumber(unit.cleaning_fee) ?? 0;


  // Use unit images first, fall back to property images
  let images = mapImages(unit.images as unknown[] | null, (unit as any).ru_image_tags);
  const ownImageCount = images.length;
  if (images.length < 10) {
    const propImages = mapImages(property.images as unknown[] | null, (property as any).ru_image_tags);
    const seenUrls = new Set(images.map(i => i.url));
    for (const pi of propImages) {
      if (!seenUrls.has(pi.url)) { images.push(pi); seenUrls.add(pi.url); }
    }
  }
  images = restampRuImages(images);
  const inheritedImageCount = Math.max(0, images.length - ownImageCount);

  // Amenities: merge unit + property (property-level facilities are always additive so
  // the RU-aligned property selection reaches every unit of the listing).
  let unitAmenities = mapAmenities(unit.amenities);
  {
    const propAmenities = mapAmenities(property.amenities);
    const seenIds = new Set(unitAmenities.map(a => a.id));
    for (const pa of propAmenities) {
      if (!seenIds.has(pa.id)) { unitAmenities.push(pa); seenIds.add(pa.id); }
    }
    // Composition-derived amenities: RU expects Bathroom (81), WC (37) and Kitchen (101)
    // to be declared with their quantities. Unit values win, property values are the fallback.
    const comp = resolveUnitComposition(property, unit);
    const bathroomCount = comp.bathrooms;
    const toiletCount = comp.toilets;
    const pushComposition = (id: number, count: number) => {
      if (count <= 0) return;
      const existing = unitAmenities.find(a => a.id === id);
      if (existing) existing.count = Math.max(existing.count, count);
      else unitAmenities.push({ id, count });
    };
    pushComposition(81, bathroomCount);
    pushComposition(37, toiletCount);
    if (comp.separateKitchen && resolveKitchenRoomId(unitAmenities, true) === 101) {
      pushComposition(101, 1);
    }

  }


  // Calculate beds from bed_configuration if available (legacy string configs normalised)
  let beds = 0;
  const unitBedConfig = normalizeBedConfiguration(unit.bed_configuration);
  const bedAmenities: { id: number; count: number }[] = [];
  if (unitBedConfig.length > 0) {
    beds = unitBedConfig.reduce((sum: number, b) => sum + (b.count || 0), 0);
    // Map bed types to RU bed amenity IDs
    const seenBedIds = new Set<number>();
    for (const bedEntry of unitBedConfig) {
      const ruBedId = resolveBedAmenityId(bedEntry.type).id;
      if (ruBedId && !seenBedIds.has(ruBedId)) {
        seenBedIds.add(ruBedId);
        bedAmenities.push({ id: ruBedId, count: bedEntry.count || 1 });
      } else if (ruBedId && seenBedIds.has(ruBedId)) {
        // Add count to existing entry
        const existing = bedAmenities.find(a => a.id === ruBedId);
        if (existing) existing.count += (bedEntry.count || 1);
      }
    }
  }

  if (!beds) beds = Number(unit.beds) || 0;
  const descText = unit.description || property.description || unit.name;

  // Build CompositionRoomsAmenities using RU's REAL global dictionary
  // (fetched via Pull_ListCompositionRooms_RQ — only 8 IDs are valid for this account):
  //   53  = WC
  //   81  = Bathroom
  //   94  = Kitchen in the living/dining room
  //   101 = Kitchen
  //   249 = Living room
  //   257 = Bedroom              ← repeat per bedroom (no 81/82/83 variants exist)
  //   372 = Livingroom/Bedroom
  //   517 = Bedroom/Living room with kitchen corner
  // Strategy: one <CompositionRoomAmenities RoomID="257"> per bedroom (with its bed amenity),
  // plus one RoomID="81" per bathroom, plus one RoomID="101" for the kitchen.
  // Bed amenities only belong inside a Bedroom (257) block.
  const RU_BEDROOM_ID = 257;
  const RU_BATHROOM_ID = 81;
  const RU_KITCHEN_ID = 101;
  const rooms: { room_id: number; amenities: { id: number; count: number }[] }[] = [];

  // Bedrooms: one block per AUTHORED sleeping space (a bedroom with two beds is one block)
  const unmappedUnitBedLabels: string[] = [];
  if (unitBedConfig.length > 0) {
    const built = bedBlocksFromConfiguration(unit.bed_configuration);
    unmappedUnitBedLabels.push(...built.unmapped);
    rooms.push(...built.rooms);
  }


  // Bathroom (81), WC (53) and Kitchen (101) blocks: RU counts these blocks to render the
  // Composition panel, so one block is emitted per bathroom and per toilet. Each block
  // carries a real child amenity — an empty <Amenities/> is read as id:0 and rejected.
  rooms.push(...compositionRoomBlocks(resolveUnitComposition(property, unit), unitAmenities));



  return {
    name: unit.name,
    // <PropertyTypeID> = bedroom layout (Studio / One Bedroom / …), NOT the listing kind.
    property_type_id: resolveRuLayoutTypeId((unit as { bedrooms?: unknown }).bedrooms),
    // Listing kind (Apartment, Villa, …) — sent as <ObjectTypeID> by the orchestrator.
    listing_type_id: objectTypeId,
    object_type_is_default: objectTypeIsDefault,
    object_type_source: authoredUnitType,
    can_sleep_max: maxGuests,
    standard_guests: Math.ceil(maxGuests * 0.7),
    number_of_beds: beds,
    currency_id: currencyId ?? mapCurrencyToRUId(property.amenities, property.country),
    currency_is_default: !currencyAuthored.authored,
    currency_iso: currencyAuthored.iso,
    unmapped_bed_labels: unmappedUnitBedLabels,
    // Declared bedrooms — the scorer requires one bedroom composition block per declared bedroom.
    declared_bedrooms: Math.max(0, Number((unit as { bedrooms?: unknown }).bedrooms) || 0),

    changeover_is_default: !isChangeoverAuthored(unit.amenities as Record<string, any> | null, amenities as Record<string, any>, (unit as { id?: unknown }).id),

    owner_id: 0, // placeholder — always overwritten with the resolved sub-account OwnerID
    no_of_units: 1,
    floor: unitFloor,
    floor_is_default: unitFloorIsDefault,
    space,
    space_is_default: spaceIsDefault,
    street,
    detailed_location_id: locationId,
    zip_code: zipCode,
    latitude: lat,
    longitude: lng,
    amenities: unitAmenities,
    rooms,
    descriptions: [{ language_id: 1, text: descText }],
    images,
    images_inherited_count: inheritedImageCount,
    payment_methods: paymentMethods.methods,
    payment_methods_is_default: paymentMethods.isDefault,
    deposit,
    deposit_type_id: depositTypeId,
    cleaning_price: cleaningPrice,
    cancellation_policies: cancellationPolicies.rules,
    cancellation_policies_is_default: cancellationPolicies.isDefault,
    security_deposit: securityDeposit,
    ...resolveArrivalContact(property, amenities as Record<string, unknown>),
    arrival_days_before: toFiniteNumber(houseRules.days_before_arrival) ?? 0,
    arrival_how_to_arrive: resolveArrivalInstructions(
      unit.check_in_instructions,
      amenities as Record<string, unknown>,
    ),
    check_in_from: checkTimes.check_in_from,
    check_in_to: checkTimes.check_in_to,
    check_out_until: checkTimes.check_out_until,
    check_in_times_are_default: checkTimes.is_default,
    check_in_times_source: checkTimes.source,
    check_in_times_violation: checkTimes.violation,
    check_in_place: 'at_the_apartment',
    building_id: buildingId,
    object_type_id: undefined as number | undefined, // populated by orchestrator after push_building
  };
}

// Legacy single-property payload builder (kept for properties with no room types)
function buildSinglePropertyPayload(property: PropertyRow, roomTypes: RoomTypeRow[], locationId: number, currencyId?: number, charges?: RuChargeRow[] | null) {
  const primaryRoom = roomTypes[0] || null;
  const amenities = property.amenities || {};
  const authoredSingleType = primaryRoom?.property_type || property.property_type || null;
  const mappedSingleTypeId = resolveRuTypeId(
    (authoredSingleType || 'apartment').toLowerCase().replace(/[\s-]+/g, '_'),
  );
  const objectTypeId = mappedSingleTypeId || 1;
  const objectTypeIsDefault = !mappedSingleTypeId;
  const currencyAuthored = resolveAuthoredCurrency(property.amenities);

  const lat = primaryRoom?.latitude || property.latitude || 0;
  const lng = primaryRoom?.longitude || property.longitude || 0;
  const street = primaryRoom?.address_street || property.address || 'Not specified';
  const zipCode = resolveZipCode(primaryRoom?.address_postal_code, property);
  let maxGuests = property.max_guests || 0;
  if (maxGuests <= 1 && roomTypes.length > 0) maxGuests = roomTypes.reduce((sum, rt) => sum + (rt.max_guests || 2), 0);
  if (maxGuests < 1) maxGuests = 2;
  const { space, isDefault: spaceIsDefault } = resolvePropertySize(property, primaryRoom?.room_size);
  const paymentMethods = mapPaymentMethods(property.amenities);
  const cancellationPolicies = mapCancellationPolicies(amenities as Record<string, unknown>);
  const { floor: buildingFloor, isDefault: buildingFloorIsDefault } = resolveUnitFloor(property, primaryRoom);
  const houseRules = (amenities as any)?.house_rules || {};
  const contact = (amenities as any)?.contact || {};
  const banking = (amenities as any)?.banking || {};
  const depositPercent = toFiniteNumber(banking.deposit_percentage ?? banking.prepayment_percentage);
  const depositAmount = toFiniteNumber(banking.deposit_amount ?? banking.prepayment_amount);
  const deposit = depositPercent && depositPercent > 0 ? depositPercent : depositAmount && depositAmount > 0 ? depositAmount : 0;
  const depositTypeId = depositPercent && depositPercent > 0 ? 3 : depositAmount && depositAmount > 0 ? 5 : 1;
  // Charges tab is the only authority for the deposit (see ruDeposits.ts).
  const securityDeposit = resolveRuSecurityDeposit(charges, primaryRoom?.id);
  const cleaningPrice = resolveRuCleaningFee(charges, primaryRoom?.id) ?? toFiniteNumber(primaryRoom?.cleaning_fee) ?? 0;
  // Building-level rooms: RU counts the bed amenities inside every Bedroom (257) block
  // and rejects the listing ("Add sufficient amount of beds") when they cover less than
  // half of CanSleepMax. Emit the real bed_configuration of every room type instead of a
  // single default double bed per room type.
  const rooms: { room_id: number; amenities: { id: number; count: number }[] }[] = [];
  const unmappedBedLabels: string[] = [];
  let bedsDerivedFromCounts = false;
  for (const rt of roomTypes) {
    const built = bedBlocksFromConfiguration(rt.bed_configuration);
    unmappedBedLabels.push(...built.unmapped);
    if (built.rooms.length > 0) {
      rooms.push(...built.rooms);
      continue;
    }
    // Do not invent beds from occupancy. Missing authored bed data must remain a
    // readiness blocker rather than producing a payload that appears compliant.
    const bedroomCount = Math.max(0, Number(rt.bedrooms) || 0);
    const bedTotal = Math.max(0, Number(rt.beds) || 0);
    if (bedroomCount > 0 && bedTotal > 0) {
      const perRoom = Math.max(1, Math.ceil(bedTotal / bedroomCount));
      for (let i = 0; i < bedroomCount; i++) rooms.push({ room_id: 257, amenities: [{ id: RU_DEFAULT_BED_ID, count: perRoom }] });
      // Derived from bedroom / bed counts, not from an authored bed configuration.
      bedsDerivedFromCounts = true;
    }
  }

  let allImages = mapImages(property.images as unknown[] | null, (property as any).ru_image_tags);
  for (const rt of roomTypes) allImages = allImages.concat(mapImages(rt.images as unknown[] | null, (rt as any).ru_image_tags));
  const seenUrls = new Set<string>();
  allImages = allImages.filter(img => { if (seenUrls.has(img.url)) return false; seenUrls.add(img.url); return true; });
  allImages = restampRuImages(allImages);
  // Bed count is derived from the bedroom blocks only — measure it before the bathroom /
  // WC / kitchen composition blocks are appended.
  const totalBeds = rooms.reduce((sum, r) => sum + r.amenities.reduce((sm, a) => sm + (a.count || 1), 0), 0);
  const numberOfBeds = totalBeds;

  // Single-listing path: composition falls back to the property-wide values, but the
  // primary room type's own bathrooms / toilets / kitchen win when set.
  const singleComp = resolveUnitComposition(property, primaryRoom);
  const singleAmenities = mapAmenities(property.amenities);
  {
    const push = (id: number, count: number) => {
      if (count <= 0) return;
      const existing = singleAmenities.find((a: any) => a.id === id);
      if (existing) existing.count = Math.max(existing.count, count);
      else singleAmenities.push({ id, count } as any);
    };
    push(81, singleComp.bathrooms);
    push(37, singleComp.toilets);
    if (singleComp.separateKitchen && resolveKitchenRoomId(singleAmenities as any, true) === 101) {
      push(101, 1);
    }
  }
  // RU renders the Composition panel from these blocks, so bathrooms and toilets need one
  // block each (with a real child amenity — an empty list is read as id:0 and rejected).
  rooms.push(...compositionRoomBlocks(singleComp, singleAmenities));

  return {
    name: property.name,
    // <PropertyTypeID> = bedroom layout; listing kind travels as <ObjectTypeID>.
    property_type_id: resolveRuLayoutTypeId(
      (primaryRoom as { bedrooms?: unknown } | null)?.bedrooms ?? (property as { bedrooms?: unknown }).bedrooms,
    ),
    listing_type_id: objectTypeId,
    object_type_is_default: objectTypeIsDefault,
    object_type_source: authoredSingleType,
    can_sleep_max: maxGuests,
    standard_guests: Math.ceil(maxGuests * 0.7),
    number_of_beds: numberOfBeds,
    currency_id: currencyId ?? mapCurrencyToRUId(property.amenities, property.country),
    currency_is_default: !currencyAuthored.authored,
    currency_iso: currencyAuthored.iso,
    beds_are_default: bedsDerivedFromCounts,
    changeover_is_default: !isChangeoverAuthored((primaryRoom?.amenities as Record<string, any>) || null, amenities as Record<string, any>, (primaryRoom as { id?: unknown } | undefined)?.id),

    owner_id: 0, no_of_units: 1, floor: buildingFloor, floor_is_default: buildingFloorIsDefault, space, space_is_default: spaceIsDefault, street,
    detailed_location_id: locationId, zip_code: zipCode,
    latitude: lat, longitude: lng,
    amenities: singleAmenities,


    rooms, descriptions: [{ language_id: 1, text: property.description || property.name || 'Beautiful property' }],
    images: allImages,
    payment_methods: paymentMethods.methods,
    payment_methods_is_default: paymentMethods.isDefault,
    deposit, deposit_type_id: depositTypeId,
    cleaning_price: cleaningPrice,
    cancellation_policies: cancellationPolicies.rules,
    cancellation_policies_is_default: cancellationPolicies.isDefault,
    security_deposit: securityDeposit,
    ...resolveArrivalContact(property, amenities as Record<string, unknown>),
    arrival_days_before: toFiniteNumber(houseRules.days_before_arrival) ?? 0,
    arrival_how_to_arrive: resolveArrivalInstructions(
      primaryRoom?.check_in_instructions,
      amenities as Record<string, unknown>,
    ),
    ...(() => {
      const t = resolveCheckInOut(
        amenities as Record<string, unknown>,
        primaryRoom?.check_in_time,
        primaryRoom?.check_out_time,
      );
      return {
        check_in_from: t.check_in_from,
        check_in_to: t.check_in_to,
        check_out_until: t.check_out_until,
        check_in_times_are_default: t.is_default,
        check_in_times_source: t.source,
        check_in_times_violation: t.violation,
      };
    })(),
    check_in_place: 'at_the_apartment',
    unmapped_bed_labels: unmappedBedLabels,
  };
}

function extractRUPropertyId(rawXml: string): string | null {
  const match = rawXml.match(/<ID>(\d+)<\/ID>/);
  return match?.[1] || null;
}

// ── ARI Push Helper ──────────────────────────────────────────

interface UnitContext {
  id: string;
  name: string;
  linked_rolos_id?: string | null;
  amenities?: Record<string, any> | null;
}

// NOTE: the legacy per-unit season-rate resolver used to fall back to "the lowest rate found
// anywhere in the season" when a unit's own key was missing, which published a price the unit
// never charged. All ARI pricing now goes through the shared rate resolver
// (`createRateResolver`), which prices per unit and refuses to publish an unpriced night, so
// the fallback resolver has been removed rather than kept as a silent safety net.


// ── Step 6: Per-night availability expansion ─────────────────
// Maps day-of-week → RU changeover code (0=none, 1=check-in only, 2=check-out only, 3=both)
const DOW_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/**
 * Per-unit changeover override authored in ROL'OS (Rooms tab). It is mirrored to
 * `amenities.changeover_by_unit` keyed by unit id, because unit-level amenities are
 * PMS-owned and get rebuilt on sync.
 */
function unitChangeoverOverride(unitId: unknown, propertyAmenities: Record<string, any>): number | null {
  const map = propertyAmenities?.changeover_by_unit;
  if (!unitId || !map || typeof map !== 'object') return null;
  const raw = (map as Record<string, unknown>)[String(unitId)];
  return raw == null || raw === '' || isNaN(Number(raw)) ? null : Number(raw);
}

function resolveChangeoverRules(
  unit: UnitContext | undefined,
  propertyAmenities: Record<string, any>,
): { perDow: Record<number, number> | null; defaultCode: number; isDefault: boolean } {
  const unitAmenities = (unit?.amenities || {}) as Record<string, any>;
  const rules = (unitAmenities.changeover_rules ?? propertyAmenities.changeover_rules) as Record<string, any> | undefined;
  const authoredCode =
    unitAmenities.changeover ??
    unitChangeoverOverride((unit as { id?: unknown } | undefined)?.id, propertyAmenities) ??
    propertyAmenities.changeover;
  const defaultCode = Number(authoredCode ?? 3);
  if (rules && typeof rules === 'object' && !Array.isArray(rules)) {
    const perDow: Record<number, number> = {};
    for (let i = 0; i < 7; i++) {
      const v = rules[DOW_KEYS[i]];
      if (v != null && !isNaN(Number(v))) perDow[i] = Number(v);
    }
    if (Object.keys(perDow).length > 0) return { perDow, defaultCode, isDefault: false };
  }
  // No per-day rules and no authored code — the code below is our assumption, not the owner's.
  return { perDow: null, defaultCode, isDefault: authoredCode == null };
}

/** Is a changeover rule authored anywhere for this unit / property? */
function isChangeoverAuthored(
  unitAmenities: Record<string, any> | null,
  propertyAmenities: Record<string, any>,
  unitId?: unknown,
): boolean {
  const ua = (unitAmenities || {}) as Record<string, any>;
  const rules = (ua.changeover_rules ?? propertyAmenities.changeover_rules) as Record<string, any> | undefined;
  if (rules && typeof rules === 'object' && !Array.isArray(rules)) {
    if (DOW_KEYS.some((k) => rules[k] != null && !isNaN(Number(rules[k])))) return true;
  }
  if (unitChangeoverOverride(unitId, propertyAmenities) != null) return true;
  return (ua.changeover ?? propertyAmenities.changeover) != null;
}


type AvailabilityPeriod = { from: string; to: string; minStay: number; seasonId: string };

const isoAddDays = (iso: string, days: number): string => {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/**
 * Rentals United requires a *complete* rolling 365-day availability window, and it rejects
 * (or silently last-writes) overlapping ranges. Authored seasons satisfy neither guarantee:
 * they can start in the past, leave gaps between each other, and overlap one another.
 *
 * This normaliser produces exactly one entry per day of the window, in order:
 *  - periods clamped to [today, today+365]; fully past periods dropped
 *  - overlaps resolved day-by-day, later-authored periods winning (RU has no overlap semantics)
 *  - every remaining gap filled with a default (minStay 1) filler range
 * Contiguous days sharing the same minStay/origin are recompressed into ranges so the payload
 * stays small.
 */
function normalizeAvailabilityWindow(
  periods: AvailabilityPeriod[],
  windowFrom: string,
  windowTo: string,
): { periods: AvailabilityPeriod[]; coverage: { days_total: number; days_from_seasons: number; days_filled: number; overlaps_resolved: number } } {
  const perDay = new Map<string, { minStay: number; seasonId: string }>();
  let overlaps = 0;

  for (const p of periods) {
    if (!p.from || !p.to) continue;
    const from = p.from > windowFrom ? p.from : windowFrom;
    const to = p.to < windowTo ? p.to : windowTo;
    if (from > to) continue;
    for (let d = from; d <= to; d = isoAddDays(d, 1)) {
      if (perDay.has(d)) overlaps += 1;
      // Later-authored period wins: seasons are pushed in authoring order.
      perDay.set(d, { minStay: p.minStay, seasonId: p.seasonId });
    }
  }

  const daysFromSeasons = perDay.size;
  let filled = 0;
  for (let d = windowFrom; d <= windowTo; d = isoAddDays(d, 1)) {
    if (!perDay.has(d)) {
      perDay.set(d, { minStay: 1, seasonId: '__filler__' });
      filled += 1;
    }
  }

  // Recompress contiguous identical days back into ranges.
  const ordered = [...perDay.keys()].sort();
  const out: AvailabilityPeriod[] = [];
  for (const day of ordered) {
    const v = perDay.get(day)!;
    const last = out[out.length - 1];
    if (last && last.minStay === v.minStay && last.seasonId === v.seasonId && isoAddDays(last.to, 1) === day) {
      last.to = day;
    } else {
      out.push({ from: day, to: day, minStay: v.minStay, seasonId: v.seasonId });
    }
  }

  return {
    periods: out,
    coverage: {
      days_total: ordered.length,
      days_from_seasons: daysFromSeasons,
      days_filled: filled,
      overlaps_resolved: overlaps,
    },
  };
}


function expandAvailability(
  periods: { from: string; to: string; minStay: number }[],
  units: number,
  changeover: { perDow: Record<number, number> | null; defaultCode: number }
): { date_from: string; date_to: string; units: number; min_stay: number; changeover: number }[] {
  const out: { date_from: string; date_to: string; units: number; min_stay: number; changeover: number }[] = [];
  if (!changeover.perDow) {
    // No per-day rules — keep ranges (efficient)
    return periods.map(p => ({ date_from: p.from, date_to: p.to, units, min_stay: p.minStay, changeover: changeover.defaultCode }));
  }
  // Per-day rules — emit one entry per night
  for (const p of periods) {
    const start = new Date(p.from + 'T00:00:00Z');
    const end = new Date(p.to + 'T00:00:00Z');
    for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      const iso = d.toISOString().slice(0, 10);
      const dow = d.getUTCDay();
      const code = changeover.perDow[dow] ?? changeover.defaultCode;
      out.push({ date_from: iso, date_to: iso, units, min_stay: p.minStay, changeover: code });
    }
  }
  return out;
}

type AvailEntry = { date_from: string; date_to: string; units: number; min_stay: number; max_stay?: number; changeover: number };

type ManualDayOverride = { units?: number; min_stay?: number; max_stay?: number };

const normalizeRoomLabel = (v: string): string => v.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Manual restrictions authored on the ROL'OS dashboard (Stop Sell / Min Stay / Max Stay)
 * live in `property_availability` with `external_system = 'manual'`. They are authoritative
 * over the season-derived ARI window, so they must be overlaid before we push to RU.
 *
 * Unit-scoped push (multi-unit): only rows whose room type matches this unit apply.
 * Property-scoped push: a blocked room type reduces the sellable unit count for that date,
 * it never closes the whole property unless every room type is blocked.
 */
async function loadManualRestrictions(
  supabase: any,
  propertyId: string,
  windowFrom: string,
  windowTo: string,
  unitName: string | null,
  totalUnits: number,
): Promise<{ overrides: Map<string, ManualDayOverride>; stats: { rows: number; days: number; stop_sell_days: number; min_stay_days: number; max_stay_days: number } }> {
  const overrides = new Map<string, ManualDayOverride>();
  const stats = { rows: 0, days: 0, stop_sell_days: 0, min_stay_days: 0, max_stay_days: 0 };

  const { data, error } = await supabase
    .from('property_availability')
    .select('date, room_type, available_units, is_stop_sell, minimum_stay, maximum_stay')
    .eq('property_id', propertyId)
    .eq('external_system', 'manual')
    .gte('date', windowFrom)
    .lte('date', windowTo);

  if (error || !Array.isArray(data)) return { overrides, stats };

  const wanted = unitName ? normalizeRoomLabel(unitName) : null;
  const perDay = new Map<string, { blocked: Set<string>; minStay: number | null; maxStay: number | null }>();

  for (const row of data as any[]) {
    const label = normalizeRoomLabel(String(row.room_type ?? ''));
    if (wanted && label && label !== wanted) continue;
    stats.rows += 1;
    const day = String(row.date).slice(0, 10);
    const bucket = perDay.get(day) ?? { blocked: new Set<string>(), minStay: null, maxStay: null };
    if (row.is_stop_sell === true || row.available_units === 0) bucket.blocked.add(label || '__all__');
    if (row.minimum_stay != null) bucket.minStay = Math.max(bucket.minStay ?? 0, Number(row.minimum_stay));
    if (row.maximum_stay != null) bucket.maxStay = bucket.maxStay == null ? Number(row.maximum_stay) : Math.min(bucket.maxStay, Number(row.maximum_stay));
    perDay.set(day, bucket);
  }

  for (const [day, bucket] of perDay) {
    const ov: ManualDayOverride = {};
    if (bucket.blocked.size > 0) {
      ov.units = wanted ? 0 : Math.max(0, totalUnits - bucket.blocked.size);
      if (ov.units === 0) stats.stop_sell_days += 1;
    }
    if (bucket.minStay != null && bucket.minStay > 0) { ov.min_stay = bucket.minStay; stats.min_stay_days += 1; }
    if (bucket.maxStay != null && bucket.maxStay > 0) { ov.max_stay = bucket.maxStay; stats.max_stay_days += 1; }
    if (Object.keys(ov).length > 0) { overrides.set(day, ov); stats.days += 1; }
  }

  return { overrides, stats };
}

/**
 * Nights that are sold on ROL'OS. Availability pushed to the channel is otherwise derived only
 * from seasons + manual calendar rows, so a booking that failed to write its manual stop-sell
 * rows would silently leave the unit sellable at the channel. Deriving the closed nights from
 * confirmed/paid bookings makes the outbound payload correct on its own.
 *
 * Returns the set of blocked nights (check-in .. check-out - 1) for this unit, or for the whole
 * property when pushing a building-level listing.
 */
async function loadBookingBlocks(
  supabase: any,
  propertyId: string,
  windowFrom: string,
  windowTo: string,
  unit: { id?: string | null; name?: string | null; linked_rolos_id?: string | null } | null,
): Promise<{ dates: Set<string>; stats: { bookings: number; nights: number; ranges: { from: string; to: string }[] } }> {
  const dates = new Set<string>();
  const ranges: { from: string; to: string }[] = [];
  const stats = { bookings: 0, nights: 0, ranges };

  /* Sold statuses. `pending` counts for everything except a live web checkout cart (see below);
   * an imported/ingested reservation is real occupancy even when
   * it arrives as `pending` — a NightsBridge export carries no ROL confirmation step. Those
   * nights must close upstream or the unit stays double-sellable at the channel. */
  const SOLD_STATUSES = ['confirmed', 'checked_in', 'checked_out', 'completed', 'in_house'];
  const IMPORTED_SOURCES = new Set(['nightsbridge', 'checkfront', 'hostfully', 'external_import']);

  const { data, error } = await supabase
    .from('bookings')
    .select('id, status, payment_status, integration_type, booking_channel, hold_expires_at, hold_released_at, room_type_id, rolos_room_ids, rooms, check_in_date, check_out_date')
    .eq('property_id', propertyId)
    .lt('check_in_date', windowTo)
    .gt('check_out_date', windowFrom)
    .in('status', [...SOLD_STATUSES, 'pending']);

  if (error || !Array.isArray(data)) return { dates, stats };

  /* A pending stay that an operator created (direct / manual / agent) is real occupancy, not a
   * checkout cart — those nights must close upstream too. Web carts only hold the night while
   * their hold is live, so an expired or released hold reopens it. */
  const CART_CHANNELS = new Set(['website', 'embed', 'online', 'rol_itinerary']);
  const holdStillLive = (b: any) => {
    if (b.hold_released_at) return false;
    if (!b.hold_expires_at) return false;
    return new Date(String(b.hold_expires_at)).getTime() > Date.now();
  };

  const sold = (data as any[]).filter((b) => {
    if (SOLD_STATUSES.includes(String(b.status))) return true;
    if (IMPORTED_SOURCES.has(String(b.integration_type ?? ''))) return true;
    const channel = String(b.booking_channel ?? '').toLowerCase();
    if (CART_CHANNELS.has(channel)) return holdStillLive(b);
    // Operator-created or channel-sourced pending stays hold the night.
    return true;
  });


  /* A channel unit and the ROL'OS room that sells it can be linked by id, by the
   * canonical room registry (duplicate/retired twins included) or by name. Missing any
   * of these leaves sold nights open upstream, so all three are accepted. */
  const registry = await loadCanonicalRooms(supabase, propertyId);
  const canonical = unit ? registry.canonicalForUnit(unit) : null;
  const acceptTypeIds = new Set<string>();
  const acceptRoomIds = new Set<string>();
  if (unit) {
    if (unit.linked_rolos_id) acceptTypeIds.add(String(unit.linked_rolos_id));
    if (unit.id) acceptTypeIds.add(String(unit.id));
    if (canonical) {
      for (const id of registry.typeIdsByKey.get(canonical.key) ?? []) acceptTypeIds.add(id);
      for (const [roomId, key] of registry.keyByRoomId) {
        if (key === canonical.key) acceptRoomIds.add(roomId);
      }
    }
  }

  const wanted = unit?.name ? normaliseRoomName(String(unit.name)) : canonical ? normaliseRoomName(canonical.name) : null;

  // Imported bookings (NightsBridge) carry no `rooms` JSON — their unit lives in
  // `rolos_booking_rooms`, so those lines are the fallback for unit matching.
  const bookingIds = sold.map((b) => String(b.id));
  const linesByBooking = new Map<string, { room_id: string | null; room_type_id: string | null }[]>();
  for (let i = 0; i < bookingIds.length; i += 200) {
    const chunk = bookingIds.slice(i, i + 200);
    const { data: lineRows } = await supabase
      .from('rolos_booking_rooms')
      .select('booking_id, room_id, room_type_id')
      .in('booking_id', chunk);
    for (const l of (lineRows ?? []) as any[]) {
      const key = String(l.booking_id);
      linesByBooking.set(key, [...(linesByBooking.get(key) ?? []), { room_id: l.room_id ?? null, room_type_id: l.room_type_id ?? null }]);
    }
  }

  for (const b of sold) {
    const stays: { from: string; to: string }[] = [];
    const rooms = Array.isArray(b.rooms) ? b.rooms : [];

    const matchesUnit = (roomTypeId?: string | null, roomTypeName?: string | null, roomId?: string | null): boolean => {
      if (!unit) return true; // property-level push: any sold room closes a unit
      if (roomTypeId && acceptTypeIds.has(String(roomTypeId))) return true;
      if (roomId && acceptRoomIds.has(String(roomId))) return true;
      if (wanted && roomTypeName && normaliseRoomName(String(roomTypeName)) === wanted) return true;
      return false;
    };

    const bookingRoomIds: string[] = Array.isArray(b.rolos_room_ids) ? b.rolos_room_ids.map(String) : [];
    // The booking row is the truth for placement: room lines are only a fallback
    // for imported stays with no unit, or they resurrect a vacated unit after a move.
    const lines = bookingRoomIds.length > 0 ? [] : (linesByBooking.get(String(b.id)) ?? []);
    const bookingMatches =
      matchesUnit(b.room_type_id, null, null) ||
      bookingRoomIds.some((id) => matchesUnit(null, null, id)) ||
      lines.some((l) => matchesUnit(l.room_type_id, null, l.room_id));

    if (rooms.length > 0) {
      for (const r of rooms) {
        const roomMatches = matchesUnit(
          r?.roomTypeId ?? r?.room_type_id ?? null,
          r?.roomTypeName ?? r?.room_type_name ?? null,
          r?.roomId ?? r?.room_id ?? null,
        );
        if (!roomMatches && !bookingMatches) continue;
        const from = String(r?.checkIn ?? r?.check_in ?? b.check_in_date ?? '').slice(0, 10);
        const to = String(r?.checkOut ?? r?.check_out ?? b.check_out_date ?? '').slice(0, 10);
        if (from && to) stays.push({ from, to });
      }
    } else if (bookingMatches) {
      const from = String(b.check_in_date ?? '').slice(0, 10);
      const to = String(b.check_out_date ?? '').slice(0, 10);
      if (from && to) stays.push({ from, to });
    }

    if (stays.length === 0) continue;
    stats.bookings += 1;

    for (const stay of stays) {
      ranges.push({ from: stay.from, to: stay.to });
      // Nights are [check-in, check-out): the departure day is sellable again.
      for (let d = new Date(stay.from + 'T00:00:00Z'); ; d.setUTCDate(d.getUTCDate() + 1)) {
        const iso = d.toISOString().slice(0, 10);
        if (iso >= stay.to) break;
        if (iso < windowFrom || iso > windowTo) continue;
        dates.add(iso);
      }
    }
  }

  stats.nights = dates.size;
  return { dates, stats };
}



/** Overlay per-date manual overrides onto season-derived entries, then recompress ranges. */
function applyManualOverrides(entries: AvailEntry[], overrides: Map<string, ManualDayOverride>): AvailEntry[] {
  if (overrides.size === 0) return entries;
  const perDay: AvailEntry[] = [];
  for (const e of entries) {
    for (let d = e.date_from; d <= e.date_to; d = isoAddDays(d, 1)) {
      const ov = overrides.get(d);
      perDay.push({
        date_from: d,
        date_to: d,
        units: ov?.units ?? e.units,
        min_stay: ov?.min_stay ?? e.min_stay,
        ...(ov?.max_stay != null ? { max_stay: ov.max_stay } : e.max_stay != null ? { max_stay: e.max_stay } : {}),
        changeover: e.changeover,
      });
    }
  }
  perDay.sort((a, b) => a.date_from.localeCompare(b.date_from));
  const out: AvailEntry[] = [];
  for (const e of perDay) {
    const last = out[out.length - 1];
    if (
      last && last.units === e.units && last.min_stay === e.min_stay &&
      (last.max_stay ?? null) === (e.max_stay ?? null) && last.changeover === e.changeover &&
      isoAddDays(last.date_to, 1) === e.date_from
    ) {
      last.date_to = e.date_to;
    } else {
      out.push({ ...e });
    }
  }
  return out;
}

/**
 * Remove specific dates from availability entries. Entries are ranges when no per-day
 * changeover rules apply, so a reserved day usually sits *inside* a range — filtering by
 * `date_from` alone leaves it in the payload and RU keeps rejecting the whole batch with
 * "We have confirmed reservation for those dates". Split each range around the excluded
 * dates instead.
 */
function excludeDatesFromAvailability(
  entries: { date_from: string; date_to: string; units: number; min_stay: number; changeover: number }[],
  exclude: Set<string>,
): typeof entries {
  if (exclude.size === 0) return entries;
  const out: typeof entries = [];
  for (const entry of entries) {
    let segStart: string | null = null;
    let segEnd: string | null = null;
    const flush = () => {
      if (segStart && segEnd) out.push({ ...entry, date_from: segStart, date_to: segEnd });
      segStart = null;
      segEnd = null;
    };
    const start = new Date(entry.date_from + 'T00:00:00Z');
    const end = new Date(entry.date_to + 'T00:00:00Z');
    for (const d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      const iso = d.toISOString().slice(0, 10);
      if (exclude.has(iso)) {
        flush();
        continue;
      }
      if (!segStart) segStart = iso;
      segEnd = iso;
    }
    flush();
  }
  return out;
}


interface AvailabilityVerification {
  checked: boolean;
  total_days: number;
  matches: number;
  /** Nights sold on ROL'OS that the channel still reports as sellable. */
  booked_days_checked?: number;
  booked_days_open?: string[];
  mismatches: { date: string; field: 'min_stay' | 'changeover' | 'units'; requested: number; returned: number | null }[];

  error?: string;
}

interface PriceVerification {
  checked: boolean;
  total_seasons: number;
  matches: number;
  mismatches: { date_from: string; date_to: string; field: 'price' | 'extra_guest_price' | 'missing'; requested: number | null; returned: number | null }[];
  missing_dates: string[];
  error?: string;
}

/**
 * Rentals United never serves the current day in calendar/price pull responses (the day is
 * already "in progress"), so read-back comparison must start tomorrow. Comparing from today
 * produced a permanent single-day mismatch that stopped runs being marked verified.
 */
function verificationStart(windowFrom: string): string {
  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const iso = tomorrow.toISOString().slice(0, 10);
  return windowFrom > iso ? windowFrom : iso;
}

async function verifyPrices(
  supabase: any,
  ruPropertyId: number,
  requested: { date_from: string; date_to: string; price: number; extra_guest_price?: number }[],
  windowFromRaw: string,
  windowTo: string,
  childAuth: Record<string, unknown> = {},
): Promise<PriceVerification> {
  const windowFrom = verificationStart(windowFromRaw);

  const report: PriceVerification = { checked: false, total_seasons: requested.length, matches: 0, mismatches: [], missing_dates: [] };
  try {
    const attempt = await invokeRuWithRetry(
      supabase,
      { action: 'get_prices', ru_property_id: ruPropertyId, date_from: windowFrom, date_to: windowTo, ...childAuth },
      { label: `get_prices ${ruPropertyId}` },
    );
    const data = attempt.data;
    if (!attempt.ok || !data?.raw_xml) {
      report.error = attempt.message || 'No XML returned';
      return report;
    }
    const xml = String(data.raw_xml);
    const returnedSeasons = parseRuPriceSeasons(xml).filter(
      (season): season is typeof season & { date_from: string; date_to: string } =>
        Boolean(season.date_from && season.date_to),
    );

    report.checked = true;

    // Build per-day price map from returned data
    const returnedPerDay = new Map<string, { price: number | null; extra: number | null }>();
    for (const r of returnedSeasons) {
      const start = new Date(r.date_from + 'T00:00:00Z');
      const end = new Date(r.date_to + 'T00:00:00Z');
      for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
        returnedPerDay.set(d.toISOString().slice(0, 10), { price: r.price, extra: r.extra_guest_price });
      }
    }

    // Diff each requested season against returned per-day prices (sample first day of each
    // season inside the read-back window — seasons that start before `windowFrom` are sampled
    // at the window start, and seasons entirely outside the window are skipped because RU
    // never returns them).
    for (const req of requested) {
      if (req.date_to < windowFrom || req.date_from > windowTo) continue;
      const sampleDay = req.date_from > windowFrom ? req.date_from : windowFrom;
      const got = returnedPerDay.get(sampleDay);
      if (!got) {
        report.mismatches.push({ date_from: req.date_from, date_to: req.date_to, field: 'missing', requested: req.price, returned: null });
        report.missing_dates.push(sampleDay);
        continue;
      }

      let ok = true;
      if (got.price != null && Math.abs(got.price - req.price) > 0.01) {
        report.mismatches.push({ date_from: req.date_from, date_to: req.date_to, field: 'price', requested: req.price, returned: got.price });
        ok = false;
      }
      if (req.extra_guest_price != null && got.extra != null && Math.abs(got.extra - req.extra_guest_price) > 0.01) {
        report.mismatches.push({ date_from: req.date_from, date_to: req.date_to, field: 'extra_guest_price', requested: req.extra_guest_price, returned: got.extra });
        ok = false;
      }
      if (ok) report.matches++;
    }

    // Coverage gap detection: walk window day-by-day, collect dates with no returned price
    const windowStart = new Date(windowFrom + 'T00:00:00Z');
    const windowEnd = new Date(windowTo + 'T00:00:00Z');
    for (let d = new Date(windowStart); d <= windowEnd; d.setUTCDate(d.getUTCDate() + 1)) {
      const iso = d.toISOString().slice(0, 10);
      if (!returnedPerDay.has(iso)) {
        if (!report.missing_dates.includes(iso)) report.missing_dates.push(iso);
      }
    }
  } catch (e) {
    report.error = e instanceof Error ? e.message : 'Unknown verification error';
  }
  return report;
}

async function verifyAvailability(
  supabase: any,
  ruPropertyId: number,
  requested: { date_from: string; date_to: string; units: number; min_stay: number; changeover: number }[],
  windowFromRaw: string,
  windowTo: string,
  childAuth: Record<string, unknown> = {},
  bookedNights: Set<string> = new Set<string>(),
): Promise<AvailabilityVerification> {
  const windowFrom = verificationStart(windowFromRaw);
  const report: AvailabilityVerification = { checked: false, total_days: 0, matches: 0, mismatches: [], booked_days_checked: 0, booked_days_open: [] };

  try {
    const attempt = await invokeRuWithRetry(
      supabase,
      { action: 'get_availability', ru_property_id: ruPropertyId, date_from: windowFrom, date_to: windowTo, ...childAuth },
      { label: `get_availability ${ruPropertyId}` },
    );
    const data = attempt.data;
    if (!attempt.ok || !data?.raw_xml) {
      report.error = attempt.message || 'No XML returned';
      return report;
    }
    // Build expected per-day map from requested ranges, clamped to the read-back window.
    // Pushed periods can start in the past (seasons authored earlier in the year); RU only
    // returns the requested window, so unclamped past dates were counted as "returned: null"
    // mismatches and kept the run from ever being marked verified.
    const expected = new Map<string, { min_stay: number; changeover: number; units: number }>();
    for (const r of requested) {
      const rangeFrom = r.date_from > windowFrom ? r.date_from : windowFrom;
      const rangeTo = r.date_to < windowTo ? r.date_to : windowTo;
      if (rangeFrom > rangeTo) continue;
      const start = new Date(rangeFrom + 'T00:00:00Z');
      const end = new Date(rangeTo + 'T00:00:00Z');
      for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
        const iso = d.toISOString().slice(0, 10);
        expected.set(iso, { min_stay: r.min_stay, changeover: r.changeover, units: r.units });
      }
    }

    // Parse RU's calendar through the shared parser: RU emits
    // <CalDay Date=".." Units="1"><IsBlocked>..</IsBlocked><MinStay>..</MinStay>..</CalDay>,
    // not the self-closing <CalendarDay .../> this used to look for.
    const xml = String(data.raw_xml);
    const parsedDays = parseRuAvailabilityDays(xml);
    const returnedDays = new Map<string, { min_stay: number | null; changeover: number | null; units: number | null; reservations: number | null }>();
    for (const [date, day] of parsedDays) {
      returnedDays.set(date, { min_stay: day.min_stay, changeover: day.changeover, units: day.units, reservations: day.reservations });
    }

    report.checked = true;
    report.total_days = expected.size;
    for (const [date, exp] of expected) {
      const got = returnedDays.get(date);
      if (!got) {
        report.mismatches.push({ date, field: 'units', requested: exp.units, returned: null });
        continue;
      }
      // A day RU already holds a confirmed reservation for legitimately reads back with no
      // free unit — that is correct state, not a sync mismatch.
      if ((got.reservations ?? 0) > 0) { report.matches++; continue; }
      let dayOk = true;
      if (got.min_stay != null && got.min_stay !== exp.min_stay) {
        report.mismatches.push({ date, field: 'min_stay', requested: exp.min_stay, returned: got.min_stay });
        dayOk = false;
      }
      if (got.changeover != null && got.changeover !== exp.changeover) {
        report.mismatches.push({ date, field: 'changeover', requested: exp.changeover, returned: got.changeover });
        dayOk = false;
      }
      if (got.units != null && got.units !== exp.units) {
        report.mismatches.push({ date, field: 'units', requested: exp.units, returned: got.units });
        dayOk = false;
      }
      if (dayOk) report.matches++;
    }

    // Sold nights are asserted explicitly: a 365/365 summary can hide a handful of nights that
    // the channel still sells, which is exactly the failure guests double-book on.
    for (const date of bookedNights) {
      if (date < windowFrom || date > windowTo) continue;
      report.booked_days_checked = (report.booked_days_checked ?? 0) + 1;
      const got = returnedDays.get(date);
      if (!got) continue; // outside the channel's returned window — nothing to assert
      const closed = (got.reservations ?? 0) > 0 || (got.units ?? 0) === 0;
      if (!closed) report.booked_days_open!.push(date);
    }

  } catch (e) {
    report.error = e instanceof Error ? e.message : 'Unknown verification error';
  }
  return report;
}

async function pushARI(supabase: any, ruPropertyId: number, property: PropertyRow, unitUnits: number = 1, unit?: UnitContext, childAuth: Record<string, unknown> = {}, currency?: CurrencyDecision | null) {
  const amenities = (property.amenities || {}) as Record<string, any>;
  const seasons = amenities.seasons as any[] | undefined;
  const seasonRates = amenities.season_rates as Record<string, any> | undefined;
  const result: { availability_reserved_days?: number; availability_pushed?: boolean; prices_pushed?: boolean; availability_error?: string; prices_error?: string; availability_attempts?: number; prices_attempts?: number; prices_payload?: { seasons: number; bytes: number; chunks?: number }; availability_http_status?: number; prices_http_status?: number; availability_verification?: AvailabilityVerification; prices_verification?: PriceVerification; price_coverage_audit?: PriceCoverageResult; prices_year_verified?: boolean; price_coverage?: Record<string, any>; availability_coverage?: Record<string, any>; manual_restrictions?: Record<string, any>; currency?: Record<string, any> } = {};

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const oneYearLater = new Date(today);
  oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);
  const oneYearStr = oneYearLater.toISOString().slice(0, 10);

  const authoredPeriods: AvailabilityPeriod[] = [];
  if (Array.isArray(seasons)) {
    for (const season of seasons) {
      const periods = season.periods || [{ from: season.from, to: season.to }];
      for (const period of periods) {
        if (period.from && period.to) authoredPeriods.push({ from: period.from, to: period.to, minStay: season.minStay || 1, seasonId: String(season.id) });
      }
    }
  }
  authoredPeriods.sort((a, b) => a.from.localeCompare(b.from));

  // RU requires a complete, non-overlapping rolling 365-day window: clamp to [today, +365],
  // resolve overlaps day-by-day and fill every gap (not just the tail after the last season).
  const { periods: allPeriods, coverage: availCoverage } = normalizeAvailabilityWindow(
    authoredPeriods,
    todayStr,
    oneYearStr,
  );
  const expectedWindowDays = Math.round((Date.parse(oneYearStr) - Date.parse(todayStr)) / 86400000) + 1;
  result.availability_coverage = {
    window: { from: todayStr, to: oneYearStr },
    expected_days: expectedWindowDays,
    days_covered: availCoverage.days_total,
    missing_days: Math.max(0, expectedWindowDays - availCoverage.days_total),
    days_from_seasons: availCoverage.days_from_seasons,
    days_filled: availCoverage.days_filled,
    overlaps_resolved: availCoverage.overlaps_resolved,
    summary: `${availCoverage.days_total}/${expectedWindowDays} days covered (${availCoverage.days_from_seasons} from seasons, ${availCoverage.days_filled} filled, ${availCoverage.overlaps_resolved} overlapping day(s) resolved)`,
  };
  console.log(`[pushARI] RU ${ruPropertyId} availability window: ${result.availability_coverage.summary}`);
  if (availCoverage.days_filled > 0) {
    // Filler days carry an assumed min-stay of 1 because RU rejects gaps in the 365-day window.
    // Closing those days would strand inventory, so they publish — but never silently.
    (result as any).availability_warnings = [
      ...(((result as any).availability_warnings as string[]) || []),
      `${availCoverage.days_filled} day(s) had no authored season and were published with an assumed minimum stay of 1 night. Extend the seasons in Rate Manager → Calendar to cover the full 365-day window.`,
    ];
    console.warn(`[pushARI] RU ${ruPropertyId}: ${availCoverage.days_filled} filler day(s) used an assumed min-stay of 1`);
  }


  // Resolve changeover rules (per-day-of-week or default)
  const changeoverConfig = resolveChangeoverRules(unit, amenities);

  // Nights sold on ROL'OS for this target — asserted against the channel read-back below.
  let bookedNights = new Set<string>();




  {
    try {
      let availEntries: AvailEntry[] = expandAvailability(allPeriods, unitUnits, changeoverConfig);
      // Manual dashboard restrictions win over season-derived values.
      const manual = await loadManualRestrictions(supabase, property.id, todayStr, oneYearStr, unit?.name ?? null, unitUnits);
      // Sold nights close inventory even when the manual stop-sell rows are missing.
      const sold = await loadBookingBlocks(supabase, property.id, todayStr, oneYearStr, unit ? { id: unit.id, name: unit.name ?? null, linked_rolos_id: (unit as any).linked_rolos_id ?? null } : null);
      for (const day of sold.dates) {
        const existing = manual.overrides.get(day) ?? {};
        const remaining = unit ? 0 : Math.max(0, Math.min(existing.units ?? unitUnits, unitUnits) - 1);
        manual.overrides.set(day, { ...existing, units: Math.min(existing.units ?? unitUnits, remaining) });
      }
      availEntries = applyManualOverrides(availEntries, manual.overrides);
      result.manual_restrictions = { ...manual.stats, booked_nights: sold.stats.nights, booked_bookings: sold.stats.bookings };
      bookedNights = sold.dates;
      console.log(`[pushARI] Pushing ${availEntries.length} availability entries (per-day rules: ${changeoverConfig.perDow ? 'yes' : 'no'}, default changeover: ${changeoverConfig.defaultCode}, manual override days: ${manual.stats.days}, sold nights: ${sold.stats.nights})`);

      const availMeta = await ariPushMeta(
        'ari_availability',
        ['availability.units', 'availability.changeover', 'availability.min_stay'],
        availEntries,
      );
      const availAttempt = await invokeRuWithRetry(
        supabase,
        { action: 'push_availability', ru_property_id: ruPropertyId, availability: availEntries, ...availMeta, ...childAuth },
        { label: `push_availability ${ruPropertyId}` },
      );
      result.availability_attempts = availAttempt.attempts;
      let availOk = availAttempt.ok;
      let availErrorMessage = availAttempt.message || 'Unknown error';
      if (!availOk && availAttempt.httpStatus) result.availability_http_status = availAttempt.httpStatus;

      // RU rejects the whole batch when any day it holds a confirmed reservation for would be
      // re-opened. Drop exactly those days (they are correctly booked out) and push the rest.
      if (!availOk && /confirmed reservation/i.test(availErrorMessage)) {
        const { data: calData } = await supabase.functions.invoke('rentalsunited-api', {
          body: { action: 'get_availability', ru_property_id: ruPropertyId, date_from: todayStr, date_to: oneYearStr, ...childAuth },
        });
        const reservedDates = new Set<string>();
        for (const [date, day] of parseRuAvailabilityDays(String(calData?.raw_xml ?? ''))) {
          if ((day.reservations ?? 0) > 0) reservedDates.add(date);
        }
        // Reserved days usually sit inside a multi-day range, so the range has to be split —
        // dropping only entries whose start date is reserved leaves the day in the payload.
        const retryEntries = excludeDatesFromAvailability(availEntries, reservedDates);
        result.availability_reserved_days = reservedDates.size;

        if (reservedDates.size > 0 && retryEntries.length > 0) {
          console.log(`[pushARI] Retrying availability without ${reservedDates.size} reserved day(s) for RU ${ruPropertyId}`);
          const retryAttempt = await invokeRuWithRetry(
            supabase,
            {
              action: 'push_availability',
              ru_property_id: ruPropertyId,
              availability: retryEntries,
              ...(await ariPushMeta(
                'ari_availability_reserved_split',
                ['availability.units', 'availability.changeover', 'availability.min_stay'],
                retryEntries,
              )),
              ...childAuth,
            },
            { label: `push_availability(reserved-split) ${ruPropertyId}` },
          );
          result.availability_attempts = (result.availability_attempts ?? 0) + retryAttempt.attempts;
          availOk = retryAttempt.ok;
          availErrorMessage = retryAttempt.message || availErrorMessage;
          if (availOk) {
            availEntries.length = 0;
            availEntries.push(...retryEntries);
          }
        }

      }

      if (!availOk) {
        result.availability_error = availErrorMessage;
      } else {
        result.availability_pushed = true;
        // 6.2 + 6.3 — Verify
        const verification = await verifyAvailability(supabase, ruPropertyId, availEntries, todayStr, oneYearStr, childAuth, bookedNights);
        result.availability_verification = verification;
        const openSold = verification.booked_days_open ?? [];
        console.log(`[pushARI] Verification: ${verification.matches}/${verification.total_days} days matched, ${verification.mismatches.length} mismatches, sold nights still open: ${openSold.length}${verification.error ? ` (error: ${verification.error})` : ''}`);
        if (openSold.length > 0) {
          // The channel accepted the payload but still sells nights we have sold — treat as a
          // failed refresh so the health report and the operator both see it.
          result.availability_error = `RU_SOLD_NIGHTS_STILL_OPEN: ${openSold.length} sold night(s) still sellable at the channel (${openSold.slice(0, 5).join(', ')})`;
        }
        try {
          await supabase.from('sync_logs').insert({
            property_id: property.id,
            external_system: 'rentals_united',
            sync_type: 'availability_verification',
            status: verification.error || openSold.length > 0 ? 'error' : (verification.mismatches.length === 0 ? 'success' : 'partial'),
            message: verification.error
              ? `Verification error: ${verification.error}`
              : `${verification.matches}/${verification.total_days} days matched, ${verification.mismatches.length} mismatches${openSold.length > 0 ? `, ${openSold.length} sold night(s) still open` : ''}`,
            request_data: { ru_property_id: ruPropertyId, unit_id: unit?.id ?? null, entries: availEntries.length, changeover_default: changeoverConfig.defaultCode, per_dow: changeoverConfig.perDow },
            response_data: { verification },
          });
        } catch (logErr) {
          console.warn(`[pushARI] Failed to persist verification log:`, logErr);
        }

      }
    } catch (e) { result.availability_error = e instanceof Error ? e.message : 'Unknown error'; }
  }

  {
    try {
      // Calendar first, rack rate as the fallback for any date the calendar does not price.
      // The resolver is shared with the ROL booking engine and the channel push so all three
      // agree on the price of every night.
      const resolver = await createRateResolver(supabase, property.id, {
        amenities,
        window: { from: todayStr, to: oneYearStr },
        // Channel push prices from plans flagged for distribution.
        audience: "channels",
      });

      const targetUnit: UnitRateContext = unit
        ? { id: unit.id, name: unit.name, linked_rolos_id: unit.linked_rolos_id }
        : (resolver.units.length === 1
            ? resolver.units[0]
            : { id: property.id, name: property.name });

      let dayRates: DayRate[] = resolver.resolveDays(targetUnit, todayStr, oneYearStr);

      // Legacy building-level push (no specific unit and several units): price each day at the
      // lowest unit price so RU never advertises less than the property actually charges.
      if (!unit && resolver.units.length > 1) {
        const perDate = new Map<string, DayRate>();
        for (const u of resolver.units) {
          for (const d of resolver.resolveDays(u, todayStr, oneYearStr)) {
            const existing = perDate.get(d.date);
            if (!existing || d.price < existing.price) perDate.set(d.date, d);
          }
        }
        dayRates = [...perDate.values()];
      }

      // 4a — normalise the window: clamp, de-duplicate by date, surface unpriced nights.
      const norm = normalizePriceWindow(dayRates, todayStr, oneYearStr);
      dayRates = norm.days;

      const compressed = compressToPeriods(dayRates);
      const overlaps = findPeriodOverlaps(compressed);
      const priceEntries = compressed.map((p) => ({
        date_from: p.date_from,
        date_to: p.date_to,
        price: p.price,
        extra_guest_price: p.extra_guest_price,
      }));

      const expectedDays = norm.expected_days;
      const cov = resolver.coverage(dayRates);
      result.price_coverage = {
        ...cov,
        window: { from: todayStr, to: oneYearStr },
        expected_days: expectedDays,
        unpriced_days: norm.unpriced_dates.length,
        unpriced_dates: norm.unpriced_dates.slice(0, 50),
        duplicate_dates_resolved: norm.duplicate_dates_resolved,
        periods: priceEntries.length,
        overlaps: overlaps.slice(0, 20),
        summary: `${describeCoverage(expectedDays, cov)}${norm.unpriced_dates.length > 0 ? `, ${norm.unpriced_dates.length} unpriced` : ''}${norm.duplicate_dates_resolved > 0 ? `, ${norm.duplicate_dates_resolved} duplicate day(s) resolved` : ''}`,
      };
      console.log(`[pushARI] RU ${ruPropertyId} pricing: ${result.price_coverage.summary}`);

      // RU requires real pricing for the full 365-day window. Never push a dummy price — a price
      // of 1 passes RU's schema but fails channel content-quality checks (LekkeSlaap, Booking.com).
      // Partial coverage is equally unacceptable: RU simply blocks the unpriced nights from sale.
      const coverageError = priceEntries.length === 0
        ? 'RU_NO_REAL_RATES: no calendar rate and no rack rate found for the next 365 days — set seasonal rates in the calendar, or a rate plan base rate in Rate Manager → Rates, before pushing (dummy prices are never sent)'
        : norm.unpriced_dates.length > 0
          ? `RU_PRICE_COVERAGE_INCOMPLETE: ${norm.unpriced_dates.length} of ${expectedDays} nights in the next 365 days have no rate (first missing: ${norm.unpriced_dates.slice(0, 5).join(', ')}) — extend the seasonal rates in the admin calendar, or set a rate plan base rate in Rate Manager → Rates, so every night is priced`
          : overlaps.length > 0
            ? `RU_PRICE_RANGES_OVERLAP: outbound price ranges overlap (${overlaps.slice(0, 3).map((o) => `${o.a} ↔ ${o.b}`).join('; ')}) — this is a data fault, not a configuration issue`
            : null;

      if (coverageError) {
        result.prices_error = coverageError;
        console.error(`[pushARI] Aborting price push for RU property ${ruPropertyId}: ${result.prices_error}`);
        try {
          await supabase.from('sync_logs').insert({
            property_id: property.id,
            external_system: 'rentals_united',
            sync_type: 'prices',
            status: 'error',
            message: result.prices_error,
            request_data: { ru_property_id: ruPropertyId, unit_id: unit?.id ?? null, window: { from: todayStr, to: oneYearStr }, coverage: result.price_coverage },
          });
        } catch (logErr) {
          console.warn('[pushARI] Failed to persist no-rates log:', logErr);
        }
        return result;
      }



      // ── Currency: publish in the authored currency when RU holds it, otherwise in the
      // fallback currency at the decided live rate + margin. Never send an unconverted
      // number into a foreign-currency location.
      if (currency?.blocked) {
        result.prices_error = currency.block_reason || 'RU_FX_UNAVAILABLE: currency could not be resolved for this location';
        console.error(`[pushARI] Aborting price push for RU property ${ruPropertyId}: ${result.prices_error}`);
        return result;
      }

      let outboundPrices = priceEntries;
      if (currency?.conversion_in_force && currency.effective_rate) {
        outboundPrices = convertPriceEntries(priceEntries, currency.effective_rate);
        result.currency = {
          published_iso: currency.published_iso,
          authored_iso: currency.authored_iso,
          conversion_in_force: true,
          fx_rate: currency.fx_rate,
          margin_pct: currency.margin_pct,
          effective_rate: currency.effective_rate,
          reason: currency.reason,
        };
        console.log(`[pushARI] RU ${ruPropertyId}: converting ${priceEntries.length} price periods ${currency.authored_iso}→${currency.published_iso} at effective ${currency.effective_rate}`);
      } else if (currency) {
        result.currency = {
          published_iso: currency.published_iso,
          authored_iso: currency.authored_iso,
          conversion_in_force: false,
          fx_rate: null,
          margin_pct: currency.margin_pct,
          effective_rate: null,
          reason: currency.reason,
        };
      }

      // Payload diagnostics: an oversized price batch is the usual cause of a transport-level
      // invoke failure, so record the shape and chunk large batches instead of sending one blob.
      const payloadBytes = JSON.stringify(outboundPrices).length;
      result.prices_payload = { seasons: outboundPrices.length, bytes: payloadBytes };
      console.log(`[pushARI] RU ${ruPropertyId}: price payload ${outboundPrices.length} seasons / ${payloadBytes} bytes`);

      const PRICE_CHUNK = 150;
      const priceChunks: typeof outboundPrices[] = [];
      for (let i = 0; i < outboundPrices.length; i += PRICE_CHUNK) {
        priceChunks.push(outboundPrices.slice(i, i + PRICE_CHUNK));
      }
      let priceAttempt = await invokeRuWithRetry(
        supabase,
        {
          action: 'push_prices',
          ru_property_id: ruPropertyId,
          prices: priceChunks[0] ?? outboundPrices,
          ...(await ariPushMeta('ari_prices', ['prices.season_rates', 'prices.currency'], priceChunks[0] ?? outboundPrices)),
          ...childAuth,
        },
        { label: `push_prices ${ruPropertyId}` },
      );
      result.prices_attempts = priceAttempt.attempts;
      for (let c = 1; c < priceChunks.length && priceAttempt.ok; c++) {
        const next = await invokeRuWithRetry(
          supabase,
          {
            action: 'push_prices',
            ru_property_id: ruPropertyId,
            prices: priceChunks[c],
            ...(await ariPushMeta('ari_prices_chunk', ['prices.season_rates', 'prices.currency'], priceChunks[c])),
            ...childAuth,
          },
          { label: `push_prices ${ruPropertyId} chunk ${c + 1}` },
        );
        result.prices_attempts = (result.prices_attempts ?? 0) + next.attempts;
        if (!next.ok) priceAttempt = next;
      }
      if (priceChunks.length > 1) result.prices_payload.chunks = priceChunks.length;



      if (!priceAttempt.ok) {
        // A transport-level failure ("failed to send a request", worker shutdown) can happen AFTER
        // the channel already accepted the push. Read the calendar back before declaring failure so
        // a runtime hiccup does not report a false negative.
        const transport = !priceAttempt.httpStatus || priceAttempt.httpStatus >= 500;
        let recovered = false;
        if (transport) {
          try {
            const check = await verifyPrices(supabase, ruPropertyId, outboundPrices, todayStr, oneYearStr, childAuth);
            if (!check.error && check.mismatches.length === 0 && check.missing_dates.length === 0 && check.matches > 0) {
              recovered = true;
              result.prices_pushed = true;
              result.prices_verification = check;
              console.log(`[pushARI] RU ${ruPropertyId}: prices confirmed at the channel despite transport error — treating as pushed`);
            }
          } catch (_e) { /* fall through to the reported failure */ }
        }
        if (!recovered) {
          result.prices_error = priceAttempt.message || 'Unknown error';
          if (priceAttempt.httpStatus) result.prices_http_status = priceAttempt.httpStatus;
        }

      } else {
        result.prices_pushed = true;
        // 7.2 — Verify prices post-push
        const priceVerification = await verifyPrices(supabase, ruPropertyId, outboundPrices, todayStr, oneYearStr, childAuth);
        result.prices_verification = priceVerification;
        console.log(`[pushARI] Price verification: ${priceVerification.matches}/${priceVerification.total_seasons} seasons matched, ${priceVerification.mismatches.length} mismatches, ${priceVerification.missing_dates.length} missing dates${priceVerification.error ? ` (error: ${priceVerification.error})` : ''}`);

        // Independent coverage audit: derive the answer from the channel's own stored prices for the
        // next year, not from the seasons we just sent. A read that could not be performed stays
        // `unverified` instead of quietly passing.
        try {
          const coverage = await auditChannelPriceCoverage(supabase, {
            propertyId: property.id,
            ruPropertyId,
            unitName: unit?.name ?? null,
            roomTypeId: unit?.id ?? null,
            childAuth,
          });
          result.price_coverage_audit = coverage;
          result.prices_year_verified = coverage.verdict === 'verified';
          await persistPriceCoverage(supabase, coverage, { details: { trigger: 'post_push' } });
          console.log(`[pushARI] Price coverage audit RU ${ruPropertyId}: ${coverage.verdict} (${coverage.channel_priced_days}/${coverage.expected_days} nights priced at the channel)`);
        } catch (coverageErr) {
          console.warn('[pushARI] Price coverage audit failed:', coverageErr);
        }

        try {
          await supabase.from('sync_logs').insert({
            property_id: property.id,
            external_system: 'rentals_united',
            sync_type: 'prices_verification',
            status: priceVerification.error ? 'error' : (priceVerification.mismatches.length === 0 && priceVerification.missing_dates.length === 0 ? 'success' : 'partial'),
            message: priceVerification.error
              ? `Price verification error: ${priceVerification.error}`
              : `${priceVerification.matches}/${priceVerification.total_seasons} seasons matched, ${priceVerification.mismatches.length} mismatches, ${priceVerification.missing_dates.length} missing dates (${result.price_coverage?.summary ?? 'coverage unknown'})`,
            request_data: { ru_property_id: ruPropertyId, unit_id: unit?.id ?? null, seasons: priceEntries.length, sample: priceEntries.slice(0, 3), rate_coverage: result.price_coverage ?? null },
            response_data: { verification: { ...priceVerification, missing_dates: priceVerification.missing_dates.slice(0, 50) } },

          });
        } catch (logErr) {
          console.warn(`[pushARI] Failed to persist price verification log:`, logErr);
        }
      }
    } catch (e) { result.prices_error = e instanceof Error ? e.message : 'Unknown error'; }
  }

  return result;
}

// ── Discount Push Helper ─────────────────────────────────────
// Tiers are resolved by the shared ladder resolver (_shared/ruDiscounts.ts) so
// the certification suite pushes exactly what production pushes.

async function verifyDiscounts(
  supabase: any,
  ruPropertyId: number,
  longStayRequested: RuDiscountWire[],
  lastMinuteRequested: RuDiscountWire[],
  childAuth: Record<string, unknown> = {},
): Promise<{ long_stay: any; last_minute: any }> {
  const report: { long_stay: any; last_minute: any } = { long_stay: null, last_minute: null };

  const pull = async (
    action: 'get_long_stay_discounts' | 'get_last_minute_discounts',
    element: 'LongStay' | 'LastMinute',
    requested: RuDiscountWire[],
  ) => {
    try {
      const { data, error } = await supabase.functions.invoke('rentalsunited-api', {
        body: { action, ru_property_id: ruPropertyId, ...childAuth },
      });
      if (error || !data?.success) {
        return {
          error: error?.message || data?.error?.message || 'pull failed',
          requested: requested.length,
          returned: 0,
          matches: 0,
          mismatches: [],
        };
      }
      return diffRuDiscountEcho(data.raw_xml || '', element, requested);
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e), requested: requested.length };
    }
  };

  report.long_stay = await pull('get_long_stay_discounts', 'LongStay', longStayRequested);
  report.last_minute = await pull('get_last_minute_discounts', 'LastMinute', lastMinuteRequested);
  return report;
}

async function pushDiscounts(
  supabase: any,
  propertyId: string,
  ruPropertyIds: { ruId: number; roomTypeId?: string }[],
  childAuth: Record<string, unknown> = {},
) {
  const result: {
    long_stay_discounts_pushed: number;
    last_minute_discounts_pushed: number;
    discount_errors: string[];
    discount_warnings: string[];
    discounts_unmapped: Array<{ id: string; name: string; reason: string }>;
    discounts_skipped: boolean;
    discounts_verification: Record<string, any>;
  } = {
    long_stay_discounts_pushed: 0,
    last_minute_discounts_pushed: 0,
    discount_errors: [],
    discount_warnings: [],
    discounts_unmapped: [],
    discounts_skipped: false,
    discounts_verification: {},
  };

  // Property-wide ladder — used to detect the "nothing configured" case.
  const overall = await resolveRuDiscounts(supabase, propertyId);
  result.discount_warnings.push(...overall.warnings);
  result.discounts_unmapped = overall.unmapped;

  if (overall.longStay.length === 0 && overall.lastMinute.length === 0) {
    result.discounts_skipped = true;
    console.log(`[push-property-to-ru] No active discount rules for property ${propertyId} — skipping RU discount endpoints`);
    try {
      await supabase.from('sync_logs').insert({
        property_id: propertyId,
        sync_type: 'discounts_verification',
        status: 'skipped',
        message: 'No active discount rules configured; skipped Push_PutLongStayDiscounts_RQ and Push_PutLastMinuteDiscounts_RQ',
        metadata: {
          ru_property_ids: ruPropertyIds.map(r => r.ruId),
          unmapped: overall.unmapped,
          warnings: overall.warnings,
        },
      });
    } catch (logErr) {
      console.warn(`[push-property-to-ru] Failed to log discount-skip:`, logErr);
    }
    return result;
  }

  console.log(
    `[push-property-to-ru] Discounts for ${propertyId}: ${describeTierSources(overall.longStay)} long stay, ${describeTierSources(overall.lastMinute)} last minute`,
  );

  for (const { ruId, roomTypeId } of ruPropertyIds) {
    if (ruId <= 0) continue;

    // Per-unit resolution so room-scoped specials only reach their own RU unit.
    const ladder = await resolveRuDiscounts(supabase, propertyId, { roomTypeId: roomTypeId ?? null });
    const validation = validateRuLadder(ladder);
    if (!validation.ok) result.discount_errors.push(...validation.errors.map(e => `RU ${ruId}: ${e}`));

    const lsWire = longStayToWire(ladder.longStay);
    const lmWire = lastMinuteToWire(ladder.lastMinute);

    // 8.1 — Push long stay
    if (lsWire.length > 0 && validation.ok) {
      try {
        const { data: lsResult, error: lsErr } = await supabase.functions.invoke('rentalsunited-api', {
          body: { action: 'push_long_stay_discounts', ru_property_id: ruId, discounts: lsWire, ...childAuth },
        });
        if (lsErr || !lsResult?.success) {
          result.discount_errors.push(`Long stay (RU ${ruId}): ${lsErr?.message || lsResult?.error?.message || 'Unknown error'}`);
        } else {
          result.long_stay_discounts_pushed += lsWire.length;
          console.log(`[push-property-to-ru] Pushed ${lsWire.length} long stay discounts to RU ${ruId}`);
        }
      } catch (e) {
        result.discount_errors.push(`Long stay (RU ${ruId}): ${e instanceof Error ? e.message : 'Unknown'}`);
      }
    }

    // 8.2 — Push last minute
    if (lmWire.length > 0 && validation.ok) {
      try {
        const { data: lmResult, error: lmErr } = await supabase.functions.invoke('rentalsunited-api', {
          body: { action: 'push_last_minute_discounts', ru_property_id: ruId, discounts: lmWire, ...childAuth },
        });
        if (lmErr || !lmResult?.success) {
          result.discount_errors.push(`Last minute (RU ${ruId}): ${lmErr?.message || lmResult?.error?.message || 'Unknown error'}`);
        } else {
          result.last_minute_discounts_pushed += lmWire.length;
          console.log(`[push-property-to-ru] Pushed ${lmWire.length} last minute discounts to RU ${ruId}`);
        }
      } catch (e) {
        result.discount_errors.push(`Last minute (RU ${ruId}): ${e instanceof Error ? e.message : 'Unknown'}`);
      }
    }

    // Verify (8.x) — diff requested vs returned
    const verification = await verifyDiscounts(supabase, ruId, lsWire, lmWire, childAuth);
    result.discounts_verification[`ru_${ruId}`] = verification;
    console.log(`[push-property-to-ru] Discount verification RU ${ruId}: long_stay matches=${verification.long_stay?.matches ?? 'n/a'}, last_minute matches=${verification.last_minute?.matches ?? 'n/a'}`);

    try {
      await supabase.from('sync_logs').insert({
        property_id: propertyId,
        sync_type: 'discounts_verification',
        status: result.discount_errors.length === 0 ? 'success' : 'partial',
        message: `RU ${ruId}: long_stay ${verification.long_stay?.matches ?? 0}/${lsWire.length}, last_minute ${verification.last_minute?.matches ?? 0}/${lmWire.length}`,
        metadata: {
          ru_property_id: ruId,
          requested: { long_stay: ladder.longStay, last_minute: ladder.lastMinute },
          verification,
          warnings: ladder.warnings,
          unmapped: ladder.unmapped,
          errors: result.discount_errors,
        },
      });
    } catch (logErr) {
      console.warn(`[push-property-to-ru] Failed to persist discount verification log:`, logErr);
    }
  }

  return result;
}

// ── Main Handler ─────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  /** Start of this run — bounds the exchange-log linkage written to ru_sync_runs. */
  const runStartedAtIso = new Date().toISOString();

  try {
    const reqBody = await req.json();
    const { property_id, dry_run, subscribe_rlnm, standalone_units, only_unit_ids, action, batch_size, batch_id: incomingBatchId } = reqBody;
    /**
     * Building containers are OPT-IN only.
     * Every RU push used to run the building flow (Push_PutBuilding_RQ) first, and RU created a
     * brand-new building on each call instead of updating ours — 20+ duplicate "Tidal Pools"
     * buildings in the WL portal. Units are pushed as standalone RU properties, so the container
     * is unnecessary: only an explicit `use_building: true` request may touch building inventory.
     */
    const useBuilding = reqBody.use_building === true;
    /** Admin override: allows a live push even when mandatory WL checks fail. */
    const forcePush = reqBody.force === true;
    /**
     * The force override bypasses both compliance gates, so it is not something a plain
     * client may ask for: it requires a caller JWT that resolves to admin / dev /
     * fearless_leader. Internal server-to-server callers never set `force`.
     */
    let forceActorId: string | null = null;
    if (forcePush) {
      const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
      if (jwt) {
        try {
          const { data: userData } = await supabase.auth.getUser(jwt);
          forceActorId = userData?.user?.id ?? null;
        } catch (_e) { forceActorId = null; }
      }
      let permitted = false;
      if (forceActorId) {
        for (const role of ['admin', 'dev', 'fearless_leader']) {
          const { data: hasRole } = await supabase.rpc('has_role', { _user_id: forceActorId, _role: role });
          if (hasRole === true) { permitted = true; break; }
        }
      }
      if (!permitted) {
        console.warn(`[push-property-to-ru] FORCE_NOT_PERMITTED for property ${reqBody.property_id} (actor=${forceActorId ?? 'anonymous'})`);
        return new Response(
          JSON.stringify({
            success: false,
            error: {
              code: 'FORCE_NOT_PERMITTED',
              message: 'Overriding the channel readiness gate requires an admin, developer or fearless leader account.',
            },
          }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
    }

    /**
     * Static content delta (Push_PutProperty_RQ only).
     * RU requires static content to be re-pushed whenever it changes in the PMS, not just on
     * the weekly cron. A delta must not re-push availability/prices/discounts as well: those
     * have their own event-driven path (`refresh_ari`) and re-sending them burns the owner's
     * sliding-minute write window for no reason.
     */
    const staticOnly = action === 'static_only';
    /** ARI is pushed on every path except a static-content delta. */
    const pushARIUnlessStatic = async (...args: Parameters<typeof pushARI>): Promise<Record<string, any>> =>
      staticOnly ? {} : await pushARI(...args);
    const pushDiscountsUnlessStatic = async (...args: Parameters<typeof pushDiscounts>): Promise<Record<string, any>> =>
      staticOnly ? {} : await pushDiscounts(...args);

    const forceLocationIdRaw = reqBody.force_location_id;


    const forceLocationId = Number.isFinite(Number(forceLocationIdRaw)) && Number(forceLocationIdRaw) > 1
      ? Number(forceLocationIdRaw)
      : null;

    // ── Seed: pull RU's master list of cities + currencies into public.ru_locations ──
    // One-shot (or periodic) cache primer. Without this, name lookups can't be country-scoped
    // and we can't detect when an RU LocationID is configured to the wrong currency.
    // ── Refresh RU location currency cache (all locations, any country) ──
    // The empty ru_locations cache is what let currency drift go undetected. This is the
    // scheduled/manual refresh that keeps the authoritative location currency current.
    if (action === 'refresh_ru_location_currencies') {
      const res = await refreshRuLocationsCache(supabase);
      if (!res.success) {
        return new Response(
          JSON.stringify({ success: false, error: { code: 'REFRESH_FAILED', message: res.error }, upserted: res.upserted }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      // Refresh the ZAR→USD reference rate at the same time so the fallback is always warm.
      const fx = await getFxRate(supabase, 'ZAR', 'USD');
      return new Response(
        JSON.stringify({
          success: true,
          upserted: res.upserted,
          fx: fx.rate != null
            ? { base: 'ZAR', quote: 'USD', rate: fx.rate, margin_pct: FX_MARGIN_PCT, effective_rate: applyMargin(fx.rate), fetched_at: (fx as any).fetched_at }
            : { error: (fx as any).error },
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── Currency status for one or more properties (read-only, no RU writes) ──
    if (action === 'currency_status') {
      const ids: string[] = Array.isArray(reqBody.property_ids)
        ? reqBody.property_ids
        : (reqBody.property_id ? [reqBody.property_id] : []);
      const states = await Promise.all(ids.map(async (id) => ({ property_id: id, state: await loadCurrencyState(supabase, id) })));
      const fx = await getFxRate(supabase, 'ZAR', 'USD');
      return new Response(
        JSON.stringify({
          success: true,
          states,
          fx: fx.rate != null
            ? { base: 'ZAR', quote: 'USD', rate: fx.rate, margin_pct: FX_MARGIN_PCT, effective_rate: applyMargin(fx.rate), fetched_at: (fx as any).fetched_at }
            : { error: (fx as any).error },
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'seed_ru_locations') {
      const filter: string[] = Array.isArray(reqBody.countries) && reqBody.countries.length
        ? reqBody.countries.map((s: any) => String(s).trim().toUpperCase())
        : ['SOUTH AFRICA', 'ZA', 'NAMIBIA', 'NA', 'BOTSWANA', 'BW'];
      console.log(`[push-property-to-ru] seed_ru_locations — country filter:`, filter);

      const { data: listData, error: listErr } = await supabase.functions.invoke('rentalsunited-api', {
        body: { action: 'list_cities_and_currencies' },
      });
      if (listErr || !listData?.success) {
        return new Response(
          JSON.stringify({ success: false, error: { code: 'LIST_FAILED', message: listErr?.message || listData?.error?.message || 'Failed to list cities' } }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const all: any[] = listData.locations || [];
      // RU's Pull_ListCitiesProps_RQ doesn't return country names directly — it returns parent
      // location IDs. For our southern-Africa scope we infer country from currency:
      //   ZAR → South Africa, NAD → Namibia, BWP → Botswana.
      const ISO_TO_COUNTRY: Record<string, string> = { ZAR: 'South Africa', NAD: 'Namibia', BWP: 'Botswana' };
      const wantedIsos = new Set(filter.flatMap(f => {
        if (f === 'SOUTH AFRICA' || f === 'ZA' || f === 'RSA') return ['ZAR'];
        if (f === 'NAMIBIA' || f === 'NA') return ['NAD'];
        if (f === 'BOTSWANA' || f === 'BW') return ['BWP'];
        return [];
      }));

      const rows = all
        .filter((l) => l.currency_iso && (wantedIsos.size === 0 || wantedIsos.has(l.currency_iso)))
        .map((l) => ({
          id: l.id,
          name: l.name || `Location ${l.id}`,
          country: ISO_TO_COUNTRY[l.currency_iso] || l.currency_iso,
          currency_iso: l.currency_iso,
          currency_ru_id: ({ ZAR: 48, USD: 144, EUR: 47, GBP: 49, NAD: 91, BWP: 24 } as Record<string, number>)[l.currency_iso] || null,
          last_synced_at: new Date().toISOString(),
        }));

      // Upsert in chunks of 500 to avoid payload limits.
      let upserted = 0;
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500);
        const { error: upErr } = await supabase.from('ru_locations').upsert(chunk, { onConflict: 'id' });
        if (upErr) {
          console.error(`[push-property-to-ru] seed_ru_locations upsert failed at offset ${i}:`, upErr.message);
          return new Response(
            JSON.stringify({ success: false, error: { code: 'UPSERT_FAILED', message: upErr.message }, upserted }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        upserted += chunk.length;
      }

      return new Response(
        JSON.stringify({ success: true, message: `Seeded ${upserted} RU locations`, total_returned_by_ru: all.length, upserted }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── Seed: pull RU's FULL location tree (Pull_ListLocations_RQ) into public.ru_locations ──
    // This is the authoritative LocationID register the ROLOS location picker reads. Every
    // location keeps its parent + type so we can present a readable path
    // ("South Africa › Western Cape › Cape Town") and push the exact ID the admin chose.
    // Currency values already cached from the city/currency dictionary are preserved.
    if (action === 'seed_ru_location_tree') {
      let { data: listData, error: listErr } = await supabase.functions.invoke('rentalsunited-api', {
        body: { action: 'list_locations' },
      });
      let sourceAction = 'list_locations';

      // Fallback: many RU integrations do not have Pull_ListLocations_RQ enabled. The
      // city/currency dictionary carries the same LocationIDs (plus currency), so use it
      // to populate the register rather than failing the refresh outright.
      const treeUnusable = !!listErr || !listData?.success || listData?.endpoint_disabled ||
        !(Array.isArray(listData?.locations) && listData.locations.length > 0);
      if (treeUnusable) {
        console.log(`[push-property-to-ru] seed: list_locations unusable (${listErr?.message || listData?.error?.message || 'empty'}) — falling back to list_cities_and_currencies`);
        const fallback = await supabase.functions.invoke('rentalsunited-api', {
          body: { action: 'list_cities_and_currencies' },
        });
        if (!fallback.error && fallback.data?.success && Array.isArray(fallback.data.locations) && fallback.data.locations.length > 0) {
          listData = {
            success: true,
            locations: fallback.data.locations.map((l: any) => ({
              id: l.id,
              name: l.name,
              parent_id: l.parent_id ?? null,
              location_type_id: l.type ?? l.location_type_id ?? null,
              currency_iso: l.currency_iso ?? null,
            })),
          };
          listErr = null;
          sourceAction = 'list_cities_and_currencies';
        }
      }

      if (listErr || !listData?.success) {
        // Return 200 so supabase.functions.invoke surfaces the real RU status/message
        // instead of collapsing everything into "non-2xx status code".
        return new Response(
          JSON.stringify({
            success: false,
            error: {
              code: 'LIST_FAILED',
              message: listErr?.message || listData?.error?.message || 'Failed to list RU locations',
              ru_status_id: listData?.error?.ru_status_id,
            },
            diagnostics: listData?.diagnostics,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (listData.endpoint_disabled || !(Array.isArray(listData.locations) && listData.locations.length > 0)) {
        return new Response(
          JSON.stringify({
            success: true,
            upserted: 0,
            endpoint_disabled: true,
            note: listData.note || 'Rentals United returned no locations for this integration — LocationIDs stay name-resolved at push time.',
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      console.log(`[push-property-to-ru] seed: using ${sourceAction} (${listData.locations.length} locations)`);


      type RuLoc = { id: number; name: string; parent_id: number | null; location_type_id: number | null; currency_iso?: string | null };
      const all: RuLoc[] = (listData.locations || []).filter((l: any) => Number.isFinite(l?.id));
      const byId = new Map<number, RuLoc>(all.map((l) => [l.id, l]));

      // Build the readable path + depth by walking parents (guarded against cycles).
      const pathCache = new Map<number, { path: string; depth: number; country: string }>();
      const resolvePath = (loc: RuLoc): { path: string; depth: number; country: string } => {
        const cached = pathCache.get(loc.id);
        if (cached) return cached;
        const chain: string[] = [];
        let cursor: RuLoc | undefined = loc;
        const seen = new Set<number>();
        while (cursor && !seen.has(cursor.id) && chain.length < 12) {
          seen.add(cursor.id);
          chain.unshift(cursor.name);
          cursor = cursor.parent_id ? byId.get(cursor.parent_id) : undefined;
        }
        const result = { path: chain.join(' › '), depth: chain.length, country: chain[0] || loc.name };
        pathCache.set(loc.id, result);
        return result;
      };

      const now = new Date().toISOString();
      const rows = all.map((l) => {
        const { path, depth, country } = resolvePath(l);
        return {
          id: l.id,
          name: l.name,
          parent_id: l.parent_id,
          location_type_id: l.location_type_id,
          path,
          depth,
          country,
          ...(l.currency_iso ? { currency_iso: l.currency_iso } : {}),
          last_synced_at: now,
        };
      });

      let upserted = 0;
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500);
        const { error: upErr } = await supabase.from('ru_locations').upsert(chunk, { onConflict: 'id' });
        if (upErr) {
          console.error(`[push-property-to-ru] seed_ru_location_tree upsert failed at offset ${i}:`, upErr.message);
          return new Response(
            JSON.stringify({ success: false, error: { code: 'UPSERT_FAILED', message: upErr.message }, upserted }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        upserted += chunk.length;
      }

      return new Response(
        JSON.stringify({ success: true, message: `Seeded ${upserted} RU locations via ${sourceAction}`, upserted, source: sourceAction }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    }


    // ── Reconcile: fix RU location currency, then re-push affected properties ──
    // Implements the location-owns-currency rule: RU stores currency on the LocationID
    // (not on the property). Steps per property:
    //   (a) resolve the correct LocationID (coords → name → cached → country default)
    //   (b) compare ru_locations.currency_iso to the property's expected ISO
    //   (c) if mismatched → Push_ChangeCurrency_RQ to flip the location
    //   (d) re-push the property so the new currency takes effect on the property record
    // Read-back only: ask RU what currency it actually holds for each listing, as the
    // owning sub-user. No pushes, no flips — this is how we prove a flip landed instead
    // of trusting our own cache (which is what previously reported green while RU sat on USD).
    if (action === 'verify_ru_currency') {
      const targetIds: string[] | undefined = Array.isArray(reqBody.property_ids) ? reqBody.property_ids : undefined;
      // Multi-unit listings live on the UNITS, not the parent property, so a property-level
      // RU ID filter alone silently skipped every ROL'OS multi-unit property.
      const { data: unitOwners } = await supabase
        .from('hostfully_room_types')
        .select('property_id')
        .not('rentalsunited_property_id', 'is', null);
      const unitPropertyIds = Array.from(
        new Set(((unitOwners ?? []) as any[]).map((u) => u.property_id).filter(Boolean)),
      ) as string[];

      const propSelect = 'id, name, owner_email, country, amenities, ru_location_id, rentalsunited_property_id, rentalsunited_building_id';
      const [{ data: propLevel, error: propLevelError }, { data: unitLevel, error: unitLevelError }] = await Promise.all([
        supabase.from('properties').select(propSelect)
          .or('rentalsunited_property_id.not.is.null,rentalsunited_building_id.not.is.null'),
        unitPropertyIds.length
          ? supabase.from('properties').select(propSelect).in('id', unitPropertyIds)
          : Promise.resolve({ data: [], error: null } as any),
      ]);
      if (propLevelError || unitLevelError) {
        console.error('[push-property-to-ru] verify_ru_currency target lookup failed', propLevelError ?? unitLevelError);
      }
      const propsById = new Map<string, any>();
      for (const p of [...((propLevel ?? []) as any[]), ...((unitLevel ?? []) as any[])]) propsById.set(p.id, p);
      const props = Array.from(propsById.values());

      const targets = (props ?? []).filter((p: any) => !targetIds || targetIds.includes(p.id));

      const results: any[] = [];

      for (const p of targets as any[]) {
        const phase = await evaluatePhases(supabase, p as any, { readinessGaps: [] });
        const ownerId = phase.ru_owner_id;
        const { account } = await findOwnerAccount(supabase, p.id, p.owner_email, phase.portfolio_id);
        const decrypt = async (enc: unknown): Promise<string> => {
          if (!enc) return '';
          const { data } = await supabase.rpc('decrypt_sensitive_text', { encrypted_data: enc });
          const plain = typeof data === 'string' ? data : '';
          return plain && plain !== '[ENCRYPTED]' && plain !== '[DECRYPTION_ERROR]' ? plain : '';
        };
        let accessKey = '';
        let secretKey = '';
        const { data: credRow } = await supabase
          .from('ru_api_credentials')
          .select('access_key, secret_enc')
          .eq('ru_owner_id', String(ownerId))
          .maybeSingle();
        if (credRow?.access_key) {
          const plain = await decrypt(credRow.secret_enc);
          if (plain) { accessKey = String(credRow.access_key); secretKey = plain; }
        }
        const childAuth: Record<string, unknown> = accessKey && secretKey
          ? { owner_id: ownerId, auth_access_key: accessKey, auth_secret_key: secretKey }
          : { owner_id: ownerId, auth_username: account?.ru_login_email?.trim() ?? '', auth_password: await decrypt(account?.ru_login_password_enc) };

        // Every listing matters: a portfolio's units can sit on different RU accounts and
        // locations, so verify each RUID rather than extrapolating from one.
        const ruIds: number[] = [];
        const notes: string[] = [];
        const propRuId = parseInt(p.rentalsunited_property_id || '0', 10);
        // Guard: some properties have the RU OwnerID pasted into the listing-ID column.
        // Verifying it asks RU for a property that cannot exist and reports a false
        // "RU disagrees" for a property whose real unit listings are perfectly fine.
        if (propRuId > 0 && ownerId && propRuId === Number(ownerId)) {
          notes.push(`Ignored property-level RU ID ${propRuId} — that is the RU OwnerID, not a listing ID.`);
          console.warn(`[push-property-to-ru] ${p.name}: property-level RU ID equals OwnerID ${ownerId} — ignored for verification`);
        } else if (propRuId > 0) {
          ruIds.push(propRuId);
        }
        const { data: units } = await supabase
          .from('hostfully_room_types')
          .select('name, rentalsunited_property_id')
          .eq('property_id', p.id)
          .not('rentalsunited_property_id', 'is', null);
        for (const u of (units ?? []) as any[]) {
          const id = parseInt(u.rentalsunited_property_id || '0', 10);
          if (id > 0 && !ruIds.includes(id)) ruIds.push(id);
        }
        if (ruIds.length === 0) {
          results.push({ property_id: p.id, name: p.name, success: false, reason: 'no_ru_listing_id', notes });
          continue;
        }


        const state = await loadCurrencyState(supabase, p.id);
        const expectedIso = state?.published_currency_iso ?? state?.authored_currency_iso ?? 'ZAR';
        const locId = Number(p.ru_location_id) || Number(state?.ru_location_id) || 0;
        const listings: any[] = [];
        let primaryVerification: { ru_reported_iso: string | null; matches: boolean; persisted: boolean; error?: string } | null = null;

        for (const ruId of ruIds) {
          const readback = await verifyRuPropertyCurrency(supabase, ruId, childAuth);
          let onMaster = false;
          let iso = readback.iso;
          let err = readback.error ?? null;
          // "Property does not exist" on the sub-user means the listing was created on the
          // master account and never migrated — the account, not the currency, is the fault.
          if (!iso && /does not exist/i.test(String(err ?? ''))) {
            const masterRead = await verifyRuPropertyCurrency(supabase, ruId, {});
            if (masterRead.iso) {
              onMaster = true;
              iso = masterRead.iso;
              err = 'RU_LISTING_ON_MASTER_ACCOUNT';
            }
          }
          listings.push({
            ru_property_id: ruId,
            ru_reported_iso: iso ?? null,
            on_master_account: onMaster,
            deferred: !iso && readback.deferred === true,
            matches: !!iso && iso.toUpperCase() === expectedIso.toUpperCase(),
            error: err,
          });

          await new Promise(r => setTimeout(r, 400));
        }

        // Persist only after considering the complete listing set. A property-level verdict
        // must not depend on listing order or account placement: if every successful read-back
        // agrees with the intended ISO, one of those answers is sufficient durable evidence.
        const answered = listings.filter((l) => !!l.ru_reported_iso);
        const agreed = answered.length > 0 && answered.every((l) => l.matches);
        let persistenceError: string | null = null;
        let gatePassed = false;
        let usedExistingVerdict = false;
        if (agreed) {
          const evidence = answered[0];
          try {
            primaryVerification = await verifyAndRecordCurrency(supabase, {
              propertyId: p.id,
              locationId: locId,
              authoredIso: state?.authored_currency_iso ?? expectedIso,
              ruPropertyId: evidence.ru_property_id,
              childAuth,
              ownerScope: String(ownerId),
              decision: null,
              knownIso: evidence.ru_reported_iso,
            });
            const durableState = await loadCurrencyState(supabase, p.id);
            const durableMatch = !!durableState?.verified_at
              && String(durableState.ru_reported_currency_iso ?? '').toUpperCase() === expectedIso.toUpperCase()
              && String(durableState.published_currency_iso ?? '').toUpperCase() === expectedIso.toUpperCase();
            if (!primaryVerification.persisted || !durableMatch) {
              throw new Error('Currency state could not be confirmed after persistence');
            }
            await writeLedgerRows(supabase, p.id, [{
              step_key: 'currency',
              status: 'passed',
              source: 'channel_probe',
              blocker_summary: null,
              details: {
                published_currency_iso: expectedIso.toUpperCase(),
                ru_reported_currency_iso: String(evidence.ru_reported_iso).toUpperCase(),
                verified_ru_property_id: evidence.ru_property_id,
              },
            }]);
            gatePassed = true;
          } catch (error) {
            persistenceError = error instanceof Error ? error.message : 'Currency verdict persistence failed';
            console.error(`[push-property-to-ru] currency verdict persistence failed for ${p.id}:`, persistenceError);
          }
        } else if (
          answered.length === 0
          && state?.verified_at
          && String(state.ru_reported_currency_iso ?? '').toUpperCase() === expectedIso.toUpperCase()
          && String(state.published_currency_iso ?? '').toUpperCase() === expectedIso.toUpperCase()
        ) {
          // RU sometimes returns an empty currency payload (rather than its explicit deferred
          // marker) for an identical read inside the sliding minute. Never downgrade a durable,
          // matching verdict because the immediate repeat supplied no new evidence.
          primaryVerification = {
            ru_reported_iso: String(state.ru_reported_currency_iso).toUpperCase(),
            matches: true,
            persisted: true,
          };
          gatePassed = true;
          usedExistingVerdict = true;
        }

        const strays = listings.filter(l => l.on_master_account);
        const stale = listings.filter(l => !l.ru_reported_iso && /does not exist/i.test(String(l.error ?? '')));
        const transport = listings.filter(l => !l.ru_reported_iso && /failed to send a request|fetch failed|timeout/i.test(String(l.error ?? '')));
        const deferred = listings.filter(l => l.deferred);
        const allDeferred = listings.length > 0 && deferred.length === listings.length;
        const reason = persistenceError
          ? persistenceError
          : strays.length
          ? `${strays.length} listing(s) still live on the master Rentals United account (${strays.map((s: any) => s.ru_property_id).join(', ')}) — re-push them as the white-label sub-user.`
          : allDeferred
            ? 'The channel allows one identical read per minute — this verification is queued and will complete shortly. The previously verified currency still stands.'
            : stale.length === listings.length && listings.length > 0
              ? `Stored listing IDs (${stale.map((s: any) => s.ru_property_id).join(', ')}) no longer exist on this owner account — re-push the property to issue fresh listing IDs. The currency itself was not checked.`
              : transport.length === listings.length && listings.length > 0
                ? 'Could not reach Rentals United for this property — transport error, currency not checked. Retry.'
                : (listings.find(l => l.error && !l.deferred)?.error ?? notes[0] ?? null);
        results.push({
          property_id: p.id,
          name: p.name,
          owner_scope: String(ownerId),
          expected_iso: expectedIso,
          listings,
          notes,
          listings_on_master_account: strays.length,
          stale_listing_ids: stale.map((s: any) => s.ru_property_id),
          unreachable: transport.length === listings.length && listings.length > 0,
          rate_deferred: allDeferred,
          retry_after_ms: allDeferred ? 60_000 : undefined,
          ru_reported_iso: primaryVerification?.ru_reported_iso ?? listings.find(l => l.ru_reported_iso)?.ru_reported_iso ?? null,
          matches: gatePassed,
          state_persisted: primaryVerification?.persisted === true,
          gate_passed: gatePassed,
          used_existing_verdict: usedExistingVerdict,
          success: gatePassed,
          error: gatePassed ? null : reason,
        });





        await new Promise(r => setTimeout(r, 750));
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: `Verified ${results.filter(r => r.matches).length}/${results.length} listings against Rentals United`,
          results,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (action === 'reconcile_ru_location_currency') {
      const targetIds: string[] | undefined = Array.isArray(reqBody.property_ids) ? reqBody.property_ids : undefined;
      const dryRun = reqBody.dry_run === true;

      // The cache is the input to every currency comparison below — refresh it first so a
      // cold/stale ru_locations table can never silently skip the flip.
      const cacheRefresh = await refreshRuLocationsCache(supabase);
      console.log(`[push-property-to-ru] reconcile: location cache refresh ${cacheRefresh.success ? `ok (${cacheRefresh.upserted})` : `failed (${cacheRefresh.error})`}`);

      const [{ data: buildingProps }, { data: unitRows }] = await Promise.all([
        supabase
          .from('properties')
          .select('id, name, rentalsunited_property_id, rentalsunited_building_id, country, latitude, longitude, amenities, city, ru_location_id')
          .or('rentalsunited_property_id.not.is.null,rentalsunited_building_id.not.is.null'),
        supabase
          .from('hostfully_room_types')
          .select('property_id, properties!inner(id, name, rentalsunited_property_id, country, latitude, longitude, amenities, city, ru_location_id)')
          .not('rentalsunited_property_id', 'is', null),
      ]);

      const propMap = new Map<string, any>();
      for (const p of buildingProps ?? []) propMap.set(p.id, p);
      for (const row of (unitRows ?? []) as any[]) {
        const p = row.properties;
        if (p && !propMap.has(p.id)) propMap.set(p.id, p);
      }
      const targets = Array.from(propMap.values()).filter(p => !targetIds || targetIds.includes(p.id));

      const results: any[] = [];
      const flippedLocations = new Set<number>(); // per-location lock — don't double-flip

      for (const p of targets) {
        const lat = Number(p.latitude) || 0;
        const lng = Number(p.longitude) || 0;
        const expectedCcyId = mapCurrencyToRUId(p.amenities, p.country);
        const expectedIso = ISO_BY_RU_CURRENCY_ID[expectedCcyId] || null;
        const loc = await resolveLocationId(supabase, lat, lng, p.country, p.city, (p as any).ru_location_id);

        if (!loc || loc <= 1) {
          results.push({ property_id: p.id, name: p.name, success: false, reason: 'location_unresolvable', country: p.country });
          continue;
        }

        // RU applies a location's currency to the AUTHENTICATING account only, so the flip
        // must happen as the owning white-label sub-user — never here on master credentials
        // (that is what left sub-accounts publishing USD while our cache claimed ZAR).
        // The per-property push below performs the scoped flip and reads the result back.
        const cached = await getRuLocationCurrency(supabase, loc);
        const currentIso = cached?.iso || null;
        let flipped: 'skipped' | 'already_set' | 'flipped' | 'failed' | 'delegated' = 'skipped';
        const flipError: string | null = null;
        if (expectedIso && !dryRun) {
          flipped = 'delegated';
          flippedLocations.add(loc);
        } else if (expectedIso && currentIso && currentIso === expectedIso) {
          flipped = 'already_set';
        }


        await persistRuPropertyMapping(supabase, p.id, {
          ru_location_id: loc,
          ru_currency_id: expectedCcyId,
          ru_country: p.country ?? null,
          coords_hash: hashCoords(lat, lng),
        });

        let pushOk = false;
        let pushError: string | null = null;
        if (!dryRun && flipped !== 'failed') {
          const { data: pushResult, error: pushErr } = await supabase.functions.invoke('push-property-to-ru', {
            body: { property_id: p.id },
          });
          pushOk = !pushErr && pushResult?.success === true;
          pushError = pushErr?.message || pushResult?.error?.message || null;
        }

        // What RU itself reported during the scoped push — the only trustworthy signal.
        const verifiedState = !dryRun ? await loadCurrencyState(supabase, p.id) : null;

        results.push({
          property_id: p.id,
          name: p.name,
          ru_location_id: loc,
          expected_currency_iso: expectedIso,
          current_location_currency_iso: currentIso,
          location_flip: flipped,
          flip_error: flipError,
          ru_reported_currency_iso: verifiedState?.ru_reported_currency_iso ?? null,
          currency_verified_at: verifiedState?.verified_at ?? null,
          currency_drift: Boolean(
            verifiedState?.ru_reported_currency_iso
            && expectedIso
            && String(verifiedState.ru_reported_currency_iso).toUpperCase() !== expectedIso,
          ),
          push_ok: pushOk,
          push_error: pushError,
          success: !dryRun ? (pushOk && flipped !== 'failed') : true,
        });


        await new Promise(r => setTimeout(r, 750));
      }

      const okCount = results.filter(r => r.success).length;
      return new Response(
        JSON.stringify({
          success: true,
          dry_run: dryRun,
          message: `Reconciled ${okCount}/${results.length} RU properties`,
          results,
          flipped_locations: Array.from(flippedLocations),
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── Back-fill: reconcile country + currency for all RU-connected properties ──
    // One-shot remediation for properties pushed before the CurrencyID/LocationID fix.
    // Re-resolves geo + currency from local data and re-pushes them to RU so channels
    // (LekkeSlaap etc.) see the correct CurrencyID and DetailedLocationID.
    if (action === 'reconcile_ru_country_currency') {
      const targetIds: string[] | undefined = Array.isArray(reqBody.property_ids) ? reqBody.property_ids : undefined;
      const [{ data: buildingProps }, { data: unitRows }] = await Promise.all([
        supabase
          .from('properties')
          .select('id, name, rentalsunited_property_id, rentalsunited_building_id, country, latitude, longitude, amenities, ru_location_id')
          .or('rentalsunited_property_id.not.is.null,rentalsunited_building_id.not.is.null'),
        supabase
          .from('hostfully_room_types')
          .select('property_id, properties!inner(id, name, rentalsunited_property_id, country, latitude, longitude, amenities, ru_location_id)')
          .not('rentalsunited_property_id', 'is', null),
      ]);

      const propMap = new Map<string, any>();
      for (const p of buildingProps ?? []) propMap.set(p.id, p);
      for (const row of (unitRows ?? []) as any[]) {
        const p = row.properties;
        if (p && !propMap.has(p.id)) propMap.set(p.id, p);
      }
      const targets = Array.from(propMap.values()).filter(p => !targetIds || targetIds.includes(p.id));

      const results: any[] = [];
      for (const p of targets) {
        const lat = Number(p.latitude) || 0;
        const lng = Number(p.longitude) || 0;
        const ccy = mapCurrencyToRUId(p.amenities, p.country);
        const loc = await resolveLocationId(supabase, lat, lng, p.country, (p as any).city, (p as any).ru_location_id);
        if (!loc || loc <= 1) {
          results.push({ property_id: p.id, name: p.name, success: false, reason: 'location_unresolvable', country: p.country });
          continue;
        }
        await persistRuPropertyMapping(supabase, p.id, {
          ru_location_id: loc,
          ru_currency_id: ccy,
          ru_country: p.country ?? null,
          coords_hash: hashCoords(lat, lng),
        });
        // Re-push so RU records pick up the new values
        const { data: pushResult, error: pushErr } = await supabase.functions.invoke('push-property-to-ru', {
          body: { property_id: p.id },
        });
        results.push({
          property_id: p.id,
          name: p.name,
          success: !pushErr && pushResult?.success === true,
          ru_location_id: loc,
          ru_currency_id: ccy,
          error: pushErr?.message || pushResult?.error?.message || null,
        });
        await new Promise(r => setTimeout(r, 750));
      }

      const okCount = results.filter(r => r.success).length;
      return new Response(
        JSON.stringify({ success: true, message: `Reconciled ${okCount}/${results.length} RU properties`, results }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }


    // Optional: subscribe RLNM before pushing
    if (subscribe_rlnm) {
      const handlerUrl = `${supabaseUrl}/functions/v1/ru-reservation-handler`;
      console.log(`[push-property-to-ru] Subscribing RLNM handler: ${handlerUrl}`);
      try {
        const { data: rlnmResult, error: rlnmErr } = await supabase.functions.invoke('rentalsunited-api', {
          body: { action: 'subscribe_notifications', handler_url: handlerUrl },
        });
        if (rlnmErr || !rlnmResult?.success) {
          console.warn(`[push-property-to-ru] RLNM subscription failed:`, rlnmErr?.message || rlnmResult?.error?.message);
        } else {
          console.log(`[push-property-to-ru] RLNM subscription OK`);
        }
      } catch (e) {
        console.warn(`[push-property-to-ru] RLNM error:`, e instanceof Error ? e.message : e);
      }
    }

    if (!property_id) {
      return new Response(
        JSON.stringify({ success: false, error: { code: 'MISSING_PARAM', message: 'property_id is required' } }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[push-property-to-ru] Loading property ${property_id}...`);

    const { data: property, error: propErr } = await supabase
      .from('properties')
      .select('id, name, description, property_type, address, city, country, postal_code, latitude, longitude, max_guests, bedrooms, bathrooms, toilets, separate_kitchen, amenities, images, ru_image_tags, ru_location_id, rentalsunited_property_id, rentalsunited_building_id, owner_email, external_system, ru_archived, ru_push_enabled, ru_hold_reason, ru_hold_set_at')
      .eq('id', property_id)
      .single();

    if (propErr || !property) {
      return new Response(
        JSON.stringify({ success: false, error: { code: 'NOT_FOUND', message: `Property not found: ${propErr?.message}` } }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Channel Manager billing entitlement gate — archived listings must never
    // receive further pushes until billing is re-enabled by admin.
    if (!dry_run && (property as { ru_archived?: boolean }).ru_archived) {
      return new Response(
        JSON.stringify({
          success: false,
          error: {
            code: 'CHANNEL_MANAGER_DISABLED',
            message:
              'Channel Manager billing is disabled for this property, so its Rentals United listing is archived. Re-enable the Channel Manager in Billing to resume syncing.',
          },
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }



    // Guest-facing charges (deposit / cleaning) are authored on the Charges tab and are the
    // only source for the listing's SecurityDeposit and CleaningPrice.
    const { data: chargeRows } = await supabase
      .from('property_charges')
      .select(RU_CHARGE_COLUMNS.join(','))
      .eq('property_id', property_id);
    const propertyCharges = (chargeRows ?? []) as RuChargeRow[];

    const { data: roomTypes } = await supabase
      .from('hostfully_room_types')
      .select('id, name, description, max_guests, bedrooms, bathrooms, beds, bed_configuration, linked_rolos_id, amenities, images, ru_image_tags, check_in_time, check_out_time, check_in_instructions, cleaning_fee, security_deposit, address_street, address_postal_code, latitude, longitude, property_type, cancellation_policy, room_size, rentalsunited_property_id, created_at, updated_at')
      .eq('property_id', property_id)
      .eq('is_active', true);

    // Guard against legacy duplicate unit rows (e.g. an old ALL-CAPS copy of the same
    // chalet with a stale short description). Only the most recently edited row per
    // case-insensitive name is evaluated / pushed, matching what the editor shows.
    const dedupedRoomTypes = (() => {
      const byName = new Map<string, RoomTypeRow>();
      for (const rt of (roomTypes || []) as RoomTypeRow[]) {
        const key = String((rt as any).name || '').trim().toLowerCase();
        if (!key) { byName.set(`__id:${(rt as any).id}`, rt); continue; }
        const existing = byName.get(key);
        if (!existing) { byName.set(key, rt); continue; }
        const ts = (r: RoomTypeRow) => Date.parse(String((r as any).updated_at || (r as any).created_at || 0)) || 0;
        const len = (r: RoomTypeRow) => String((r as any).description || '').length;
        const better = ts(rt) > ts(existing) || (ts(rt) === ts(existing) && len(rt) > len(existing));
        if (better) byName.set(key, rt);
      }
      return Array.from(byName.values());
    })();
    // The Rooms tab (properties.amenities.room_types) is the canonical unit list. Keep the
    // readiness wizard, the push payload and the editor in agreement: only units the Rooms
    // tab still lists are evaluated, and they carry the Rooms-tab name/casing.
    const activeRoomTypes = (() => {
      const canonical = ((property.amenities as any)?.room_types || []) as Array<{ name?: string | null }>;
      const canonicalNames = new Map<string, string>();
      for (const rt of canonical) {
        const name = String(rt?.name || '').trim();
        if (name) canonicalNames.set(name.toLowerCase(), name);
      }
      if (canonicalNames.size === 0) return dedupedRoomTypes;
      return dedupedRoomTypes
        .filter((rt) => canonicalNames.has(String((rt as any).name || '').trim().toLowerCase()))
        .map((rt) => ({
          ...rt,
          name: canonicalNames.get(String((rt as any).name || '').trim().toLowerCase()) ?? (rt as any).name,
        })) as RoomTypeRow[];
    })();
    const isMultiUnit = activeRoomTypes.length > 0;

    /**
     * Gate #10 — distances to nearby attractions (nice-to-have, never blocking). Resolved once
     * for the whole push from the property's authored attractions plus the cached channel
     * destination dictionary; an empty result simply omits the <Distances> block.
     */
    const distanceLimitRaw = Number((reqBody as Record<string, unknown>)?.distance_limit);
    const distanceLimit = Number.isFinite(distanceLimitRaw) && distanceLimitRaw > 0
      ? Math.floor(distanceLimitRaw)
      : undefined;
    const propertyDistances = (await loadPropertyDistances(supabase, property_id, distanceLimit));
    if (propertyDistances.length > 0) {
      console.log(`[push-property-to-ru] Distances mapped: ${propertyDistances.map((d) => `${d.destination_name}=${d.value}km`).join(', ')}`);
    }




    const lat = property.latitude || activeRoomTypes[0]?.latitude || 0;
    const lng = property.longitude || activeRoomTypes[0]?.longitude || 0;
    const country = property.country;

    // Resolve currency once for the whole push so every unit uses the same value.
    let currencyId = mapCurrencyToRUId(property.amenities as Record<string, unknown> | null, country);

    // Prefer cached RU location/currency if coords haven't drifted (T5).
    const cached = await loadRuPropertyMapping(supabase, property_id);
    const coordsHash = hashCoords(lat, lng);
    let locationId = 0;
    if (forceLocationId) {
      locationId = forceLocationId;
      console.log(`[push-property-to-ru] FORCE override: using LocationID ${locationId} (bypasses coord/cache resolution)`);
    } else if (Number((property as any).ru_location_id) > 1) {
      locationId = Number((property as any).ru_location_id);
      console.log(`[push-property-to-ru] Using RU LocationID selected in ROLOS: ${locationId}`);
    } else if (cached?.ru_location_id && (cached.coords_hash === coordsHash || (!lat || !lng))) {
      locationId = Number(cached.ru_location_id);
      console.log(`[push-property-to-ru] Using cached RU LocationID ${locationId} (coords_hash match)`);
    } else {
      locationId = await resolveLocationId(supabase, lat, lng, country, (property as any).city);
    }


    // Did the owner actually pick the Channel Manager location, or did we guess it?
    const locationAuthored = !!forceLocationId || Number((property as any).ru_location_id) > 1;

    if (!locationId || locationId <= 1) {
      return new Response(
        JSON.stringify({ success: false, error: { code: 'LOCATION_UNRESOLVED', message: `Could not resolve a Rentals United LocationID for this property. Coordinates: (${lat}, ${lng}), country: "${country || 'unset'}". Set valid coordinates or a supported country (ZA/NA/BW) before pushing.` } }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    /**
     * The listing verification is NOT cleared here. Blanking it up-front meant every
     * resumable chunk of a multi-unit push wiped a good verification and, because the
     * read-back only runs on the final chunk, the property was left reading "pushed but
     * never confirmed". The read-back that follows the push is the only writer: it stamps a
     * fresh confirmation or clears it when the channel really does not hold the listings.
     */


    // Persist resolved geo+currency for re-use & audit (skip on dry runs).
    if (!dry_run) {
      await persistRuPropertyMapping(supabase, property_id, {
        ru_location_id: locationId,
        ru_currency_id: currencyId,
        ru_country: country ?? null,
        coords_hash: coordsHash,
      });
    }

    // ── Currency authority (decided AFTER sub-user auth is resolved) ───────
    // RU applies a location's currency to the authenticating account, so the flip must be
    // made as the owning sub-user. The decision therefore happens further below, once the
    // child API keys are in hand. Pre-scoring uses the authored currency.
    const authoredIso = ISO_BY_RU_CURRENCY_ID[currencyId] || 'ZAR';
    let currencyDecision: CurrencyDecision | null = null;


    // ── Phase gate + RU OwnerID resolution ────────────────────
    // Phase 1 (sub-user) and Phase 2 (readiness) must pass before any RU write.
    // OwnerID comes from the portfolio sub-account when one exists, otherwise
    // from a property-scoped sub-account, otherwise the master account.
    let precomputedGaps: string[] = [];
    /** Non-null when scoring threw — the live push is refused instead of assuming "no gaps". */
    let readinessScoringError: string | null = null;

    try {
      // An ARI-only refresh never writes static content, so content scoring is skipped.
      if (isMultiUnit && action !== 'refresh_ari') {

        const scored = await Promise.all(
          activeRoomTypes.map(async (rt) => {
            const payload = { ...buildUnitPayload(property as PropertyRow, rt, locationId, undefined, currencyId, propertyCharges), distances: propertyDistances } as Record<string, any>;
            // Probe image dimensions exactly like the dry run does — without this the
            // sizes stay "unverified" and readiness falsely reports every photo as too small.
            await applyImageVerification(payload);
            payload.location_authored = locationAuthored;
            return { name: rt.name, validation: buildValidation(payload) as any };
          }),
        );
        precomputedGaps = mandatoryGaps(scored);
      }
      // The bookable-window + MinStay rules are part of the same gate as the content rules,
      // so the wizard and the live push cannot disagree about what "ready" means.
      if (action !== 'refresh_ari') {
        const localWindow = await computeLocalBookableWindow(supabase, property_id);
        const windowGaps = localBookableWindowChecks(localWindow)
          .filter((c) => c.mandatory && !c.passed)
          .map((c) => c.detail ?? c.label);
        precomputedGaps = [...precomputedGaps, ...windowGaps];
      }
    } catch (e) {
      // Fail CLOSED: an unscored property is an unproven property. Letting the gate see an
      // empty gap list here is what allowed a live push to proceed with zero verification.
      readinessScoringError = e instanceof Error ? e.message : String(e);
      console.error('[push-property-to-ru] Readiness pre-scoring failed:', readinessScoringError);
    }

    if (readinessScoringError && !dry_run && action !== 'refresh_ari' && !forcePush) {
      try {
        await supabase.from('ru_sync_runs').insert({
          property_id,
          action: 'readiness_unverified',
          success: false,
          error_code: 'READINESS_UNVERIFIED',
          error_message: readinessScoringError.slice(0, 2000),
        });
      } catch (_e) { /* evidence only */ }
      return new Response(
        JSON.stringify({
          success: false,
          error: {
            code: 'READINESS_UNVERIFIED',
            message: `Channel readiness could not be verified, so the push was refused: ${readinessScoringError}`,
          },
        }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }



    const phaseGate = await evaluatePhases(supabase, property as any, { readinessGaps: precomputedGaps });

    // Multi-tenant isolation: a missing OwnerID is always a HARD error.
    const ruOwnerId = phaseGate.ru_owner_id;
    if (!ruOwnerId || ruOwnerId <= 0) {
      return new Response(
          JSON.stringify({
            success: false,
            error: {
              code: 'RU_OWNER_UNRESOLVED',
              message:
                'No Rentals United OwnerID is linked to this property (or its portfolio). Complete Phase 1 (create the RU sub-user + company details) before pushing — inventory is never attributed to the RoomsOnline master account.',
              details: { owner_scope: phaseGate.owner_scope, portfolio_id: phaseGate.portfolio_id },
            },
          }),
          { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
    }

    const { account: ownerAccount } = await findOwnerAccount(supabase, property_id, property.owner_email, phaseGate.portfolio_id);
    const childUsername = ownerAccount?.ru_login_email?.trim() ?? '';
    const decryptSecret = async (enc: unknown): Promise<string> => {
      if (!enc) return '';
      const { data } = await supabase.rpc('decrypt_sensitive_text', { encrypted_data: enc });
      const plain = typeof data === 'string' ? data : '';
      return plain && plain !== '[ENCRYPTED]' && plain !== '[DECRYPTION_ERROR]' ? plain : '';
    };
    const childPassword = await decryptSecret(ownerAccount?.ru_login_password_enc);

    // Since RU's Nov-2025 API-keys rollout, child-scoped writes (buildings) must use the
    // sub-user's OWN AccessKey/SecretKey. Keys live per RU OwnerID in ru_api_credentials;
    // the legacy columns on ru_owner_accounts are a fallback only.
    let childAccessKey = '';
    let childSecretKey = '';
    {
      const { data: credRow } = await supabase
        .from('ru_api_credentials')
        .select('access_key, secret_enc')
        .eq('ru_owner_id', String(ruOwnerId))
        .maybeSingle();
      if (credRow?.access_key) {
        const plain = await decryptSecret(credRow.secret_enc);
        if (plain) { childAccessKey = String(credRow.access_key); childSecretKey = plain; }
      }
      if (!childAccessKey && ownerAccount?.ru_api_access_key) {
        const plain = await decryptSecret((ownerAccount as Record<string, unknown>).ru_api_secret_enc);
        if (plain) { childAccessKey = String(ownerAccount.ru_api_access_key); childSecretKey = plain; }
      }
    }
    const hasChildKeys = Boolean(childAccessKey && childSecretKey);
    /** Child auth for building calls: API keys first, legacy portal password only if no keys. */
    const childAuthPayload: Record<string, unknown> = hasChildKeys
      ? { owner_id: ruOwnerId, auth_access_key: childAccessKey, auth_secret_key: childSecretKey }
      : { owner_id: ruOwnerId, auth_username: childUsername, auth_password: childPassword };

    // ── Currency authority: RU owns currency on the LocationID, PER ACCOUNT ─────
    // Flip the location to our authored currency (ZAR) authenticated as the owning
    // sub-user. Only if RU refuses do we publish converted rates in the fallback
    // currency at a live rate + margin.
    try {
      currencyDecision = await decideRuCurrency(supabase, {
        propertyId: property_id,
        locationId,
        authoredIso,
        country,
        childAuth: childAuthPayload,
        ownerScope: String(ruOwnerId),
        dryRun: dry_run === true,
      });
      currencyId = RU_CCY_BY_ISO[currencyDecision.published_iso] ?? currencyId;
      console.log(`[push-property-to-ru] Currency decision (owner ${ruOwnerId}): publishing in ${currencyDecision.published_iso} (location ${locationId} holds ${currencyDecision.location_iso ?? 'unverified'}, flip: ${currencyDecision.flip_outcome})`);
    } catch (e) {
      console.warn('[push-property-to-ru] Currency decision failed, falling back to authored currency:', e instanceof Error ? e.message : e);
    }


    if (isMultiUnit && useBuilding && !hasChildKeys && (!childUsername || !childPassword)) {
      // Push_PutBuilding_RQ has no <OwnerID>: the building lands on whichever account
      // authenticates, so a parent fallback would create it on our master account. Hard stop.
      return new Response(JSON.stringify({ success: false, error: { code: 'RU_CHILD_AUTH_REQUIRED', message: `No Rentals United API keys are stored for OwnerID ${ruOwnerId}. RU requires the sub-user's own AccessKey + SecretKey to create or update its building inventory — generate them in the RU dashboard (Security settings) and save them in Portfolios → RU accounts.` } }), { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── READ-BACK ONLY (action: 'verify_calendar') ─────────────────────────
    // Authoritative per-day view of what the channel actually holds for each live unit, read
    // with the owning sub-user keys (master keys answer "Property does not exist"). Pushes
    // nothing — this is the diagnostic that proves whether a sold night is closed at the channel.
    if (action === 'verify_calendar') {
      const from = typeof reqBody.date_from === 'string' ? reqBody.date_from : new Date().toISOString().slice(0, 10);
      const to = typeof reqBody.date_to === 'string'
        ? reqBody.date_to
        : new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

      const units: { label: string; ru_id: number; unit_id: string | null }[] = [];
      for (const rt of activeRoomTypes) {
        const ruId = parseInt(String(rt.rentalsunited_property_id ?? ''), 10);
        if (ruId > 0) units.push({ label: rt.name, ru_id: ruId, unit_id: rt.id });
      }
      if (units.length === 0) {
        const parentRuId = parseInt(String(property.rentalsunited_property_id ?? ''), 10);
        if (parentRuId > 0) units.push({ label: property.name, ru_id: parentRuId, unit_id: null });
      }
      if (units.length === 0) {
        return new Response(
          JSON.stringify({ success: false, error: { code: 'RU_NOT_LISTED', message: 'No live channel listing for this property yet.' } }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      const wantedUnitId = typeof reqBody.unit_id === 'string' ? reqBody.unit_id : null;
      const scoped = wantedUnitId ? units.filter((u) => u.unit_id === wantedUnitId) : units;

      const report: Record<string, unknown>[] = [];
      for (const u of scoped) {
        const sold = await loadBookingBlocks(supabase, property.id, from, to, u.unit_id ? { id: u.unit_id, name: u.label ?? null, linked_rolos_id: null } : null);
        const { data: calData, error: calErr } = await supabase.functions.invoke('rentalsunited-api', {
          body: { action: 'get_availability', ru_property_id: u.ru_id, date_from: from, date_to: to, ...childAuthPayload },
        });
        if (calErr || !calData?.success || !calData?.raw_xml) {
          report.push({
            unit: u.label,
            unit_id: u.unit_id,
            ru_property_id: u.ru_id,
            error: calErr?.message || calData?.error?.message || 'No calendar returned',
            sold_nights: [...sold.dates].sort(),
          });
          continue;
        }
        const days: Record<string, unknown>[] = [];
        let openSold = 0;
        for (const [date, day] of parseRuAvailabilityDays(String(calData.raw_xml))) {
          const isSold = sold.dates.has(date);
          const closed = (day.reservations ?? 0) > 0 || (day.units ?? 0) === 0;
          if (isSold && !closed) openSold += 1;
          days.push({
            date,
            units: day.units,
            reservations: day.reservations,
            min_stay: day.min_stay,
            changeover: day.changeover,
            sold_on_rolos: isSold,
            channel_closed: closed,
            conflict: isSold && !closed,
          });
        }
        report.push({
          unit: u.label,
          unit_id: u.unit_id,
          ru_property_id: u.ru_id,
          window: { from, to },
          sold_nights: [...sold.dates].sort(),
          sold_nights_still_open: openSold,
          days,
        });
      }

      return new Response(
        JSON.stringify({ success: true, property: { id: property.id, name: property.name }, window: { from, to }, units: report }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }


    /** Explicit, recorded hold on distribution — distinct from an incomplete wizard. */
    const distributionHold = (property as { ru_push_enabled?: boolean; ru_hold_reason?: string | null; ru_hold_set_at?: string | null }).ru_push_enabled === false
      ? {
          code: 'RU_ON_HOLD',
          message: `Channel distribution is on hold for this property${(property as { ru_hold_set_at?: string | null }).ru_hold_set_at ? ` since ${String((property as { ru_hold_set_at?: string | null }).ru_hold_set_at).slice(0, 10)}` : ''}${(property as { ru_hold_reason?: string | null }).ru_hold_reason ? `: ${(property as { ru_hold_reason?: string | null }).ru_hold_reason}` : ''}. Local changes were saved and will sync when the hold is lifted.`,
        }
      : null;

    // ── ARI-ONLY REFRESH (action: 'refresh_ari') ───────────────────────────

    // Nightly/event-driven availability + pricing refresh for inventory that is ALREADY listed
    // at RU. Dashboard bookings/cancels/mods/blockouts always write locally; they only
    // reach RU after a clear Channel wizard pass (bound owner, keys, company details,
    // explicit push on, phase 1+2). Sub-user keys and a resolved OwnerID are still mandatory.
    if (action === 'refresh_ari') {
      if (!dry_run && !forcePush) {
        if ((property as { ru_push_enabled?: boolean }).ru_push_enabled !== true || !hasChildKeys || !phaseGate.ready_for_push) {
          const blockedBody = !phaseGate.ready_for_push
            ? phaseBlockedResponse(phaseGate)
            : {
                success: false,
                error: distributionHold ?? {
                  code: 'WIZARD_SYNC_NOT_READY',
                  message:
                    'The Channel Manager connection is not complete yet. Local availability was saved and will sync once the gates pass.',
                },
              };
          try {
            await supabase.from('ru_sync_runs').insert({
              property_id,
              action: 'wizard_sync_blocked',
              success: false,
              error_code: (blockedBody as { error?: { code?: string } }).error?.code ?? 'WIZARD_SYNC_NOT_READY',
              error_message: (blockedBody as { error?: { message?: string } }).error?.message ?? 'Wizard gates not passed',
            });
          } catch (_e) { /* evidence only */ }
          return new Response(JSON.stringify(blockedBody), {
            status: 422,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }
      const targets: { label: string; ru_id: number; unit?: UnitContext; units: number }[] = [];
      if (isMultiUnit) {
        for (const rt of activeRoomTypes) {
          const ruId = parseInt(String(rt.rentalsunited_property_id ?? ''), 10);
          if (ruId > 0) {
            targets.push({
              label: rt.name,
              ru_id: ruId,
              unit: { id: rt.id, name: rt.name, linked_rolos_id: (rt as any).linked_rolos_id, amenities: (rt as any).amenities ?? null } as UnitContext,
              units: 1,
            });
          }
        }
      }
      if (targets.length === 0) {
        const parentRuId = parseInt(String(property.rentalsunited_property_id ?? ''), 10);
        if (parentRuId > 0) {
          targets.push({ label: property.name, ru_id: parentRuId, units: activeRoomTypes.length || 1 });
        }
      }

      if (targets.length === 0) {
        // Nothing is listed at the Channel Manager yet — a skip, not a failure. Returned as 200
        // so schedulers can read the code instead of seeing an opaque non-2xx invoke error.
        return new Response(
          JSON.stringify({
            success: false,
            error: {
              code: 'RU_NOT_LISTED',
              message: 'This property has no Channel Manager listing yet — run a full push before refreshing availability and pricing.',
            },
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      // The channel deletes/re-creates listings on its side; a stored ID can therefore go stale.
      // Re-pushing a dead ID fails forever, so detect it, clear the mapping and report a
      // re-list-required code instead of an endless "does not exist" failure loop.
      const isMissingListing = (msg?: string) =>
        !!msg && /(property (with given id )?does not exist)/i.test(msg);

      const ariResults: Record<string, any>[] = [];
      for (const t of targets) {
        const r = await pushARI(supabase, t.ru_id, property as PropertyRow, t.units, t.unit, childAuthPayload, currencyDecision);
        const stale = isMissingListing(r.availability_error) || isMissingListing(r.prices_error);
        if (stale) {
          console.warn(`[push-property-to-ru] Stale channel listing ${t.ru_id} (${t.label}) — clearing mapping, full push required`);
          if (t.unit?.id) {
            await supabase.from('hostfully_room_types').update({ rentalsunited_property_id: null }).eq('id', t.unit.id);
          } else {
            await supabase.from('properties').update({ rentalsunited_property_id: null }).eq('id', property_id);
          }
        }
        ariResults.push({ target: t.label, ru_property_id: t.ru_id, stale_listing: stale, ...r });
        if (targets.length > 1) await new Promise((res) => setTimeout(res, 1000));
      }

      // Transport-only failures ("Failed to send a request to the Edge Function", worker
      // shutdown/boot) happen when a long multi-unit batch exhausts the invoked worker. They are
      // not data defects, so give those targets one more pass after a cool-down before calling the
      // refresh incomplete.
      const isTransport = (r: Record<string, any>) => {
        if (r.stale_listing) return false;
        const status = r.prices_http_status ?? r.availability_http_status ?? null;
        if (typeof status === 'number') return status >= 500;
        const m = `${r.availability_error ?? ''} ${r.prices_error ?? ''}`.toLowerCase();
        return /failed to send a request|worker|boot|timeout|timed out|shutdown|network|fetch failed|connection/.test(m);
      };
      const retryIdx = ariResults
        .map((r, i) => ({ r, i }))
        .filter(({ r }) => (r.availability_pushed !== true || r.availability_error || r.prices_error) && isTransport(r))
        .map(({ i }) => i);
      if (retryIdx.length > 0) {
        await new Promise((res) => setTimeout(res, 4000));
        for (const i of retryIdx) {
          const t = targets[i];
          console.warn(`[push-property-to-ru] Transport failure on "${t.label}" — second pass`);
          const r2 = await pushARI(supabase, t.ru_id, property as PropertyRow, t.units, t.unit, childAuthPayload, currencyDecision);
          if (r2.availability_pushed === true && !r2.availability_error && !r2.prices_error) {
            ariResults[i] = { target: t.label, ru_property_id: t.ru_id, stale_listing: false, second_pass: true, ...r2 };
          } else {
            ariResults[i] = { ...ariResults[i], second_pass: true, second_pass_error: r2.availability_error || r2.prices_error || 'retry failed' };
          }
          if (retryIdx.length > 1) await new Promise((res) => setTimeout(res, 1500));
        }
      }

      const allOk = ariResults.every((r) => r.availability_pushed === true && !r.availability_error && !r.prices_error);
      const staleCount = ariResults.filter((r) => r.stale_listing).length;
      const failedTargets = ariResults.filter((r) => r.availability_pushed !== true || r.availability_error || r.prices_error);
      const failedCount = failedTargets.length;
      const allStale = !allOk && staleCount > 0 && staleCount === failedCount;
      // After retries, a 5xx or transport-level failure from the channel API is an upstream/runtime
      // hiccup, not a data defect — code it distinctly so the health report and the channel monitor
      // can separate a flaky upstream from a real push failure.
      const upstreamOnly = !allOk && !allStale && failedTargets.every(isTransport);
      /**
       * A single target that lost its worker mid-batch must not sink the whole refresh: the
       * other targets did reach the channel and their ARI is current. Report the run as a
       * partial success (green with a warning) and keep the per-target errors in `details`;
       * only a run where every target failed is a red run.
       */
      const allFailed = failedCount > 0 && failedCount === ariResults.length;
      const partialTransient = !allOk && !allStale && !allFailed && failedTargets.every(isTransport);
      const runOk = allOk || partialTransient;

      const errorCode = allOk
        ? null
        : allStale
          ? 'RU_LISTING_STALE'
          : partialTransient
            ? 'RU_ARI_PARTIAL_TRANSIENT'
            : upstreamOnly
              ? 'RU_UPSTREAM_UNAVAILABLE'
              : 'RU_ARI_REFRESH_INCOMPLETE';
      const totalAttempts = ariResults.reduce((sum, r) => sum + (r.availability_attempts ?? 0) + (r.prices_attempts ?? 0), 0);
      const errorMessage = allOk
        ? null
        : allStale
          ? `${staleCount} listing(s) no longer exist at the Channel Manager — the stale mapping was cleared, run a full push to re-list.`
          : `${failedCount}/${ariResults.length} target(s) failed after retries: ${ariResults.map((r) => r.availability_error || r.prices_error).filter(Boolean).join('; ')}`;
      try {
        await supabase.from('ru_sync_runs').insert({
          batch_id: crypto.randomUUID(),
          property_id,
          action: 'refresh_ari',
          success: runOk,
          error_code: errorCode,
          error_message: errorMessage,
          details: {
            ru_owner_id: ruOwnerId,
            trigger: typeof reqBody.trigger === 'string' ? reqBody.trigger : 'manual',
            stale_listings: staleCount,
            failed_targets: failedCount,
            total_targets: ariResults.length,
            total_attempts: totalAttempts,
            upstream_only: upstreamOnly,
            partial_transient: partialTransient,
            targets: ariResults,
          },
        });
      } catch (_e) { /* evidence only */ }

      return new Response(
        JSON.stringify({
          success: runOk,
          action: 'refresh_ari',
          property_id,
          partial: partialTransient,
          targets: ariResults,
          ...(allOk ? {} : { warning: errorMessage }),
          ...(runOk ? {} : { error: { code: errorCode, message: errorMessage } }),
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    /**
     * Discounts-only push (Push_PutLongStayDiscounts_RQ + Push_PutLastMinuteDiscounts_RQ).
     * RU requires the discount ladder to be pushed on change AND at least daily; this is the
     * path both the daily cron and the "save discount ladder" event use, so the cadence is
     * evidenced in ru_sync_runs without re-sending static content or ARI.
     */
    if (action === 'discounts_only') {
      if (!dry_run && !forcePush && ((property as { ru_push_enabled?: boolean }).ru_push_enabled !== true || !hasChildKeys || !phaseGate.ready_for_push)) {
        return new Response(
          JSON.stringify({
            success: false,
            error: distributionHold ?? {
              code: 'WIZARD_SYNC_NOT_READY',
              message: 'The Channel Manager connection is not complete yet.',
            },
          }),
          { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      const discountTargets: { ruId: number; roomTypeId?: string }[] = [];
      if (isMultiUnit) {
        for (const rt of activeRoomTypes) {
          const ruId = parseInt(String(rt.rentalsunited_property_id ?? ''), 10);
          if (ruId > 0) discountTargets.push({ ruId, roomTypeId: rt.id });
        }
      }
      if (discountTargets.length === 0) {
        const parentRuId = parseInt(String(property.rentalsunited_property_id ?? ''), 10);
        if (parentRuId > 0) discountTargets.push({ ruId: parentRuId });
      }

      if (discountTargets.length === 0) {
        return new Response(
          JSON.stringify({
            success: false,
            error: {
              code: 'RU_NOT_LISTED',
              message: 'This property has no Channel Manager listing yet — run a full push before refreshing discounts.',
            },
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      const discountResult = await pushDiscounts(supabase, property_id, discountTargets, childAuthPayload);
      const discountsOk = (discountResult.discount_errors ?? []).length === 0;
      try {
        await supabase.from('ru_sync_runs').insert({
          batch_id: crypto.randomUUID(),
          property_id,
          action: 'push_discounts',
          success: discountsOk,
          error_code: discountsOk ? null : 'RU_DISCOUNT_PUSH_FAILED',
          error_message: discountsOk ? null : (discountResult.discount_errors ?? []).join('; '),
          details: {
            ru_owner_id: ruOwnerId,
            trigger: typeof reqBody.trigger === 'string' ? reqBody.trigger : 'manual',
            targets: discountTargets.map((t) => t.ruId),
            ...discountResult,
          },
        });
      } catch (_e) { /* evidence only */ }

      return new Response(
        JSON.stringify({
          success: discountsOk,
          action: 'discounts_only',
          property_id,
          ...discountResult,
          ...(discountsOk ? {} : { error: { code: 'RU_DISCOUNT_PUSH_FAILED', message: (discountResult.discount_errors ?? []).join('; ') } }),
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }



    if (!dry_run && !phaseGate.ready_for_push) {
      if (!forcePush) {
        const blockedBody = phaseBlockedResponse(phaseGate);
        // A refused push used to leave no trace, so nobody could tell WHY phase 2 blocked.
        console.warn(
          `[push-property-to-ru] PHASE_BLOCKED at ${blockedBody.phase} for property ${property_id}: ${(blockedBody.blockers ?? []).join(' | ')}`,
        );
        try {
          await supabase.from('ru_sync_runs').insert({
            property_id,
            action: 'phase_blocked',
            success: false,
            error_code: 'PHASE_BLOCKED',
            error_message: (blockedBody.blockers ?? []).join('; ').slice(0, 2000),
            details: { phase: blockedBody.phase, phase_order: blockedBody.phase_order, blockers: blockedBody.blockers },
          });
        } catch (_e) { /* evidence only */ }
        return new Response(JSON.stringify(blockedBody), {
          status: 422,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.warn(
        `[push-property-to-ru] FORCE PUSH overriding phase gate at ${phaseGate.current_phase} for property ${property_id}`,
      );
      try {
        await supabase.from('ru_sync_runs').insert({
          property_id,
          action: 'force_push_override',
          success: false,
          error_code: 'PHASE_GATE_BYPASSED',
          error_message: `Phase gate bypassed at ${phaseGate.current_phase}`,
          details: { phases: phaseGate.phases, acting_user_id: forceActorId },
        });
      } catch (_e) { /* audit only */ }
    }

    console.log(
      `[push-property-to-ru] RU OwnerID ${ruOwnerId} (scope=${phaseGate.owner_scope}, portfolio=${phaseGate.portfolio_id ?? 'none'}), CurrencyID=${currencyId}, LocationID=${locationId}`,
    );

    // ── MULTI-UNIT BUILDING FLOW ─────────────────────────────
    if (isMultiUnit) {
      console.log(`[push-property-to-ru] Multi-unit mode: ${activeRoomTypes.length} units for "${property.name}"`);

      // ── Readiness gate: no live push while mandatory WL requirements fail ──
      // Reuses the image-verified scoring computed for the phase gate above.
      if (!dry_run && !forcePush) {
        const gaps = precomputedGaps;
        if (gaps.length > 0) {
          return new Response(
            JSON.stringify({
              success: false,
              error: {
                code: 'NOT_READY',
                message: `Property is not ready for Rentals United: ${gaps.length} requirement(s) outstanding.`,
              },
              gaps,
            }),
            { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }




      // Dry run: validate each unit
      if (dry_run) {
        const units = await Promise.all(activeRoomTypes.map(async (rt) => {
          const payload = { ...buildUnitPayload(property as PropertyRow, rt, locationId, undefined, currencyId, propertyCharges), distances: propertyDistances } as Record<string, any>;
          await applyImageVerification(payload);
          return {
            room_type_id: rt.id,
            name: rt.name,
            ru_property_id: rt.rentalsunited_property_id || null,
            validation: buildValidation({ ...payload, location_authored: locationAuthored }),
          };
        }));

        const gaps = mandatoryGaps(units.map(u => ({ name: u.name, validation: u.validation as any })));
        const allReady = gaps.length === 0;
        const everyFlag = (key: string) => units.every(u => (u.validation as any)[key] !== false);

        return new Response(
          JSON.stringify({
            success: true,
            dry_run: true,
            multi_unit: true,
            property_id,
            building_id: property.rentalsunited_building_id || null,
            units,
            gaps,
            validation: {
              total_units: units.length,
              all_ready: allReady,
              images_count: units.reduce((s, u) => s + Number((u.validation as any).images_count || 0), 0),
              amenities_count: Number((units[0]?.validation as any)?.amenities_count || 0),
              amenities_padded: units.some(u => (u.validation as any).amenities_padded === true),
              amenities_padded_count: units.reduce((s, u) => s + Number((u.validation as any).amenities_padded_count || 0), 0),
              rooms_count: units.length,
              has_coordinates: everyFlag('has_coordinates'),
              meets_minimum_images: everyFlag('meets_minimum_images'),
              images_meet_size: everyFlag('images_meet_size'),
              meets_minimum_amenities: everyFlag('meets_minimum_amenities'),
              has_zip_code: everyFlag('has_zip_code'),
              has_space: everyFlag('has_space'),
              space_is_default: units.some(u => (u.validation as any).space_is_default === true),
              floor_is_default: units.some(u => (u.validation as any).floor_is_default === true),
              has_detailed_location_id: everyFlag('has_detailed_location_id'),
              ru_location_authored: everyFlag('ru_location_authored'),
              has_payment_methods: everyFlag('has_payment_methods'),
              payment_methods_is_default: units.some(u => (u.validation as any).payment_methods_is_default === true),
              has_cancellation_policies: everyFlag('has_cancellation_policies'),
              cancellation_policies_is_default: units.some(u => (u.validation as any).cancellation_policies_is_default === true),
              beds_cover_half: everyFlag('beds_cover_half'),
              beds_meet_max_guests: everyFlag('beds_meet_max_guests'),
              rooms_have_amenities: everyFlag('rooms_have_amenities'),
              rooms_meet_min_amenities: everyFlag('rooms_meet_min_amenities'),
              has_name: everyFlag('has_name'),
              has_object_type_id: everyFlag('has_object_type_id'),
              // Guessed-value flags aggregate pessimistically: one guessing unit blocks the push.
              object_type_is_default: units.some(u => (u.validation as any).object_type_is_default === true),
              object_type_source: units.map(u => (u.validation as any).object_type_source).find(Boolean) ?? null,
              currency_is_default: units.some(u => (u.validation as any).currency_is_default === true),
              currency_iso: units.map(u => (u.validation as any).currency_iso).find(Boolean) ?? null,
              beds_unmapped: Array.from(new Set(units.flatMap(u => ((u.validation as any).beds_unmapped || []) as string[]))),
              beds_are_default: units.some(u => (u.validation as any).beds_are_default === true),
              changeover_is_default: units.some(u => (u.validation as any).changeover_is_default === true),

              can_sleep_max_ok: everyFlag('can_sleep_max_ok'),
              has_description: everyFlag('has_description'),
              description_meets_recommended: everyFlag('description_meets_recommended'),
              description_length: Math.min(...units.map(u => Number((u.validation as any).description_length || 0))),
              has_main_image: everyFlag('has_main_image'),
              has_street: everyFlag('has_street'),
              // Certification content-quality aggregate (weakest unit wins).
              name_clean: everyFlag('name_clean'),
              name_issues: Array.from(new Set(units.flatMap(u => ((u.validation as any).name_issues || []) as string[]))),
              name_issue_detail: units.map(u => (u.validation as any).name_issue_detail).filter(Boolean).join('; ') || null,
              description_meets_cert: everyFlag('description_meets_cert'),
              attraction_distance_count: propertyDistances.length,
              images_meet_cert_size: everyFlag('images_meet_cert_size'),
              images_meeting_cert_size: units.reduce((s, u) => s + Number((u.validation as any).images_meeting_cert_size || 0), 0),
              images_size_unverified: units.reduce((s, u) => s + Number((u.validation as any).images_size_unverified || 0), 0),
              images_inherited_count: units.reduce((s, u) => s + Number((u.validation as any).images_inherited_count || 0), 0),
              images_measured_count: units.reduce((s, u) => s + Number((u.validation as any).images_measured_count || 0), 0),
              smallest_image_width: (() => {
                const vals = units.map(u => Number((u.validation as any).smallest_image_width)).filter(n => Number.isFinite(n));
                return vals.length ? Math.min(...vals) : null;
              })(),
              smallest_image_height: (() => {
                const vals = units.map(u => Number((u.validation as any).smallest_image_height)).filter(n => Number.isFinite(n));
                return vals.length ? Math.min(...vals) : null;
              })(),
              has_bedroom: everyFlag('has_bedroom'),
              has_kitchen: everyFlag('has_kitchen'),
              has_bathroom_room: everyFlag('has_bathroom_room'),
              beds_distributed: everyFlag('beds_distributed'),
              bedroom_blocks: units.reduce((s, u) => s + Number((u.validation as any).bedroom_blocks || 0), 0),
              bedrooms_with_beds: units.reduce((s, u) => s + Number((u.validation as any).bedrooms_with_beds || 0), 0),
              has_arrival_instructions: everyFlag('has_arrival_instructions'),
              arrival_instructions_length: Math.min(...units.map(u => Number((u.validation as any).arrival_instructions_length || 0))),
              has_check_in_from: everyFlag('has_check_in_from'),
              has_check_out_until: everyFlag('has_check_out_until'),
              check_in_times_are_default: units.some(u => (u.validation as any).check_in_times_are_default === true),
              check_in_from: (units[0]?.validation as any)?.check_in_from ?? null,
              check_out_until: (units[0]?.validation as any)?.check_out_until ?? null,
            },
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }


      // ── STANDALONE UNITS FLOW (no building) — DEFAULT ─────
      // Each room type is pushed as an independent RU property without a BuildingID.
      // ObjectTypeID falls back to property_type_id (Chalet=12, Apartment=1, etc.).
      // No Push_PutBuilding_RQ is issued here, so repeat pushes and cron refreshes can never
      // create duplicate building containers in the white-label portal.
      if (!useBuilding) {
        // Optional filter: only_unit_ids restricts the push to specific room_type ids
        const requestedUnits = Array.isArray(only_unit_ids) && only_unit_ids.length > 0
          ? activeRoomTypes.filter(rt => only_unit_ids.includes(rt.id))
          : activeRoomTypes;

        // Resumable chunking: each unit costs a content push plus availability/price pushes and
        // both read-backs, so a large property never fits in one invocation's budget — the last
        // units used to die with "Failed to send a request to the Edge Function". Push a slice
        // per invocation and hand the caller the ids still outstanding.
        const chunkSize = Number.isFinite(Number(batch_size)) && Number(batch_size) > 0
          ? Math.min(Math.floor(Number(batch_size)), requestedUnits.length || 1)
          : 3;
        const filteredUnits = requestedUnits.slice(0, chunkSize);
        const remainingUnits = requestedUnits.slice(chunkSize);
        const sequenceBatchId = typeof incomingBatchId === 'string' && incomingBatchId ? incomingBatchId : crypto.randomUUID();
        console.log(`[push-property-to-ru] Standalone-units mode: pushing ${filteredUnits.length} of ${requestedUnits.length} requested unit(s) (${activeRoomTypes.length} active, chunk ${chunkSize}, batch ${sequenceBatchId})`);
        const unitResults: any[] = [];

        for (const unit of filteredUnits) {
          const existingUnitRuId = unit.rentalsunited_property_id ? parseInt(unit.rentalsunited_property_id, 10) : 0;
          // buildingId=0 → adapter omits <BuildingID> entirely
          const unitPayload = { ...buildUnitPayload(property as PropertyRow, unit, locationId, 0, currencyId, propertyCharges), distances: propertyDistances };
          unitPayload.owner_id = ruOwnerId;
          const unitImageIssues = await applyImageVerification(unitPayload as unknown as Record<string, any>);
          if (unitImageIssues.length > 0) {
            console.warn(`[push-property-to-ru] Unit "${unit.name}": dropped ${unitImageIssues.length} image(s) Rentals United would reject`, unitImageIssues.map(i => i.reason));
          }
          // ObjectTypeID = property_type_id (no composition lookup)
          unitPayload.object_type_id = unitPayload.listing_type_id;

          if (existingUnitRuId === 0 && unitPayload.images.length < 10) {
            console.warn(`[push-property-to-ru] Unit "${unit.name}" skipped: only ${unitPayload.images.length} images (<10)`);
            unitResults.push({ name: unit.name, room_type_id: unit.id, success: false, error: `Needs ≥10 images (has ${unitPayload.images.length})` });
            continue;
          }

          console.log(`[push-property-to-ru] Pushing standalone unit "${unit.name}" (existing RU ID: ${existingUnitRuId}, object_type_id: ${unitPayload.object_type_id})`);

          // Transport failures mid-batch (worker recycle / cold boot) used to kill the last
          // units of a large multi-unit push — retry those, never business errors.
          const firstAttempt = await invokeRuWithRetry(
            supabase,
            { action: 'push_property', ru_property_id: existingUnitRuId, property: unitPayload, ...childAuthPayload },
            { label: `push_property ${unit.name}` },
          );
          let pushResult: any = firstAttempt.data;
          let pushErr: { message: string } | null = firstAttempt.ok
            ? null
            : { message: firstAttempt.message || 'Unknown error' };


          // Stale RU ID recovery (see multi-unit flow): re-push as a create.
          const staleIdError = /property does not exist/i.test(
            String(pushErr?.message || pushResult?.error?.message || ''),
          );
          if (existingUnitRuId > 0 && (pushErr || !pushResult?.success) && staleIdError) {
            console.warn(`[push-property-to-ru] Stale RU ID ${existingUnitRuId} for unit "${unit.name}" — recreating`);
            await supabase.from('hostfully_room_types').update({ rentalsunited_property_id: null }).eq('id', unit.id);
            const retry = await supabase.functions.invoke('rentalsunited-api', {
              body: { action: 'push_property', ru_property_id: 0, property: unitPayload, ...childAuthPayload },
            });
            pushResult = retry.data;
            pushErr = retry.error;
          }

          if (pushErr || !pushResult?.success) {
            const errMsg = pushErr?.message || pushResult?.error?.message || 'Unknown error';
            // The adapter refused to create because it could not prove the listing does not
            // already exist on the account. That is a deferral, not a content failure — retrying
            // is safe and is the only way we avoid minting a duplicate generation.
            const adoptionUnverified = pushResult?.error?.code === 'RU_ADOPTION_UNVERIFIED'
              || /RU_ADOPTION_UNVERIFIED/.test(errMsg);
            if (adoptionUnverified) {
              console.warn(`[push-property-to-ru] Unit "${unit.name}" deferred — ${errMsg}`);
              unitResults.push({
                name: unit.name,
                room_type_id: unit.id,
                success: false,
                deferred: true,
                transport_failure: true,
                error: `Not pushed yet — ${errMsg}`,
              });
              continue;
            }
            // A failed create may still have registered the listing at the channel. Store the id
            // it handed back so the next run updates that listing instead of creating a duplicate.
            const stranded = Number(pushResult?.diagnostics?.stranded_ru_property_id ?? 0);
            if (stranded > 0) {
              await supabase.from('hostfully_room_types').update({ rentalsunited_property_id: String(stranded) }).eq('id', unit.id);
              console.warn(`[push-property-to-ru] Unit "${unit.name}" failed but the channel issued listing ${stranded} — stored it to prevent a duplicate on retry`);
            }
            console.error(`[push-property-to-ru] Unit "${unit.name}" push failed:`, errMsg);
            unitResults.push({ name: unit.name, room_type_id: unit.id, success: false, error: errMsg, diagnostics: pushResult?.diagnostics });
            continue;
          }


          let unitRuId = existingUnitRuId > 0 && !staleIdError ? String(existingUnitRuId) : null;
          if (pushResult.raw_xml) {
            const extracted = extractRUPropertyId(pushResult.raw_xml);
            if (extracted) unitRuId = extracted;
          }
          // The adapter may have adopted an existing listing by name instead of creating one.
          if (pushResult.ru_property_id) unitRuId = String(pushResult.ru_property_id);

          if (unitRuId) {
            await supabase.from('hostfully_room_types').update({ rentalsunited_property_id: unitRuId }).eq('id', unit.id);
            console.log(`[push-property-to-ru] Saved RU ID ${unitRuId} for unit "${unit.name}"${pushResult.adopted_existing_listing ? ' (adopted existing listing)' : ''}`);
          }


          // Push ARI (availability + prices) for this standalone unit
          let ariResult: Record<string, any> = {};
          const ruIdNum = unitRuId ? parseInt(unitRuId, 10) : 0;
          if (ruIdNum > 0) {
            console.log(`[push-property-to-ru] Pushing ARI for standalone unit "${unit.name}" (RU ID: ${ruIdNum})`);
            ariResult = await pushARIUnlessStatic(supabase, ruIdNum, property as PropertyRow, 1, { id: unit.id, name: unit.name, linked_rolos_id: unit.linked_rolos_id, amenities: (unit as any).amenities ?? null }, childAuthPayload, currencyDecision);
            if (ariResult.availability_error) console.error(`[push-property-to-ru] Availability error for "${unit.name}": ${ariResult.availability_error}`);
            if (ariResult.prices_error) console.error(`[push-property-to-ru] Prices error for "${unit.name}": ${ariResult.prices_error}`);
          }

          unitResults.push({
            name: unit.name,
            room_type_id: unit.id,
            success: ruIdNum > 0 && !ariResult.availability_error && !ariResult.prices_error,
            rentalsunited_property_id: unitRuId,
            ari: ariResult,
            distances_skipped: pushResult?.distances_skipped ?? 0,
            diagnostics: pushResult?.diagnostics,

          });
        }

        // Transport exhaustion (worker recycle / cold boot) is not a content, availability or
        // price rejection — label it so the caller can simply retry those units.
        const TRANSPORT_RE = /failed to send a request|fetch failed|network|timeout|timed out|shutdown|worker|boot|connection|non-2xx/i;
        for (const u of unitResults) {
          if (!u.success && TRANSPORT_RE.test(String(u.error || ''))) {
            u.transport_failure = true;
            u.error = `Not pushed yet — the run ran out of time (${u.error}). Retry this unit.`;
          }
        }

        const chunkSuccess = unitResults.length === filteredUnits.length && unitResults.every((u: any) => u.success);
        const chunkVerified = chunkSuccess && unitResults.every((u: any) => {
          const ari = u.ari ?? u;
          return ari.availability_pushed === true
            && ari.prices_pushed === true
            && !ari.availability_verification?.error
            && (ari.availability_verification?.mismatches?.length ?? 0) === 0
            && !ari.prices_verification?.error
            && ari.prices_verification?.checked === true
            && (ari.prices_verification?.mismatches?.length ?? 0) === 0
            && (ari.prices_verification?.missing_dates?.length ?? 0) === 0
            // A read-back that could not be performed is not a pass.
            && ari.price_coverage_audit?.verdict !== 'unverified';
        });

        const failedUnitIds = unitResults.filter((u: any) => !u.success).map((u: any) => u.room_type_id);
        const retryableUnitIds = unitResults.filter((u: any) => u.transport_failure).map((u: any) => u.room_type_id);
        const remainingUnitIds = [...remainingUnits.map(u => u.id), ...retryableUnitIds];

        /**
         * Publish invariant. A chunk only knows about the units it carried, so a unit that
         * was inactive when the sequence started (or added since) used to end the run
         * unpublished while the push reported "complete". Re-read the property's active
         * canonical units and treat any that still hold no listing id as outstanding work.
         */
        let unpublishedUnits: Array<{ id: string; name: string }> = [];
        if (remainingUnitIds.length === 0) {
          const canonicalIds = new Set(activeRoomTypes.map((rt: any) => rt.id));
          const { data: freshUnits } = await supabase
            .from('hostfully_room_types')
            .select('id, name, rentalsunited_property_id')
            .eq('property_id', property_id)
            .eq('is_active', true);
          const attemptedIds = new Set(filteredUnits.map((u: any) => u.id));
          unpublishedUnits = ((freshUnits ?? []) as Array<{ id: string; name: string | null; rentalsunited_property_id: string | null }>)
            .filter((u) => canonicalIds.has(u.id) && !String(u.rentalsunited_property_id ?? '').trim())
            .map((u) => ({ id: u.id, name: String(u.name ?? 'Unit') }));
          // Only units this run never attempted are queued — re-queuing a unit that was just
          // attempted and still has no id would loop the sequence forever.
          const neverAttempted = unpublishedUnits.filter((u) => !attemptedIds.has(u.id));
          // A scoped request (only_unit_ids) is deliberately partial — report, never resume.
          if (neverAttempted.length > 0 && !Array.isArray(only_unit_ids)) {
            remainingUnitIds.push(...neverAttempted.map((u) => u.id));
            console.log(`[push-property-to-ru] Publish invariant: ${neverAttempted.map((u) => u.name).join(', ')} hold no listing — queued for the next chunk`);
          }
        }

        // The whole inventory is only pushed when this chunk finished the sequence cleanly.
        const inventorySuccess = chunkSuccess && remainingUnitIds.length === 0;
        const inventoryVerified = chunkVerified && remainingUnitIds.length === 0;

        // Once every unit lives standalone at RU, drop the stale building link so no future
        // run (cron, cert suite, manual) can re-enter the building flow and spawn duplicates.
        if (inventorySuccess && property.rentalsunited_building_id) {
          await supabase.from('properties').update({ rentalsunited_building_id: null }).eq('id', property_id);
          await supabase
            .from('pms_mappings')
            .update({ metadata: { mapping_kind: 'building', retired: true, retired_at: new Date().toISOString(), retired_reason: 'Units pushed standalone — building container no longer used', building_id: Number(property.rentalsunited_building_id), building_name: property.name.substring(0, 20) } })
            .eq('external_id', String(property.rentalsunited_building_id));
          console.log(`[push-property-to-ru] Cleared stale building link ${property.rentalsunited_building_id} for "${property.name}"`);
        }

        const hardFailures = unitResults.filter((u: any) => !u.success && !u.transport_failure);
        const unpublishedNote = unpublishedUnits.length > 0
          ? ` ${unpublishedUnits.map((u) => u.name).join(', ')} still hold no channel listing.`
          : '';
        const chunkErrorCode = chunkSuccess
          ? (remainingUnitIds.length > 0 ? 'RU_PUSH_RESUMABLE' : null)
          : hardFailures.length > 0 ? 'RU_INVENTORY_INCOMPLETE' : 'RU_PUSH_INTERRUPTED';
        const chunkErrorMessage = chunkSuccess
          ? (remainingUnitIds.length > 0
            ? `Chunk complete — ${unitResults.length} unit(s) pushed and verified, ${remainingUnitIds.length} unit(s) still queued in this sequence.${unpublishedNote}`
            : unpublishedNote.trim() || null)
          : hardFailures.length > 0
            ? `Rentals United rejected ${hardFailures.length} unit(s): ${hardFailures.map((u: any) => `${u.name} — ${u.error}`).join('; ')}`
            : 'The run ran out of time before every unit was pushed — retry the outstanding units.';

        await supabase.from('ru_sync_runs').insert({
          batch_id: sequenceBatchId,
          property_id,
          action: 'inventory_push',
          // A clean chunk is a success even when the sequence continues: logging it as a
          // failure made a healthy availability/price push read as "channel push failed".
          success: chunkSuccess,
          error_code: chunkErrorCode,
          error_message: chunkErrorMessage,
          details: {
            ru_owner_id: ruOwnerId,
            owner_scope: phaseGate.owner_scope,
            verified: inventoryVerified,
            chunk_verified: chunkVerified,
            sequence_complete: remainingUnitIds.length === 0,
            resumable: remainingUnitIds.length > 0,
            units: unitResults,
            unpublished_units: unpublishedUnits,
            chunk: { size: chunkSize, pushed: filteredUnits.length, requested: requestedUnits.length, remaining_unit_ids: remainingUnitIds },
          },
        });

        /**
         * Units left over from this chunk are finished as background work, so a rate-limited or
         * time-boxed run never leaves a property partially published. The client driver still
         * resumes interactively; the job is the durable safety net behind it.
         */
        if (remainingUnitIds.length > 0 && !Array.isArray(only_unit_ids)) {
          await enqueueJob(
            supabase,
            'channel_publish_units',
            { property_id, unit_ids: remainingUnitIds },
            {
              dedupeKey: `channel_publish_units:${property_id}`,
              delaySeconds: 70,
              maxAttempts: 8,
            },
          );
        }

        // The read-back follows the push automatically once the whole sequence is done.
        const listingVerification = inventorySuccess ? await verifyListingsAfterPush(supabase, property_id, req.headers.get('Authorization')) : null;
        return new Response(
          JSON.stringify({
            success: inventorySuccess,
            // Three distinct outcomes: the sequence finished, it is healthy but has units
            // left (resumable — NOT a failure), or RU rejected / the run was cut short.
            status: chunkSuccess ? (remainingUnitIds.length > 0 ? 'resumable' : 'complete') : 'failed',
            // A resumable chunk is not an error — only real rejections/interruptions are.
            ...(!chunkSuccess ? { error: { code: chunkErrorCode ?? 'RU_PUSH_INTERRUPTED', message: chunkErrorMessage ?? 'The channel push did not complete and reported no reason.' } } : {}),
            ...(chunkSuccess && remainingUnitIds.length > 0 ? { chunk_note: chunkErrorMessage } : {}),

            ...(listingVerification ? { listing_verification: listingVerification } : {}),
            multi_unit: true,
            standalone_units: true,
            property_id,
            units: unitResults,
            unpublished_units: unpublishedUnits,
            batch_id: sequenceBatchId,
            chunked: true,
            chunk_size: chunkSize,
            pushed_unit_ids: unitResults.filter((u: any) => u.success).map((u: any) => u.room_type_id),
            failed_unit_ids: failedUnitIds,
            retryable_unit_ids: retryableUnitIds,
            remaining_unit_ids: remainingUnitIds,
            resume: remainingUnitIds.length > 0,
            message: remainingUnitIds.length > 0
              ? `${unitResults.filter(u => u.success).length}/${requestedUnits.length} units pushed — ${remainingUnitIds.length} still to go`
              : `${unitResults.filter(u => u.success).length}/${requestedUnits.length} standalone units pushed to Rentals United`,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // ── OPT-IN MULTI-UNIT BUILDING FLOW (use_building: true) ──
      // Step 1: Create/update RU Building
      let buildingId = property.rentalsunited_building_id ? parseInt(property.rentalsunited_building_id, 10) : 0;
      // Truncate building name to 20 chars (RU API limit)
      const buildingName = property.name.substring(0, 20);
      // Aggregate room types by name for the Composition block
      const unitTypeMap = new Map<string, number>();
      for (const rt of activeRoomTypes) {
        const rtName = rt.name.toUpperCase();
        unitTypeMap.set(rtName, (unitTypeMap.get(rtName) || 0) + 1);
      }
      const unitTypes = Array.from(unitTypeMap.entries()).map(([name, quantity]) => ({ name, quantity }));
      console.log(`[push-property-to-ru] Step 1: Push building "${buildingName}" (existing ID: ${buildingId}) with ${unitTypes.length} unit types`);

      // Building de-duplication: when we have no stored BuildingID, adopt an existing
      // RU building with the same (truncated) name instead of creating another one.
      if (buildingId === 0) {
        const { data: listed } = await supabase.functions.invoke('rentalsunited-api', {
          body: { action: 'list_buildings', ...childAuthPayload },
        });
        const match = (listed?.buildings ?? []).find(
          (b: any) => String(b?.name ?? '').trim().toUpperCase() === buildingName.trim().toUpperCase(),
        );
        const matchedId = parseInt(String(match?.id ?? match?.building_id ?? '0'), 10);
        if (matchedId > 0) {
          buildingId = matchedId;
          console.log(`[push-property-to-ru] Adopted existing RU building "${buildingName}" → ${buildingId}`);
        }
      }

      const requestedBuildingId = buildingId;
      // `create` is only ever true when the caller explicitly opted into buildings AND no
      // container exists yet — the adapter refuses any other creation attempt.
      const { data: buildingResult, error: buildingErr } = await supabase.functions.invoke('rentalsunited-api', {
        body: { action: 'push_building', building_name: buildingName, building_id: buildingId, create: buildingId === 0, unit_types: unitTypes, ...childAuthPayload },
      });

      if (buildingErr || !buildingResult?.success) {
        const errMsg = buildingErr?.message || buildingResult?.error?.message || 'Unknown error';
        const errCode = buildingResult?.error?.code || 'BUILDING_FAILED';
        console.error('[push-property-to-ru] Building push failed:', errCode, errMsg);
        return new Response(
          JSON.stringify({ success: false, error: { code: errCode, message: errMsg }, diagnostics: buildingResult?.diagnostics }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      if (buildingResult.building_id) {
        const returnedBuildingId = parseInt(String(buildingResult.building_id), 10);
        if (requestedBuildingId > 0 && returnedBuildingId > 0 && returnedBuildingId !== requestedBuildingId) {
          // RU created a DUPLICATE building instead of updating ours. Surface it loudly instead
          // of silently discarding the returned ID — silent discards are what let 20+ duplicate
          // containers accumulate unnoticed in the white-label portal.
          console.error(
            `[push-property-to-ru] RU created duplicate building ${returnedBuildingId} while updating ${requestedBuildingId}`,
          );
          await supabase.from('ru_sync_runs').insert({
            batch_id: crypto.randomUUID(),
            property_id,
            action: 'building_push',
            success: false,
            error_code: 'RU_BUILDING_DUPLICATE',
            error_message: `Rentals United created building ${returnedBuildingId} instead of updating ${requestedBuildingId}`,
            details: { ru_owner_id: ruOwnerId, requested_building_id: requestedBuildingId, returned_building_id: returnedBuildingId, building_name: buildingName },
          });
          return new Response(
            JSON.stringify({
              success: false,
              error: {
                code: 'RU_BUILDING_DUPLICATE',
                message: `Rentals United created a new building (${returnedBuildingId}) instead of updating ${requestedBuildingId}. Push aborted — remove the duplicate in the RU portal, or push units standalone (the default).`,
              },
              requested_building_id: requestedBuildingId,
              returned_building_id: returnedBuildingId,
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          );
        } else if (returnedBuildingId > 0) {
          buildingId = returnedBuildingId;
          await supabase.from('properties').update({ rentalsunited_building_id: String(buildingId) }).eq('id', property_id);
          console.log(`[push-property-to-ru] Building ID saved: ${buildingId}`);
        }
      }

      // Capture per-unit-type ObjectTypeIDs returned by RU's UnitsComposition.
      // These are required as <ObjectTypeID> on each unit's Push_PutProperty_RQ when <BuildingID> is set.
      const unitTypeObjectIds: { name: string; object_type_id: number }[] = Array.isArray(buildingResult?.unit_type_object_ids)
        ? buildingResult.unit_type_object_ids
        : [];
      const objectTypeIdByName = new Map<string, number>();
      for (const ut of unitTypeObjectIds) {
        if (ut?.name && Number.isFinite(ut.object_type_id)) {
          objectTypeIdByName.set(ut.name.trim().toUpperCase(), ut.object_type_id);
        }
      }
      console.log(`[push-property-to-ru] Captured ${objectTypeIdByName.size} ObjectTypeIDs from building composition: ${JSON.stringify(Array.from(objectTypeIdByName.entries()))}`);

      // Persist building + ObjectTypeID mapping to pms_mappings for re-use and audit
      if (buildingId > 0) {
        try {
          await supabase.from('pms_mappings').upsert({
            property_id,
            mapping_type: 'field_mappings',
            system_type: 'rentals_united',
            external_id: String(buildingId),
            metadata: {
              mapping_kind: 'building',
              authority: 'rentals_united',
              building_id: buildingId,
              building_name: buildingName,
              unit_type_object_ids: unitTypeObjectIds,
              updated_at: new Date().toISOString(),
            },
          }, { onConflict: 'property_id,system_type,mapping_type,external_id' });
        } catch (mapErr) {
          console.warn('[push-property-to-ru] Failed to persist pms_mappings:', mapErr instanceof Error ? mapErr.message : mapErr);
        }
      }

      // Step 2: Push each unit as an individual RU property
      // Optional filter: only_unit_ids restricts the per-unit push (building still updated above
      // with full composition so existing RUIDs remain valid). Used for retry of stuck units.
      const unitsToPush = Array.isArray(only_unit_ids) && only_unit_ids.length > 0
        ? activeRoomTypes.filter(rt => only_unit_ids.includes(rt.id))
        : activeRoomTypes;
      console.log(`[push-property-to-ru] Step 2: pushing ${unitsToPush.length}/${activeRoomTypes.length} units${only_unit_ids ? ' (filtered)' : ''}`);
      const unitResults: any[] = [];
      for (const unit of unitsToPush) {
        const existingUnitRuId = unit.rentalsunited_property_id ? parseInt(unit.rentalsunited_property_id, 10) : 0;
        const unitPayload = { ...buildUnitPayload(property as PropertyRow, unit, locationId, buildingId, currencyId, propertyCharges), distances: propertyDistances };
        const unitImageIssues = await applyImageVerification(unitPayload as unknown as Record<string, any>);
        if (unitImageIssues.length > 0) {
          console.warn(`[push-property-to-ru] Unit "${unit.name}": dropped ${unitImageIssues.length} image(s) Rentals United would reject`, unitImageIssues.map(i => i.reason));
        }
        unitPayload.owner_id = ruOwnerId;

        // Attach the building's ObjectTypeID for this unit's name (required when BuildingID is set).
        // RU's Push_PutBuilding_RS does NOT return UnitsComposition IDs and Pull_GetBuilding_RQ is
        // not implemented on most accounts — so composition-based lookup will frequently miss.
        // Fallback: reuse the unit's resolved property_type_id (e.g. 12=Chalet, 1=Apartment) as
        // the ObjectTypeID. RU accepts this when the building has no enforced composition.
        const compObjTypeId = objectTypeIdByName.get(unit.name.trim().toUpperCase());
        const objTypeId = compObjTypeId ?? unitPayload.listing_type_id;
        unitPayload.object_type_id = objTypeId;
        if (!compObjTypeId) {
          console.log(`[push-property-to-ru] No composition match for "${unit.name}" — falling back to property_type_id=${objTypeId}`);
        }

        console.log(`[push-property-to-ru] Step 2: Pushing unit "${unit.name}" (existing RU ID: ${existingUnitRuId}, building: ${buildingId}, object_type_id: ${objTypeId})`);

        // Transport-level invoke failures ("Failed to send a request to the Edge Function",
        // worker cold-boot) used to fail a whole unit push on the first hiccup — retry those.
        const unitAttempt = await invokeRuWithRetry(
          supabase,
          { action: 'push_property', ru_property_id: existingUnitRuId, property: unitPayload, ...childAuthPayload },
          { label: `push_property unit ${unit.name}` },
        );
        let pushResult: any = unitAttempt.data;
        let pushErr: { message: string } | null = unitAttempt.ok
          ? null
          : { message: unitAttempt.message || 'Unknown error' };

        // Stale RU ID recovery: a stored unit ID can point at a property that no longer
        // exists under this owner (account recreated / unit deleted in RU). RU answers
        // "Property does not exist." — drop the stale ID and re-push as a fresh create.
        const staleIdError = /property does not exist/i.test(
          String(pushErr?.message || pushResult?.error?.message || ''),
        );
        if (existingUnitRuId > 0 && (pushErr || !pushResult?.success) && staleIdError) {
          console.warn(`[push-property-to-ru] Stale RU ID ${existingUnitRuId} for unit "${unit.name}" — recreating`);
          await supabase.from('hostfully_room_types').update({ rentalsunited_property_id: null }).eq('id', unit.id);
          const retry = await supabase.functions.invoke('rentalsunited-api', {
            body: { action: 'push_property', ru_property_id: 0, property: unitPayload, ...childAuthPayload },
          });
          pushResult = retry.data;
          pushErr = retry.error;
        }

        if (pushErr || !pushResult?.success) {
          const errMsg = pushErr?.message || pushResult?.error?.message || 'Unknown error';
          const adoptionUnverified = pushResult?.error?.code === 'RU_ADOPTION_UNVERIFIED'
            || /RU_ADOPTION_UNVERIFIED/.test(errMsg);
          console.error(`[push-property-to-ru] Unit "${unit.name}" push ${adoptionUnverified ? 'deferred' : 'failed'}:`, errMsg);
          unitResults.push({
            name: unit.name,
            room_type_id: unit.id,
            success: false,
            ...(adoptionUnverified ? { deferred: true, transport_failure: true } : {}),
            error: adoptionUnverified ? `Not pushed yet — ${errMsg}` : errMsg,
            diagnostics: pushResult?.diagnostics,
          });
          continue;
        }


        // Extract and save RU property ID for this unit. A stale ID was cleared above,
        // so never fall back to it — the retry create returns the real new ID.
        let unitRuId = existingUnitRuId > 0 && !staleIdError ? String(existingUnitRuId) : null;
        if (pushResult.raw_xml) {
          const extracted = extractRUPropertyId(pushResult.raw_xml);
          if (extracted) unitRuId = extracted;
        }
        // The adapter may have adopted (and reactivated) an existing listing instead of creating.
        if (pushResult.ru_property_id) unitRuId = String(pushResult.ru_property_id);


        if (unitRuId) {
          await supabase.from('hostfully_room_types').update({ rentalsunited_property_id: unitRuId }).eq('id', unit.id);
          console.log(`[push-property-to-ru] Saved RU ID ${unitRuId} for unit "${unit.name}"`);
        }

        // Step 3 & 4: Push ARI for this unit
        const ruIdNum = parseInt(unitRuId || '0', 10);
        if (ruIdNum > 0) {
          console.log(`[push-property-to-ru] Pushing ARI for unit "${unit.name}" (RU ID: ${ruIdNum})`);
          const unitCtx = { id: unit.id, name: unit.name, linked_rolos_id: unit.linked_rolos_id, amenities: (unit as any).amenities ?? null };
          let ariResult = await pushARIUnlessStatic(supabase, ruIdNum, property as PropertyRow, 1, unitCtx, childAuthPayload, currencyDecision);

          // RU enforces a per-owner sliding-minute window on write methods. During a
          // multi-unit fan-out a unit can be bounced with a 429 (surfaced as a non-2xx
          // from rentalsunited-api). Back off once and retry that unit rather than
          // recording a failure the next cron run would repeat.
          const paced = (msg?: string) => !!msg && /rate limit|429|sliding minute|too many requests|non-2xx/i.test(msg);
          if (paced(ariResult.availability_error) || paced(ariResult.prices_error)) {
            console.warn(`[push-property-to-ru] Unit "${unit.name}" ARI looks rate limited — backing off 15s and retrying once`);
            await new Promise((r) => setTimeout(r, 15_000));
            const retryAri = await pushARIUnlessStatic(supabase, ruIdNum, property as PropertyRow, 1, unitCtx, childAuthPayload, currencyDecision);
            if (!retryAri.availability_error && !retryAri.prices_error) ariResult = retryAri;
            else ariResult = { ...ariResult, ...retryAri, retried_after_rate_limit: true } as typeof ariResult;
          }

          if (ariResult.availability_error) console.error(`[push-property-to-ru] Availability error for "${unit.name}": ${ariResult.availability_error}`);
          if (ariResult.prices_error) console.error(`[push-property-to-ru] Prices error for "${unit.name}": ${ariResult.prices_error}`);
          unitResults.push({
            name: unit.name,
            room_type_id: unit.id,
            success: !ariResult.availability_error && !ariResult.prices_error,
            rentalsunited_property_id: unitRuId,
            distances_skipped: pushResult?.distances_skipped ?? 0,
            diagnostics: pushResult?.diagnostics,

            ...ariResult,
          });
        } else {
          console.warn(`[push-property-to-ru] Skipping ARI for "${unit.name}" — no valid RU ID`);
          unitResults.push({
            name: unit.name,
            room_type_id: unit.id,
            success: false,
            rentalsunited_property_id: unitRuId,
            diagnostics: pushResult?.diagnostics,
            availability_error: 'Skipped — no valid RU property ID',
            prices_error: 'Skipped — no valid RU property ID',
          });
        }

        // Space consecutive unit writes so the same RU method is not hammered
        // back-to-back within the owner's sliding-minute window.
        await new Promise((r) => setTimeout(r, 900));
      }


      // Building assignment is handled via <BuildingID> in each unit's property push XML — no separate API call needed.

      // Step 5: Push discounts for each unit with a valid RU ID
      const discountRuIds = unitResults
        .filter((u: any) => u.success && u.rentalsunited_property_id)
        .map((u: any) => ({ ruId: parseInt(u.rentalsunited_property_id, 10), roomTypeId: u.room_type_id }));
      const discountResult = await pushDiscountsUnlessStatic(supabase, property_id, discountRuIds, childAuthPayload);

      // Step 6: Read back the currency RU actually holds for one pushed unit. Our own
      // post-flip cache write is an assumption; only Pull_GetProperty is evidence.
      let currencyVerification: Record<string, unknown> | null = null;
      if (!dry_run && discountRuIds.length > 0) {
        const v = await verifyAndRecordCurrency(supabase, {
          propertyId: property_id,
          locationId,
          authoredIso,
          ruPropertyId: discountRuIds[0].ruId,
          childAuth: childAuthPayload,
          ownerScope: String(ruOwnerId),
          decision: currencyDecision,
        });
        currencyVerification = { ...v, expected_iso: currencyDecision?.published_iso ?? authoredIso, ru_property_id: discountRuIds[0].ruId };
        if (!v.matches) {
          console.warn(`[push-property-to-ru] Currency drift: RU reports ${v.ru_reported_iso ?? 'unknown'} for ${discountRuIds[0].ruId} (expected ${currencyDecision?.published_iso ?? authoredIso})`);
        }
      }


      const allUnitsPushed = unitResults.length === unitsToPush.length && unitResults.every((u: any) => u.success);
      const inventoryVerified = allUnitsPushed && unitResults.every((u: any) =>
        u.availability_pushed === true
        && u.prices_pushed === true
        && !u.availability_verification?.error
        && (u.availability_verification?.mismatches?.length ?? 0) === 0
        && !u.prices_verification?.error
        && u.prices_verification?.checked === true
        && (u.prices_verification?.mismatches?.length ?? 0) === 0
        && (u.prices_verification?.missing_dates?.length ?? 0) === 0
        && u.price_coverage_audit?.verdict !== 'unverified'
      );
      await supabase.from('ru_sync_runs').insert({
        batch_id: crypto.randomUUID(),
        property_id,
        action: 'inventory_push',
        success: allUnitsPushed,
        error_code: allUnitsPushed ? null : 'RU_INVENTORY_INCOMPLETE',
        error_message: allUnitsPushed ? null : 'One or more units failed content, availability, or price sync',
        details: { ru_owner_id: ruOwnerId, owner_scope: phaseGate.owner_scope, verified: inventoryVerified, building_id: buildingId, units: unitResults },
      });
      const buildingListingVerification = allUnitsPushed ? await verifyListingsAfterPush(supabase, property_id, req.headers.get('Authorization')) : null;
      return new Response(
        JSON.stringify({
          // Do not report success when RU rejected every unit — the pipeline must not
          // mark phase 3 complete on a building-only push.
          success: allUnitsPushed,
          ...(buildingListingVerification ? { listing_verification: buildingListingVerification } : {}),
          ...(allUnitsPushed ? {} : {
            error: {
              code: 'RU_INVENTORY_INCOMPLETE',
              message: `Rentals United inventory sync failed for ${unitResults.filter((u: any) => !u.success).length} of ${unitResults.length} unit(s)`,
            },
            blockers: unitResults.filter((u: any) => !u.success).map((u: any) => `${u.name}: ${u.error}`),
          }),
          multi_unit: true,
          property_id,
          building_id: buildingId,
          building_diagnostics: buildingResult?.diagnostics || null,
          units: unitResults,
          building_assignment: { success: true, note: 'Units assigned via BuildingID in property XML' },
          ...discountResult,
          currency: currencyDecision
            ? { published_iso: currencyDecision.published_iso, location_iso: currencyDecision.location_iso, flip_outcome: currencyDecision.flip_outcome, owner_scope: String(ruOwnerId) }
            : null,
          currency_verification: currencyVerification,
          message: `Building "${property.name}" + ${unitResults.filter(u => u.success).length}/${activeRoomTypes.length} units pushed to Rentals United`,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── SINGLE PROPERTY FLOW (legacy) ────────────────────────
    const ruPayload = { ...buildSinglePropertyPayload(property as PropertyRow, activeRoomTypes, locationId, currencyId, propertyCharges), distances: propertyDistances };
    ruPayload.owner_id = ruOwnerId;
    const singleImageIssues = await applyImageVerification(ruPayload as unknown as Record<string, any>);
    if (singleImageIssues.length > 0) {
      console.warn(`[push-property-to-ru] Dropped ${singleImageIssues.length} image(s) Rentals United would reject`, singleImageIssues.map(i => i.reason));
    }
    const storedRuId = property.rentalsunited_property_id ? parseInt(property.rentalsunited_property_id, 10) : 0;
    // A stored value equal to the RU OwnerID is a mis-capture, not a listing ID — treat the
    // property as unpushed instead of asking RU to update a listing that cannot exist.
    const existingRuId = storedRuId > 0 && ruOwnerId && storedRuId === Number(ruOwnerId) ? 0 : storedRuId;
    if (storedRuId && !existingRuId) {
      console.warn(`[push-property-to-ru] Stored RU property ID ${storedRuId} equals OwnerID — ignoring as a mis-capture`);
    }

    const singleValidation = buildValidation({ ...(ruPayload as unknown as Record<string, any>), location_authored: locationAuthored });

    if (dry_run) {
      return new Response(
        JSON.stringify({
          success: true, dry_run: true, multi_unit: false, property_id,
          ru_property_id: existingRuId || null,
          gaps: mandatoryGaps([{ name: property.name, validation: singleValidation as any }]),
          validation: singleValidation,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── Readiness gate: no live push while mandatory WL requirements fail ──
    if (!forcePush) {
      // Content rules AND the bookable-window/MinStay rules — the same set the multi-unit
      // gate uses, so a single-unit property cannot slip through a narrower gate.
      const gaps = [
        ...mandatoryGaps([{ name: property.name, validation: singleValidation as any }]),
        ...precomputedGaps,
      ];

      if (gaps.length > 0) {
        return new Response(
          JSON.stringify({
            success: false,
            error: {
              code: 'NOT_READY',
              message: `Property is not ready for Rentals United: ${gaps.length} requirement(s) outstanding.`,
            },
            gaps,
            validation: singleValidation,
          }),
          { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }


    const { data: pushResult, error: pushErr } = await supabase.functions.invoke('rentalsunited-api', {
      body: { action: 'push_property', ru_property_id: existingRuId, property: ruPayload, ...childAuthPayload },
    });

    if (pushErr || !pushResult?.success) {
      return new Response(
        JSON.stringify({ success: false, error: pushResult?.error || { code: 'PUSH_FAILED', message: pushErr?.message || 'Unknown' }, diagnostics: pushResult?.diagnostics }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let ruPropertyId = existingRuId > 0 ? String(existingRuId) : null;
    if (pushResult.raw_xml) {
      const extractedId = extractRUPropertyId(pushResult.raw_xml);
      if (extractedId) ruPropertyId = extractedId;
    }

    if (ruPropertyId) {
      await supabase.from('properties').update({ rentalsunited_property_id: ruPropertyId }).eq('id', property_id);
    }

    const finalRuId = parseInt(ruPropertyId || '0', 10);
    let pushExtras: Record<string, any> = {};
    if (finalRuId > 0) {
      pushExtras = await pushARIUnlessStatic(supabase, finalRuId, property as PropertyRow, activeRoomTypes.length || 1, undefined, childAuthPayload, currencyDecision);
      const discountResult = await pushDiscountsUnlessStatic(supabase, property_id, [{ ruId: finalRuId }], childAuthPayload);
      pushExtras = { ...pushExtras, ...discountResult };
      // Verify the currency RU actually holds for this listing (evidence, not assumption).
      const v = await verifyAndRecordCurrency(supabase, {
        propertyId: property_id,
        locationId,
        authoredIso,
        ruPropertyId: finalRuId,
        childAuth: childAuthPayload,
        ownerScope: String(ruOwnerId),
        decision: currencyDecision,
      });
      pushExtras.currency_verification = { ...v, expected_iso: currencyDecision?.published_iso ?? authoredIso, ru_property_id: finalRuId };
      pushExtras.currency = currencyDecision
        ? { published_iso: currencyDecision.published_iso, location_iso: currencyDecision.location_iso, flip_outcome: currencyDecision.flip_outcome, owner_scope: String(ruOwnerId) }
        : null;
      if (!v.matches) {
        console.warn(`[push-property-to-ru] Currency drift: RU reports ${v.ru_reported_iso ?? 'unknown'} for ${finalRuId} (expected ${currencyDecision?.published_iso ?? authoredIso})`);
      }
    }


    const inventorySuccess = finalRuId > 0 && !pushExtras.availability_error && !pushExtras.prices_error;
    const inventoryVerified = inventorySuccess
      && pushExtras.availability_pushed === true
      && pushExtras.prices_pushed === true
      && !pushExtras.availability_verification?.error
      && (pushExtras.availability_verification?.mismatches?.length ?? 0) === 0
      && !pushExtras.prices_verification?.error
      && pushExtras.prices_verification?.checked === true
      && (pushExtras.prices_verification?.mismatches?.length ?? 0) === 0
      && (pushExtras.prices_verification?.missing_dates?.length ?? 0) === 0
      // An unperformed read-back is not evidence of coverage.
      && pushExtras.price_coverage_audit?.verdict !== 'unverified';
    const exchangeLog = await summarizeRuExchanges(supabase, property_id, runStartedAtIso);
    await supabase.from('ru_sync_runs').insert({
      batch_id: crypto.randomUUID(),
      property_id,
      ru_property_id: ruPropertyId,
      action: 'inventory_push',
      success: inventorySuccess,
      error_code: inventorySuccess ? null : 'RU_INVENTORY_INCOMPLETE',
      error_message: inventorySuccess ? null : String(pushExtras.availability_error || pushExtras.prices_error || 'Inventory push incomplete'),
      details: {
        ru_owner_id: ruOwnerId,
        owner_scope: phaseGate.owner_scope,
        verified: inventoryVerified,
        ari: pushExtras,
        // Links this run to the durable request/response log kept for support cases.
        exchange_log: exchangeLog,
      },
    });


    /**
     * Content quality check on first publish: onboarding must never start without one.
     * Best-effort — a rejection here never fails the push.
     */
    if (inventorySuccess && finalRuId > 0) {
      try {
        const { data: priorOrder } = await supabase
          .from('ru_mcq_orders')
          .select('id')
          .eq('ru_property_id', String(finalRuId))
          .limit(1)
          .maybeSingle();
        if (!priorOrder) {
          const channel = await resolveMcqChannelId(supabase, property_id, null);
          if (channel.channel_id) {
            const { data: mcqResult, error: mcqErr } = await supabase.functions.invoke('rentalsunited-api', {
              body: {
                action: 'order_mcq',
                ru_property_id: finalRuId,
                property_id,
                channel_id: channel.channel_id,
                ...(ruOwnerId ? { owner_id: ruOwnerId } : {}),
              },
            });
            const mcqOk = !mcqErr && (mcqResult as { success?: boolean } | null)?.success === true;
            await supabase.from('ru_mcq_orders').insert({
              property_id,
              ru_property_id: String(finalRuId),
              status: mcqOk ? 'ordered' : 'failed',
              ru_status_id: (mcqResult as any)?.ru_status_id ?? (mcqResult as any)?.error?.ru_status_id ?? null,
              response_preview: JSON.stringify(mcqResult ?? { error: mcqErr?.message }).slice(0, 3000),
            });
          }
        }
      } catch (mcqCatch) {
        console.warn('[push-property-to-ru] MCQ auto-order skipped', mcqCatch);
      }
    }


    const singleListingVerification = inventorySuccess ? await verifyListingsAfterPush(supabase, property_id, req.headers.get('Authorization')) : null;
    return new Response(
      JSON.stringify({ success: inventorySuccess, status: inventorySuccess ? 'complete' : 'failed', ...(!inventorySuccess ? { error: { code: 'RU_INVENTORY_INCOMPLETE', message: 'Property content was sent, but availability or prices did not complete' } } : {}), ...(singleListingVerification ? { listing_verification: singleListingVerification } : {}), property_id, rentalsunited_property_id: ruPropertyId, message: inventorySuccess ? `Property "${property.name}" and inventory pushed to Rentals United successfully` : `Property "${property.name}" content pushed; inventory incomplete`, ...pushExtras }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[push-property-to-ru] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Unknown error' } }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
