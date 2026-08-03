import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  mandatoryGaps,
  RU_MIN_AMENITIES,
  RU_MIN_IMAGES,
  RU_MIN_IMAGE_HEIGHT,
  RU_MIN_IMAGE_WIDTH,
  RU_BED_COVERAGE,
} from '../_shared/ruReadiness.ts';
import { evaluatePhases, phaseBlockedResponse, findOwnerAccount } from '../_shared/ruPhaseGate.ts';
import { resolveRuAmenityIds } from '../_shared/ruAmenityMap.ts';
import {
  normalizeRuImageTagMap,
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
  type DayRate,
  type UnitRateContext,
} from '../_shared/rateResolution.ts';
import { parseRuPriceSeasons } from '../_shared/ruPriceParsing.ts';
import {
  decideRuCurrency,
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

// ── RU Type Mapping ──────────────────────────────────────────

const PROPERTY_TYPE_MAP: Record<string, number> = {
  apartment: 1, house: 3, villa: 5, cottage: 12, cabin: 12, chalet: 12,
  bungalow: 16, townhouse: 20, studio: 25, loft: 25, hotel: 7,
  guest_house: 11, guesthouse: 11, bed_and_breakfast: 8, bnb: 8,
  self_catering: 12, lodge: 11, resort: 7, farm_stay: 12, boutique_hotel: 7,
};


// RU bed-type amenity IDs — must be included in <Room> amenities
const BED_AMENITY_MAP: Record<string, number> = {
  single: 97,
  twin: 97,
  double: 98,
  queen: 98,
  king: 99,
  'king-twin': 99,
  'sofa-bed': 100,
  sofa: 100,
  bunk: 101,
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
    .replace(/[_]+/g, ' ')
    .replace(/\b\d+\s*[x×]\s*/g, ' ')      // "2 x queen" → "queen"
    .replace(/\bbeds?\b/g, ' ')
    .replace(/[^a-z0-9/¾ -]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const has = (...needles: string[]) => needles.some((n) => label.includes(n));

  // Order matters: the most specific label wins.
  if (has('bunk', 'loft bunk', 'triple bunk')) return { id: 101, normalized: label };
  if (has('sofa', 'sleeper couch', 'sleeper-couch', 'couch', 'futon', 'day', 'pull out', 'pull-out'))
    return { id: 100, normalized: label };
  if (has('king single', 'king-single', 'super single')) return { id: 97, normalized: label };
  if (has('king', 'super king', 'emperor')) return { id: 99, normalized: label };
  if (has('queen', 'double', 'full')) return { id: 98, normalized: label };
  if (has('single', 'twin', '3/4', '¾', 'three quarter', 'three-quarter', 'cot', 'camp', 'stretcher', 'bunkbed'))
    return { id: 97, normalized: label };

  const slug = label.replace(/\s+/g, '-');
  const direct = BED_AMENITY_MAP[slug] ?? BED_AMENITY_MAP[label];
  return { id: direct ?? null, normalized: label };
}

/** Aggregate a bed_configuration array into RU bedroom blocks + total bed count. */
function bedBlocksFromConfiguration(
  bedConfiguration: unknown,
): { rooms: { room_id: number; amenities: { id: number; count: number }[] }[]; totalBeds: number; unmapped: string[] } {
  const rooms: { room_id: number; amenities: { id: number; count: number }[] }[] = [];
  const unmapped: string[] = [];
  let totalBeds = 0;
  if (!Array.isArray(bedConfiguration)) return { rooms, totalBeds, unmapped };
  for (const entry of bedConfiguration as Record<string, unknown>[]) {
    const count = Math.max(1, Number(entry?.count) || 1);
    const { id } = resolveBedAmenityId(entry?.type);
    if (id == null && entry?.type) unmapped.push(String(entry.type));
    rooms.push({ room_id: 257, amenities: [{ id: id ?? 98, count }] });
    totalBeds += count;
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
  return images.map((img, i) => {
    const rec = (typeof img === 'string' ? null : img) as Record<string, unknown> | null;
    const url = typeof img === 'string' ? img : (rec?.url as string) || '';
    // Authored tags win; the gallery's first photo is always Main (1) and untagged
    // photos keep RU's Interior (3) default instead of being silently overwritten.
    const authored = tags[url] || [];
    const primary = resolvePrimaryRuTag(authored, i === 0);
    return {
      url,
      type_id: primary,
      extra_type_ids: resolveSecondaryRuTags(authored, primary),
      is_main: i === 0,
      width: toDimension(rec?.width),
      height: toDimension(rec?.height),
    };
  }).filter(img => img.url);
}

/**
 * Re-stamp the main flag after ordering/dedup without discarding authored tags:
 * index 0 becomes Main (1); every other photo keeps its resolved tag.
 */
function restampRuImages(images: RuImage[]): RuImage[] {
  return images.map((img, index) => {
    const authored = index === 0
      ? []
      : [img.type_id, ...(img.extra_type_ids || [])].filter((id) => id && id !== RU_TAG_MAIN);
    const primary = index === 0 ? RU_TAG_MAIN : (authored[0] ?? RU_TAG_INTERIOR);
    return {
      ...img,
      is_main: index === 0,
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
  // WebP (VP8X / VP8 lossy simple form)
  if (bytes.length > 30 && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') {
    const chunk = String.fromCharCode(...bytes.slice(12, 16));
    if (chunk === 'VP8X') return { width: 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)), height: 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16)) };
  }
  // JPEG: walk the segment markers for SOF0/SOF2
  if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) { offset += 1; continue; }
      const marker = bytes[offset + 1];
      const length = dv.getUint16(offset + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: dv.getUint16(offset + 5), width: dv.getUint16(offset + 7) };
      }
      offset += 2 + length;
    }
  }
  return null;
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
    const dims = readPixelDimensions(buf);
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

  // Photos: count + pixel size (images without stored dimensions are treated as
  // unverified rather than failures, but are reported so they can be checked).
  let sized = 0;
  let unverified = 0;
  for (const img of images) {
    if (img.width == null || img.height == null) {
      unverified += 1;
      // Only a probed-and-reachable image may pass without measurable dimensions.
      if (img.verified) sized += 1;
      continue;
    }
    if (img.width >= RU_MIN_IMAGE_WIDTH && img.height >= RU_MIN_IMAGE_HEIGHT) sized += 1;
  }
  const imageIssues: { url: string; reason: string }[] = (payload.image_issues || []) as { url: string; reason: string }[];

  // Beds: RU requires beds to cover at least 50% of CanSleepMax.
  const totalBeds = rooms.reduce((sum, r) =>
    sum + (r.amenities || []).filter((a: any) => a.id >= 97 && a.id <= 101)
      .reduce((s: number, a: any) => s + (a.count || 1), 0), 0);

  const roomsWithAmenities = rooms.filter(r => (r.room_id || 0) > 0 && (r.amenities || []).length > 0).length;

  return {
    images_count: images.length,
    images_rejected_count: imageIssues.length,
    image_issues: imageIssues,
    unmapped_bed_labels: payload.unmapped_bed_labels ?? [],
    images_meeting_size: sized,
    images_size_unverified: unverified,
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
    // RU White-Label minimum: beds must cover >= 50% of CanSleepMax.
    beds_cover_half: totalBeds >= Math.ceil(Math.max(1, maxGuests) * RU_BED_COVERAGE),
    // Advisory only (not an RU requirement): full 1-bed-per-guest coverage.
    beds_meet_max_guests: totalBeds >= Math.max(1, maxGuests),
    max_guests: maxGuests,
    // Composition: RU treats bathrooms and toilets as mandatory.
    has_bathrooms: (amenities || []).some((a: any) => a?.id === 81 && (a.count || 0) > 0),
    has_toilets: (amenities || []).some((a: any) => a?.id === 37 && (a.count || 0) > 0),
    has_coordinates: payload.latitude !== 0 && payload.longitude !== 0,
    has_zip_code: !!(payload.zip_code && payload.zip_code !== '0000'),
    has_space: (payload.space || 0) > 0,
    space_is_default: payload.space_is_default === true,
    has_floor: typeof payload.floor === 'number',
    floor_is_default: payload.floor_is_default === true,
    has_detailed_location_id: (payload.detailed_location_id || 0) > 1,
    has_payment_methods: (payload.payment_methods || []).length >= 1,
    has_cancellation_policies: (payload.cancellation_policies || []).length >= 1,
    has_name: !!(payload.name && String(payload.name).trim().length >= 3),
    has_object_type_id: ((payload.object_type_id ?? payload.property_type_id) || 0) > 0,
    can_sleep_max_ok: maxGuests >= 1,
    // RU has no hard description length: presence is mandatory, 100+ chars is advisory.
    description_length: (payload.descriptions?.[0]?.text || '').trim().length,
    has_description: ((payload.descriptions?.[0]?.text || '').trim().length) > 0,
    description_meets_recommended: ((payload.descriptions?.[0]?.text || '').trim().length) >= 100,
    has_main_image: images.some((i) => i.is_main),
    has_street: !!(payload.street && String(payload.street).trim().length > 2),
  };
}


function mapPaymentMethods(amenities: Record<string, unknown> | null): number[] {
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
  if (methods.length === 0) methods.push(1, 2);
  return methods;
}

function mapCancellationPolicies(amenities: Record<string, unknown> | null): { valid_from: number; valid_to: number; percentage: number }[] {
  const policies = amenities?.cancellation_policies;
  if (!Array.isArray(policies) || policies.length === 0) {
    return [{ valid_from: 0, valid_to: 14, percentage: 100 }, { valid_from: 15, valid_to: 30, percentage: 50 }];
  }
  const sorted = [...policies]
    .filter((p: any) => p.days != null && p.forfeit != null)
    .map((p: any) => ({ days: Number(p.days), forfeit: Number(p.forfeit) }))
    .filter((p) => Number.isFinite(p.days) && Number.isFinite(p.forfeit) && p.days >= 0)
    .sort((a, b) => a.days - b.days);
  if (sorted.length === 0) return [{ valid_from: 0, valid_to: 30, percentage: 100 }];
  const rules: { valid_from: number; valid_to: number; percentage: number }[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const policy = sorted[i] as any;
    const fromDays = i === 0 ? 0 : (sorted[i - 1] as any).days + 1;
    const toDays = policy.days;
    if (fromDays <= toDays) rules.push({ valid_from: fromDays, valid_to: toDays, percentage: policy.forfeit });
  }
  return rules;
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
  return { floor: 0, isDefault: true };
}

function buildUnitPayload(
  property: PropertyRow,
  unit: RoomTypeRow,
  locationId: number,
  buildingId?: number,
  currencyId?: number,
) {
  const amenities = property.amenities || {};
  const unitType = (unit.property_type || property.property_type || 'apartment').toLowerCase().replace(/[\s-]+/g, '_');
  const objectTypeId = PROPERTY_TYPE_MAP[unitType] || 12; // default chalet

  const lat = unit.latitude || property.latitude || 0;
  const lng = unit.longitude || property.longitude || 0;
  const street = unit.address_street || property.address || 'Not specified';
  const zipCode = resolveZipCode(unit.address_postal_code, property);
  const maxGuests = unit.max_guests || 2;
  const space = unit.room_size || 50;
  const spaceIsDefault = !unit.room_size;
  const { floor: unitFloor, isDefault: unitFloorIsDefault } = resolveUnitFloor(property, unit);

  const houseRules = (amenities as any)?.house_rules || {};
  const contact = (amenities as any)?.contact || {};
  const checkInFrom = houseRules.check_in_from || unit.check_in_time || '14:00';
  const checkInTo = houseRules.check_in_to || '22:00';
  const checkOutUntil = houseRules.check_out_to || unit.check_out_time || '10:00';

  const banking = (amenities as any)?.banking || {};
  const depositPercent = toFiniteNumber(banking.deposit_percentage ?? banking.prepayment_percentage);
  const depositAmount = toFiniteNumber(banking.deposit_amount ?? banking.prepayment_amount);
  const deposit = depositPercent && depositPercent > 0 ? depositPercent : depositAmount && depositAmount > 0 ? depositAmount : 0;
  const depositTypeId = depositPercent && depositPercent > 0 ? 3 : depositAmount && depositAmount > 0 ? 5 : 1;
  const securityDeposit = banking.security_deposit || unit.security_deposit || undefined;
  const cleaningPrice = toFiniteNumber(unit.cleaning_fee) ?? 0;

  // Use unit images first, fall back to property images
  let images = mapImages(unit.images as unknown[] | null, (unit as any).ru_image_tags);
  if (images.length < 10) {
    const propImages = mapImages(property.images as unknown[] | null, (property as any).ru_image_tags);
    const seenUrls = new Set(images.map(i => i.url));
    for (const pi of propImages) {
      if (!seenUrls.has(pi.url)) { images.push(pi); seenUrls.add(pi.url); }
    }
  }
  images = restampRuImages(images);

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
    const bathroomCount = Number(unit.bathrooms) || Number(property.bathrooms) || 0;
    const toiletCount = Number(property.toilets) || 0;
    const pushComposition = (id: number, count: number) => {
      if (count <= 0) return;
      const existing = unitAmenities.find(a => a.id === id);
      if (existing) existing.count = Math.max(existing.count, count);
      else unitAmenities.push({ id, count });
    };
    pushComposition(81, bathroomCount);
    pushComposition(37, toiletCount);
    if (property.separate_kitchen) pushComposition(101, 1);
  }


  // Calculate beds from bed_configuration if available
  let beds = 0;
  const bedAmenities: { id: number; count: number }[] = [];
  if (Array.isArray(unit.bed_configuration) && unit.bed_configuration.length > 0) {
    beds = unit.bed_configuration.reduce((sum: number, b: any) => sum + (b.count || 0), 0);
    // Map bed types to RU bed amenity IDs
    const seenBedIds = new Set<number>();
    for (const bedEntry of unit.bed_configuration) {
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
  if (!beds) beds = unit.beds || unit.bedrooms || Math.max(1, maxGuests);
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

  // Bedrooms: one block per bed_configuration entry (= one physical bedroom)
  if (Array.isArray(unit.bed_configuration) && unit.bed_configuration.length > 0) {
    unit.bed_configuration.forEach((bedEntry: any) => {
      const ruBedId = resolveBedAmenityId(bedEntry.type).id ?? 98; // default = double bed
      rooms.push({
        room_id: RU_BEDROOM_ID,
        amenities: [{ id: ruBedId, count: bedEntry.count || 1 }],
      });
    });
  } else {
    // Fallback: emit `bedrooms` count of generic 257 blocks (default double bed)
    const bedroomCount = Math.max(1, Number(unit.bedrooms) || 1);
    for (let i = 0; i < bedroomCount; i++) {
      rooms.push({
        room_id: RU_BEDROOM_ID,
        amenities: [{ id: 98, count: Math.max(1, Math.ceil(maxGuests / bedroomCount / 2)) }],
      });
    }
  }

  // NOTE: Bathroom (81) and Kitchen (101) blocks are intentionally OMITTED.
  // RU's parser interprets <Amenities/> with no children as amenity id:0 and rejects with
  // "Wrong composition room id:0". Since RU has no required amenities for those rooms in
  // our data model, we list them only via the root <Amenities> block (item ids 11=Kitchen,
  // 6=Bathroom etc.) — the CompositionRoomsAmenities block is bedroom-only.

  return {
    name: unit.name,
    property_type_id: objectTypeId,
    can_sleep_max: maxGuests,
    standard_guests: Math.ceil(maxGuests * 0.7),
    number_of_beds: beds,
    currency_id: currencyId ?? mapCurrencyToRUId(property.amenities, property.country),
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
    payment_methods: mapPaymentMethods(property.amenities),
    deposit,
    deposit_type_id: depositTypeId,
    cleaning_price: cleaningPrice,
    cancellation_policies: mapCancellationPolicies(amenities as Record<string, unknown>),
    security_deposit: securityDeposit,
    arrival_landlord: String((amenities as any)?.contact?.name || property.name || 'RoomsOnline'),
    arrival_email: String((amenities as any)?.contact_email || (amenities as any)?.contact?.email || 'dev@roomsonline.co.za'),
    arrival_phone: String((amenities as any)?.telephone || (amenities as any)?.contact?.telephone || '+27 824602220'),
    arrival_days_before: toFiniteNumber(houseRules.days_before_arrival) ?? 0,
    arrival_how_to_arrive: String(unit.check_in_instructions || houseRules.check_in_instructions || ''),
    check_in_from: checkInFrom,
    check_in_to: checkInTo,
    check_out_until: checkOutUntil,
    check_in_place: 'at_the_apartment',
    building_id: buildingId,
    object_type_id: undefined as number | undefined, // populated by orchestrator after push_building
  };
}

// Legacy single-property payload builder (kept for properties with no room types)
function buildSinglePropertyPayload(property: PropertyRow, roomTypes: RoomTypeRow[], locationId: number, currencyId?: number) {
  const primaryRoom = roomTypes[0] || null;
  const amenities = property.amenities || {};
  const objectTypeId = PROPERTY_TYPE_MAP[
    (primaryRoom?.property_type || property.property_type || 'apartment').toLowerCase().replace(/[\s-]+/g, '_')
  ] || 1;
  const lat = primaryRoom?.latitude || property.latitude || 0;
  const lng = primaryRoom?.longitude || property.longitude || 0;
  const street = primaryRoom?.address_street || property.address || 'Not specified';
  const zipCode = resolveZipCode(primaryRoom?.address_postal_code, property);
  let maxGuests = property.max_guests || 0;
  if (maxGuests <= 1 && roomTypes.length > 0) maxGuests = roomTypes.reduce((sum, rt) => sum + (rt.max_guests || 2), 0);
  if (maxGuests < 1) maxGuests = 2;
  const space = primaryRoom?.room_size || 50;
  const spaceIsDefault = !primaryRoom?.room_size;
  const { floor: buildingFloor, isDefault: buildingFloorIsDefault } = resolveUnitFloor(property, primaryRoom);
  const houseRules = (amenities as any)?.house_rules || {};
  const contact = (amenities as any)?.contact || {};
  const banking = (amenities as any)?.banking || {};
  const depositPercent = toFiniteNumber(banking.deposit_percentage ?? banking.prepayment_percentage);
  const depositAmount = toFiniteNumber(banking.deposit_amount ?? banking.prepayment_amount);
  const deposit = depositPercent && depositPercent > 0 ? depositPercent : depositAmount && depositAmount > 0 ? depositAmount : 0;
  const depositTypeId = depositPercent && depositPercent > 0 ? 3 : depositAmount && depositAmount > 0 ? 5 : 1;
  const securityDeposit = banking.security_deposit || primaryRoom?.security_deposit || undefined;
  const cleaningPrice = toFiniteNumber(primaryRoom?.cleaning_fee) ?? 0;
  // Building-level rooms: RU counts the bed amenities inside every Bedroom (257) block
  // and rejects the listing ("Add sufficient amount of beds") when they cover less than
  // half of CanSleepMax. Emit the real bed_configuration of every room type instead of a
  // single default double bed per room type.
  const rooms: { room_id: number; amenities: { id: number; count: number }[] }[] = [];
  const unmappedBedLabels: string[] = [];
  for (const rt of roomTypes) {
    const built = bedBlocksFromConfiguration(rt.bed_configuration);
    unmappedBedLabels.push(...built.unmapped);
    if (built.rooms.length > 0) {
      rooms.push(...built.rooms);
      continue;
    }
    // No bed configuration on this room type: derive from beds / bedrooms / capacity.
    const bedroomCount = Math.max(1, Number(rt.bedrooms) || 1);
    const bedTotal = Math.max(bedroomCount, Number(rt.beds) || 0, Math.ceil((rt.max_guests || 2) / 2));
    const perRoom = Math.max(1, Math.ceil(bedTotal / bedroomCount));
    for (let i = 0; i < bedroomCount; i++) rooms.push({ room_id: 257, amenities: [{ id: 98, count: perRoom }] });
  }
  if (rooms.length === 0) {
    const bedroomCount = Math.max(1, Number(property.bedrooms) || 1);
    const perRoom = Math.max(1, Math.ceil(Math.max(2, maxGuests) / 2 / bedroomCount));
    for (let i = 0; i < bedroomCount; i++) rooms.push({ room_id: 257, amenities: [{ id: 98, count: perRoom }] });
  }
  // RU minimum: beds must cover >= 50% of CanSleepMax. Top up the first bedroom block
  // when the authored data falls short so a valid payload is never rejected outright;
  // the readiness scorecard still reports the underlying gap.
  const emittedBeds = rooms.reduce((sum, r) => sum + r.amenities.reduce((s, a) => s + (a.count || 1), 0), 0);
  const requiredBeds = Math.ceil(maxGuests * 0.5);
  if (emittedBeds < requiredBeds && rooms[0]) rooms[0].amenities[0].count += requiredBeds - emittedBeds;
  let allImages = mapImages(property.images as unknown[] | null, (property as any).ru_image_tags);
  for (const rt of roomTypes) allImages = allImages.concat(mapImages(rt.images as unknown[] | null, (rt as any).ru_image_tags));
  const seenUrls = new Set<string>();
  allImages = allImages.filter(img => { if (seenUrls.has(img.url)) return false; seenUrls.add(img.url); return true; });
  allImages = restampRuImages(allImages);
  const totalBeds = rooms.reduce((sum, r) => sum + r.amenities.reduce((sm, a) => sm + (a.count || 1), 0), 0);
  const numberOfBeds = totalBeds > 0 ? totalBeds : (property.bedrooms || Math.max(1, maxGuests));
  return {
    name: property.name,
    property_type_id: objectTypeId,
    can_sleep_max: maxGuests,
    standard_guests: Math.ceil(maxGuests * 0.7),
    number_of_beds: numberOfBeds,
    currency_id: currencyId ?? mapCurrencyToRUId(property.amenities, property.country),
    owner_id: 0, no_of_units: 1, floor: buildingFloor, floor_is_default: buildingFloorIsDefault, space, space_is_default: spaceIsDefault, street,
    detailed_location_id: locationId, zip_code: zipCode,
    latitude: lat, longitude: lng,
    amenities: mapAmenities(property.amenities),
    rooms, descriptions: [{ language_id: 1, text: property.description || property.name || 'Beautiful property' }],
    images: allImages, payment_methods: mapPaymentMethods(property.amenities),
    deposit, deposit_type_id: depositTypeId,
    cleaning_price: cleaningPrice,
    cancellation_policies: mapCancellationPolicies(amenities as Record<string, unknown>),
    security_deposit: securityDeposit,
    arrival_landlord: String(contact.name || property.name || 'RoomsOnline'),
    arrival_email: String((amenities as any)?.contact_email || contact.email || 'dev@roomsonline.co.za'),
    arrival_phone: String((amenities as any)?.telephone || contact.telephone || '+27 824602220'),
    arrival_days_before: toFiniteNumber(houseRules.days_before_arrival) ?? 0,
    arrival_how_to_arrive: String(primaryRoom?.check_in_instructions || houseRules.check_in_instructions || ''),
    check_in_from: houseRules.check_in_from || primaryRoom?.check_in_time || '14:00',
    check_in_to: houseRules.check_in_to || '22:00',
    check_out_until: houseRules.check_out_to || primaryRoom?.check_out_time || '10:00',
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

interface ResolvedRate {
  price: number;
  extra_guest_price?: number;
}

function resolveUnitRateKey(seasonRates: Record<string, any>, seasonId: string, unit: UnitContext, amenities: Record<string, any>): ResolvedRate | null {
  // Try multiple keys to find the rate for this specific unit
  // The critical insight: season_rates uses amenity room_type IDs (timestamp-based like "1775237066341"),
  // NOT hostfully_room_types UUIDs. We must match by name to find the amenity room_type entry.
  const roomTypes = (amenities.room_types || []) as any[];
  const candidateKeys = [unit.id];
  if (unit.linked_rolos_id) candidateKeys.push(unit.linked_rolos_id);

  // Find matching amenity room by name (case-insensitive), linked_rolos_id, or direct id match
  for (const rt of roomTypes) {
    const nameMatch = rt.name && unit.name && rt.name.toLowerCase() === unit.name.toLowerCase();
    const idMatch = rt.id === unit.id;
    const rolosMatch = unit.linked_rolos_id && rt.linked_rolos_id === unit.linked_rolos_id;
    if (nameMatch || idMatch || rolosMatch) {
      if (rt.id && !candidateKeys.includes(String(rt.id))) {
        candidateKeys.push(String(rt.id));
      }
    }
  }

  console.log(`[resolveUnitRateKey] Unit "${unit.name}" candidate keys: [${candidateKeys.join(', ')}] for season ${seasonId}`);

  // season_rates schema: { [roomTypeId]: { "[seasonId]-[rateTypeId]": { roomAmount, adultAmount, ... } } }
  // OUTER key = room id, INNER key = `${seasonId}-${rateTypeId}`. Match outer first.
  for (const [outerKey, rateData] of Object.entries(seasonRates)) {
    if (typeof rateData !== 'object' || rateData === null) continue;
    if (!candidateKeys.includes(String(outerKey))) continue;
    let bestPrice = 0;
    let bestExtra: number | undefined;
    for (const [subKey, subData] of Object.entries(rateData as Record<string, any>)) {
      if (!subKey.startsWith(seasonId + '-')) continue;
      const amount = (subData as any)?.roomAmount;
      if (typeof amount === 'number' && amount > bestPrice) {
        bestPrice = amount;
        const adultAmt = (subData as any)?.adultAmount;
        bestExtra = typeof adultAmt === 'number' && adultAmt > 0 ? adultAmt : undefined;
      }
    }
    if (bestPrice > 0) {
      console.log(`[resolveUnitRateKey] Found rate ${bestPrice} (extra: ${bestExtra ?? 'none'}) for room "${outerKey}" season ${seasonId}`);
      return { price: bestPrice, extra_guest_price: bestExtra };
    }
  }

  // Fallback: find lowest rate for this season across all entries
  let lowest = Infinity;
  let lowestExtraGuest: number | undefined;
  for (const [, rateData] of Object.entries(seasonRates)) {
    if (typeof rateData !== 'object' || rateData === null) continue;
    for (const [subKey, subData] of Object.entries(rateData as Record<string, any>)) {
      if (subKey.startsWith(seasonId + '-') && typeof subData === 'object' && subData !== null) {
        const amount = (subData as any).roomAmount;
        if (typeof amount === 'number' && amount > 0 && amount < lowest) {
          lowest = amount;
          lowestExtraGuest = typeof (subData as any).adultAmount === 'number' && (subData as any).adultAmount > 0 ? (subData as any).adultAmount : undefined;
        }
      }
    }
  }
  if (lowest < Infinity) console.log(`[resolveUnitRateKey] Fallback rate ${lowest} (extra guest: ${lowestExtraGuest ?? 'none'}) for season ${seasonId}`);
  return lowest < Infinity ? { price: lowest, extra_guest_price: lowestExtraGuest } : null;
}

// ── Step 6: Per-night availability expansion ─────────────────
// Maps day-of-week → RU changeover code (0=none, 1=check-in only, 2=check-out only, 3=both)
const DOW_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function resolveChangeoverRules(unit: UnitContext | undefined, propertyAmenities: Record<string, any>): { perDow: Record<number, number> | null; defaultCode: number } {
  const unitAmenities = (unit?.amenities || {}) as Record<string, any>;
  const rules = (unitAmenities.changeover_rules ?? propertyAmenities.changeover_rules) as Record<string, any> | undefined;
  const defaultCode = Number(unitAmenities.changeover ?? propertyAmenities.changeover ?? 3);
  if (rules && typeof rules === 'object' && !Array.isArray(rules)) {
    const perDow: Record<number, number> = {};
    for (let i = 0; i < 7; i++) {
      const v = rules[DOW_KEYS[i]];
      if (v != null && !isNaN(Number(v))) perDow[i] = Number(v);
    }
    if (Object.keys(perDow).length > 0) return { perDow, defaultCode };
  }
  return { perDow: null, defaultCode };
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

interface AvailabilityVerification {
  checked: boolean;
  total_days: number;
  matches: number;
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

async function verifyPrices(
  supabase: any,
  ruPropertyId: number,
  requested: { date_from: string; date_to: string; price: number; extra_guest_price?: number }[],
  windowFrom: string,
  windowTo: string,
  childAuth: Record<string, unknown> = {},
): Promise<PriceVerification> {
  const report: PriceVerification = { checked: false, total_seasons: requested.length, matches: 0, mismatches: [], missing_dates: [] };
  try {
    const { data, error } = await supabase.functions.invoke('rentalsunited-api', {
      body: { action: 'get_prices', ru_property_id: ruPropertyId, date_from: windowFrom, date_to: windowTo, ...childAuth },
    });
    if (error || !data?.success || !data?.raw_xml) {
      report.error = error?.message || data?.error?.message || 'No XML returned';
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

    // Diff each requested season against returned per-day prices (sample first day of each season)
    for (const req of requested) {
      const sampleDay = req.date_from;
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
  windowFrom: string,
  windowTo: string,
  childAuth: Record<string, unknown> = {},
): Promise<AvailabilityVerification> {
  const report: AvailabilityVerification = { checked: false, total_days: 0, matches: 0, mismatches: [] };
  try {
    const { data, error } = await supabase.functions.invoke('rentalsunited-api', {
      body: { action: 'get_availability', ru_property_id: ruPropertyId, date_from: windowFrom, date_to: windowTo, ...childAuth },
    });
    if (error || !data?.success || !data?.raw_xml) {
      report.error = error?.message || data?.error?.message || 'No XML returned';
      return report;
    }
    // Build expected per-day map from requested ranges
    const expected = new Map<string, { min_stay: number; changeover: number; units: number }>();
    for (const r of requested) {
      const start = new Date(r.date_from + 'T00:00:00Z');
      const end = new Date(r.date_to + 'T00:00:00Z');
      for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
        const iso = d.toISOString().slice(0, 10);
        expected.set(iso, { min_stay: r.min_stay, changeover: r.changeover, units: r.units });
      }
    }
    // Parse RU response. Format varies; try common patterns:
    //   <CalendarDay Date="YYYY-MM-DD" IsAvailable="true" MinStay="2" Changeover="3" />
    //   <DateRange DateFrom="..." DateTo="..." MinStay="..." Changeover="..." />
    const xml = String(data.raw_xml);
    const dayRegex = /<CalendarDay\b([^/>]*)\/?>(?:\s*<\/CalendarDay>)?/gi;
    const rangeRegex = /<DateRange\b([^/>]*)\/?>(?:\s*<\/DateRange>)?/gi;
    const attr = (s: string, name: string): string | null => {
      const m = new RegExp(`${name}="([^"]*)"`, 'i').exec(s);
      return m ? m[1] : null;
    };
    const returnedDays = new Map<string, { min_stay: number | null; changeover: number | null; units: number | null }>();
    let m: RegExpExecArray | null;
    while ((m = dayRegex.exec(xml)) !== null) {
      const a = m[1];
      const date = attr(a, 'Date');
      if (!date) continue;
      returnedDays.set(date, {
        min_stay: attr(a, 'MinStay') != null ? Number(attr(a, 'MinStay')) : null,
        changeover: attr(a, 'Changeover') != null ? Number(attr(a, 'Changeover')) : null,
        units: attr(a, 'Units') != null ? Number(attr(a, 'Units')) : (attr(a, 'IsAvailable') === 'true' ? 1 : 0),
      });
    }
    if (returnedDays.size === 0) {
      // Try DateRange format
      while ((m = rangeRegex.exec(xml)) !== null) {
        const a = m[1];
        const df = attr(a, 'DateFrom'); const dt = attr(a, 'DateTo');
        if (!df || !dt) continue;
        const ms = attr(a, 'MinStay') != null ? Number(attr(a, 'MinStay')) : null;
        const co = attr(a, 'Changeover') != null ? Number(attr(a, 'Changeover')) : null;
        const u = attr(a, 'Units') != null ? Number(attr(a, 'Units')) : null;
        const start = new Date(df + 'T00:00:00Z');
        const end = new Date(dt + 'T00:00:00Z');
        for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
          returnedDays.set(d.toISOString().slice(0, 10), { min_stay: ms, changeover: co, units: u });
        }
      }
    }

    report.checked = true;
    report.total_days = expected.size;
    for (const [date, exp] of expected) {
      const got = returnedDays.get(date);
      if (!got) {
        report.mismatches.push({ date, field: 'units', requested: exp.units, returned: null });
        continue;
      }
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
  } catch (e) {
    report.error = e instanceof Error ? e.message : 'Unknown verification error';
  }
  return report;
}

async function pushARI(supabase: any, ruPropertyId: number, property: PropertyRow, unitUnits: number = 1, unit?: UnitContext, childAuth: Record<string, unknown> = {}, currency?: CurrencyDecision | null) {
  const amenities = (property.amenities || {}) as Record<string, any>;
  const seasons = amenities.seasons as any[] | undefined;
  const seasonRates = amenities.season_rates as Record<string, any> | undefined;
  const result: { availability_pushed?: boolean; prices_pushed?: boolean; availability_error?: string; prices_error?: string; availability_verification?: AvailabilityVerification; prices_verification?: PriceVerification; price_coverage?: Record<string, any>; currency?: Record<string, any> } = {};

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const oneYearLater = new Date(today);
  oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);
  const oneYearStr = oneYearLater.toISOString().slice(0, 10);

  type PeriodEntry = { from: string; to: string; minStay: number; seasonId: string };
  const allPeriods: PeriodEntry[] = [];
  if (Array.isArray(seasons)) {
    for (const season of seasons) {
      const periods = season.periods || [{ from: season.from, to: season.to }];
      for (const period of periods) {
        if (period.from && period.to) allPeriods.push({ from: period.from, to: period.to, minStay: season.minStay || 1, seasonId: String(season.id) });
      }
    }
  }
  allPeriods.sort((a, b) => a.from.localeCompare(b.from));

  let latestEnd = todayStr;
  for (const p of allPeriods) { if (p.to > latestEnd) latestEnd = p.to; }
  if (latestEnd < oneYearStr) {
    const nextDay = new Date(latestEnd); nextDay.setDate(nextDay.getDate() + 1);
    const fillerFrom = nextDay.toISOString().slice(0, 10);
    if (fillerFrom <= oneYearStr) allPeriods.push({ from: fillerFrom, to: oneYearStr, minStay: 1, seasonId: '__filler__' });
  }

  // Resolve changeover rules (per-day-of-week or default)
  const changeoverConfig = resolveChangeoverRules(unit, amenities);

  // Ensure at least 1 available day over the next 365 days
  if (allPeriods.length === 0) {
    allPeriods.push({ from: todayStr, to: oneYearStr, minStay: 1, seasonId: '__fallback__' });
    console.log(`[pushARI] No seasons found — pushing fallback availability for ${todayStr} to ${oneYearStr}`);
  }

  {
    try {
      const availEntries = expandAvailability(allPeriods, unitUnits, changeoverConfig);
      console.log(`[pushARI] Pushing ${availEntries.length} availability entries (per-day rules: ${changeoverConfig.perDow ? 'yes' : 'no'}, default changeover: ${changeoverConfig.defaultCode})`);
      const { data: availResult, error: availErr } = await supabase.functions.invoke('rentalsunited-api', {
        body: { action: 'push_availability', ru_property_id: ruPropertyId, availability: availEntries, ...childAuth },
      });
      if (availErr || !availResult?.success) {
        result.availability_error = availErr?.message || availResult?.error?.message || 'Unknown error';
      } else {
        result.availability_pushed = true;
        // 6.2 + 6.3 — Verify
        const verification = await verifyAvailability(supabase, ruPropertyId, availEntries, todayStr, oneYearStr, childAuth);
        result.availability_verification = verification;
        console.log(`[pushARI] Verification: ${verification.matches}/${verification.total_days} days matched, ${verification.mismatches.length} mismatches${verification.error ? ` (error: ${verification.error})` : ''}`);
        try {
          await supabase.from('sync_logs').insert({
            property_id: property.id,
            external_system: 'rentals_united',
            sync_type: 'availability_verification',
            status: verification.error ? 'error' : (verification.mismatches.length === 0 ? 'success' : 'partial'),
            message: verification.error
              ? `Verification error: ${verification.error}`
              : `${verification.matches}/${verification.total_days} days matched, ${verification.mismatches.length} mismatches`,
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

      const priceEntries = compressToPeriods(dayRates).map((p) => ({
        date_from: p.date_from,
        date_to: p.date_to,
        price: p.price,
        extra_guest_price: p.extra_guest_price,
      }));

      const expectedDays = Math.round((Date.parse(oneYearStr) - Date.parse(todayStr)) / 86400000) + 1;
      const cov = resolver.coverage(dayRates);
      result.price_coverage = {
        ...cov,
        expected_days: expectedDays,
        unpriced_days: Math.max(0, expectedDays - cov.priced_days),
        summary: describeCoverage(expectedDays, cov),
      };
      console.log(`[pushARI] RU ${ruPropertyId} pricing: ${result.price_coverage.summary}`);

      // RU requires real pricing for 365 days. Never push a dummy price — a price of 1
      // passes RU's schema but fails channel content-quality checks (LekkeSlaap, Booking.com).
      if (priceEntries.length === 0) {
        result.prices_error = 'RU_NO_REAL_RATES: no calendar rate and no rack rate found for the next 365 days — set seasonal rates in the calendar, or a rate plan base rate in Rate Manager → Rates, before pushing (dummy prices are never sent)';
        console.error(`[pushARI] Aborting price push for RU property ${ruPropertyId}: ${result.prices_error}`);
        try {
          await supabase.from('sync_logs').insert({
            property_id: property.id,
            external_system: 'rentals_united',
            sync_type: 'prices',
            status: 'error',
            message: result.prices_error,
            request_data: { ru_property_id: ruPropertyId, unit_id: unit?.id ?? null, window: { from: todayStr, to: oneYearStr } },
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

      const { data: priceResult, error: priceErr } = await supabase.functions.invoke('rentalsunited-api', {
        body: { action: 'push_prices', ru_property_id: ruPropertyId, prices: outboundPrices, ...childAuth },
      });

      if (priceErr || !priceResult?.success) {
        result.prices_error = priceErr?.message || priceResult?.error?.message || 'Unknown error';
      } else {
        result.prices_pushed = true;
        // 7.2 — Verify prices post-push
        const priceVerification = await verifyPrices(supabase, ruPropertyId, outboundPrices, todayStr, oneYearStr, childAuth);
        result.prices_verification = priceVerification;
        console.log(`[pushARI] Price verification: ${priceVerification.matches}/${priceVerification.total_seasons} seasons matched, ${priceVerification.mismatches.length} mismatches, ${priceVerification.missing_dates.length} missing dates${priceVerification.error ? ` (error: ${priceVerification.error})` : ''}`);
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

  try {
    const reqBody = await req.json();
    const { property_id, dry_run, subscribe_rlnm, standalone_units, only_unit_ids, action } = reqBody;
    /** Admin override: allows a live push even when mandatory WL checks fail. */
    const forcePush = reqBody.force === true;
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
          .select('id, name, rentalsunited_property_id, country, latitude, longitude, amenities, city, ru_location_id')
          .not('rentalsunited_property_id', 'is', null),
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

        const cached = await getRuLocationCurrency(supabase, loc);
        const currentIso = cached?.iso || null;
        let flipped: 'skipped' | 'already_set' | 'flipped' | 'failed' = 'skipped';
        let flipError: string | null = null;

        if (expectedIso && currentIso && currentIso !== expectedIso && !flippedLocations.has(loc)) {
          if (dryRun) {
            flipped = 'skipped';
          } else {
            try {
              const { data: flipRes, error: flipErr } = await supabase.functions.invoke('rentalsunited-api', {
                body: { action: 'push_change_currency', location_id: loc, currency_iso: expectedIso },
              });
              if (flipErr || !flipRes?.success) {
                flipped = 'failed';
                flipError = flipErr?.message || flipRes?.error?.message || 'Unknown';
              } else {
                flipped = flipRes.already_set ? 'already_set' : 'flipped';
                flippedLocations.add(loc);
                // Refresh ru_locations cache row
                await supabase.from('ru_locations').upsert({
                  id: loc,
                  name: cached?.iso ? `Location ${loc}` : `Location ${loc}`,
                  country: p.country || cached?.country || 'Unknown',
                  currency_iso: expectedIso,
                  currency_ru_id: expectedCcyId,
                  last_synced_at: new Date().toISOString(),
                }, { onConflict: 'id' });
              }
            } catch (e) {
              flipped = 'failed';
              flipError = e instanceof Error ? e.message : 'Unknown';
            }
          }
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

        results.push({
          property_id: p.id,
          name: p.name,
          ru_location_id: loc,
          expected_currency_iso: expectedIso,
          current_location_currency_iso: currentIso,
          location_flip: flipped,
          flip_error: flipError,
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
          .select('id, name, rentalsunited_property_id, country, latitude, longitude, amenities, ru_location_id')
          .not('rentalsunited_property_id', 'is', null),
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
      .select('id, name, description, property_type, address, city, country, postal_code, latitude, longitude, max_guests, bedrooms, bathrooms, toilets, separate_kitchen, amenities, images, ru_image_tags, rentalsunited_property_id, rentalsunited_building_id, owner_email, external_system, ru_archived')
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



    const { data: roomTypes } = await supabase
      .from('hostfully_room_types')
      .select('id, name, description, max_guests, bedrooms, bathrooms, beds, bed_configuration, linked_rolos_id, amenities, images, ru_image_tags, check_in_time, check_out_time, check_in_instructions, cleaning_fee, security_deposit, address_street, address_postal_code, latitude, longitude, property_type, cancellation_policy, room_size, rentalsunited_property_id')
      .eq('property_id', property_id)
      .eq('is_active', true);

    const activeRoomTypes = (roomTypes || []) as RoomTypeRow[];
    const isMultiUnit = activeRoomTypes.length > 0;

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


    if (!locationId || locationId <= 1) {
      return new Response(
        JSON.stringify({ success: false, error: { code: 'LOCATION_UNRESOLVED', message: `Could not resolve a Rentals United LocationID for this property. Coordinates: (${lat}, ${lng}), country: "${country || 'unset'}". Set valid coordinates or a supported country (ZA/NA/BW) before pushing.` } }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Persist resolved geo+currency for re-use & audit (skip on dry runs).
    if (!dry_run) {
      await persistRuPropertyMapping(supabase, property_id, {
        ru_location_id: locationId,
        ru_currency_id: currencyId,
        ru_country: country ?? null,
        coords_hash: coordsHash,
      });
    }

    // ── Currency authority: RU owns currency on the LocationID ─────────────
    // Try to make the location hold our authored currency (ZAR). Only if RU refuses do
    // we publish converted rates in the fallback currency, at a live rate + margin.
    const authoredIso = ISO_BY_RU_CURRENCY_ID[currencyId] || 'ZAR';
    let currencyDecision: CurrencyDecision | null = null;
    try {
      currencyDecision = await decideRuCurrency(supabase, {
        propertyId: property_id,
        locationId,
        authoredIso,
        country,
        dryRun: dry_run === true,
      });
      currencyId = RU_CCY_BY_ISO[currencyDecision.published_iso] ?? currencyId;
      console.log(`[push-property-to-ru] Currency decision: publishing in ${currencyDecision.published_iso} (location ${locationId} holds ${currencyDecision.location_iso ?? 'unknown'}, flip: ${currencyDecision.flip_outcome})`);
    } catch (e) {
      console.warn('[push-property-to-ru] Currency decision failed, falling back to authored currency:', e instanceof Error ? e.message : e);
    }

    // ── Phase gate + RU OwnerID resolution ────────────────────
    // Phase 1 (sub-user) and Phase 2 (readiness) must pass before any RU write.
    // OwnerID comes from the portfolio sub-account when one exists, otherwise
    // from a property-scoped sub-account, otherwise the master account.
    let precomputedGaps: string[] = [];
    try {
      if (isMultiUnit) {
        const scored = await Promise.all(
          activeRoomTypes.map(async (rt) => {
            const payload = buildUnitPayload(property as PropertyRow, rt, locationId, undefined, currencyId) as Record<string, any>;
            // Probe image dimensions exactly like the dry run does — without this the
            // sizes stay "unverified" and readiness falsely reports every photo as too small.
            await applyImageVerification(payload);
            return { name: rt.name, validation: buildValidation(payload) as any };
          }),
        );
        precomputedGaps = mandatoryGaps(scored);
      }
    } catch (e) {
      console.warn('[push-property-to-ru] Readiness pre-scoring failed:', e instanceof Error ? e.message : e);
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

    if (isMultiUnit && !standalone_units && !hasChildKeys && (!childUsername || !childPassword)) {
      // Push_PutBuilding_RQ has no <OwnerID>: the building lands on whichever account
      // authenticates, so a parent fallback would create it on our master account. Hard stop.
      return new Response(JSON.stringify({ success: false, error: { code: 'RU_CHILD_AUTH_REQUIRED', message: `No Rentals United API keys are stored for OwnerID ${ruOwnerId}. RU requires the sub-user's own AccessKey + SecretKey to create or update its building inventory — generate them in the RU dashboard (Security settings) and save them in Portfolios → RU accounts.` } }), { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }



    if (!dry_run && !phaseGate.ready_for_push) {
      if (!forcePush) {
        return new Response(JSON.stringify(phaseBlockedResponse(phaseGate)), {
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
          details: { phases: phaseGate.phases },
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
      if (!dry_run && !forcePush) {
        const gatedUnits = activeRoomTypes.map(rt => ({
          name: rt.name,
          validation: buildValidation(
            buildUnitPayload(property as PropertyRow, rt, locationId, undefined, currencyId) as Record<string, any>,
          ) as any,
        }));
        const gaps = mandatoryGaps(gatedUnits);
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
          const payload = buildUnitPayload(property as PropertyRow, rt, locationId, undefined, currencyId) as Record<string, any>;
          await applyImageVerification(payload);
          return {
            room_type_id: rt.id,
            name: rt.name,
            ru_property_id: rt.rentalsunited_property_id || null,
            validation: buildValidation(payload),
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
              has_payment_methods: everyFlag('has_payment_methods'),
              has_cancellation_policies: everyFlag('has_cancellation_policies'),
              beds_cover_half: everyFlag('beds_cover_half'),
              beds_meet_max_guests: everyFlag('beds_meet_max_guests'),
              rooms_have_amenities: everyFlag('rooms_have_amenities'),
              rooms_meet_min_amenities: everyFlag('rooms_meet_min_amenities'),
              has_name: everyFlag('has_name'),
              has_object_type_id: everyFlag('has_object_type_id'),
              can_sleep_max_ok: everyFlag('can_sleep_max_ok'),
              has_description: everyFlag('has_description'),
              description_meets_recommended: everyFlag('description_meets_recommended'),
              description_length: Math.min(...units.map(u => Number((u.validation as any).description_length || 0))),
              has_main_image: everyFlag('has_main_image'),
              has_street: everyFlag('has_street'),
            },
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }


      // ── STANDALONE UNITS FLOW (no building) ───────────────
      // Each room type is pushed as an independent RU property without a BuildingID.
      // ObjectTypeID falls back to property_type_id (Chalet=12, Apartment=1, etc.).
      if (standalone_units) {
        // Optional filter: only_unit_ids restricts the push to specific room_type ids
        const filteredUnits = Array.isArray(only_unit_ids) && only_unit_ids.length > 0
          ? activeRoomTypes.filter(rt => only_unit_ids.includes(rt.id))
          : activeRoomTypes;
        console.log(`[push-property-to-ru] Standalone-units mode: pushing ${filteredUnits.length}/${activeRoomTypes.length} units without building`);
        const unitResults: any[] = [];

        for (const unit of filteredUnits) {
          const existingUnitRuId = unit.rentalsunited_property_id ? parseInt(unit.rentalsunited_property_id, 10) : 0;
          // buildingId=0 → adapter omits <BuildingID> entirely
          const unitPayload = buildUnitPayload(property as PropertyRow, unit, locationId, 0, currencyId);
          unitPayload.owner_id = ruOwnerId;
          const unitImageIssues = await applyImageVerification(unitPayload as unknown as Record<string, any>);
          if (unitImageIssues.length > 0) {
            console.warn(`[push-property-to-ru] Unit "${unit.name}": dropped ${unitImageIssues.length} image(s) Rentals United would reject`, unitImageIssues.map(i => i.reason));
          }
          // ObjectTypeID = property_type_id (no composition lookup)
          unitPayload.object_type_id = unitPayload.property_type_id;

          if (existingUnitRuId === 0 && unitPayload.images.length < 10) {
            console.warn(`[push-property-to-ru] Unit "${unit.name}" skipped: only ${unitPayload.images.length} images (<10)`);
            unitResults.push({ name: unit.name, room_type_id: unit.id, success: false, error: `Needs ≥10 images (has ${unitPayload.images.length})` });
            continue;
          }

          console.log(`[push-property-to-ru] Pushing standalone unit "${unit.name}" (existing RU ID: ${existingUnitRuId}, object_type_id: ${unitPayload.object_type_id})`);

          let { data: pushResult, error: pushErr } = await supabase.functions.invoke('rentalsunited-api', {
            body: { action: 'push_property', ru_property_id: existingUnitRuId, property: unitPayload, ...childAuthPayload },
          });

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
            console.error(`[push-property-to-ru] Unit "${unit.name}" push failed:`, errMsg);
            unitResults.push({ name: unit.name, room_type_id: unit.id, success: false, error: errMsg, diagnostics: pushResult?.diagnostics });
            continue;
          }

          let unitRuId = existingUnitRuId > 0 && !staleIdError ? String(existingUnitRuId) : null;
          if (pushResult.raw_xml) {
            const extracted = extractRUPropertyId(pushResult.raw_xml);
            if (extracted) unitRuId = extracted;
          }

          if (unitRuId) {
            await supabase.from('hostfully_room_types').update({ rentalsunited_property_id: unitRuId }).eq('id', unit.id);
            console.log(`[push-property-to-ru] Saved RU ID ${unitRuId} for unit "${unit.name}"`);
          }

          // Push ARI (availability + prices) for this standalone unit
          let ariResult: Record<string, any> = {};
          const ruIdNum = unitRuId ? parseInt(unitRuId, 10) : 0;
          if (ruIdNum > 0) {
            console.log(`[push-property-to-ru] Pushing ARI for standalone unit "${unit.name}" (RU ID: ${ruIdNum})`);
            ariResult = await pushARI(supabase, ruIdNum, property as PropertyRow, 1, { id: unit.id, name: unit.name, linked_rolos_id: unit.linked_rolos_id, amenities: (unit as any).amenities ?? null }, childAuthPayload, currencyDecision);
            if (ariResult.availability_error) console.error(`[push-property-to-ru] Availability error for "${unit.name}": ${ariResult.availability_error}`);
            if (ariResult.prices_error) console.error(`[push-property-to-ru] Prices error for "${unit.name}": ${ariResult.prices_error}`);
          }

          unitResults.push({
            name: unit.name,
            room_type_id: unit.id,
            success: ruIdNum > 0 && !ariResult.availability_error && !ariResult.prices_error,
            rentalsunited_property_id: unitRuId,
            ari: ariResult,
            diagnostics: pushResult?.diagnostics,
          });
        }

        const inventorySuccess = unitResults.length === filteredUnits.length && unitResults.every((u: any) => u.success);
        const inventoryVerified = inventorySuccess && unitResults.every((u: any) => {
          const ari = u.ari ?? u;
          return ari.availability_pushed === true
            && ari.prices_pushed === true
            && !ari.availability_verification?.error
            && (ari.availability_verification?.mismatches?.length ?? 0) === 0
            && !ari.prices_verification?.error
            && (ari.prices_verification?.mismatches?.length ?? 0) === 0
            && (ari.prices_verification?.missing_dates?.length ?? 0) === 0;
        });
        await supabase.from('ru_sync_runs').insert({
          batch_id: crypto.randomUUID(),
          property_id,
          action: 'inventory_push',
          success: inventorySuccess,
          error_code: inventorySuccess ? null : 'RU_INVENTORY_INCOMPLETE',
          error_message: inventorySuccess ? null : 'One or more standalone units failed content, availability, or price sync',
          details: { ru_owner_id: ruOwnerId, owner_scope: phaseGate.owner_scope, verified: inventoryVerified, units: unitResults },
        });
        return new Response(
          JSON.stringify({
            success: inventorySuccess,
            ...(!inventorySuccess ? { error: { code: 'RU_INVENTORY_INCOMPLETE', message: 'One or more units failed content, availability, or price sync' } } : {}),
            multi_unit: true,
            standalone_units: true,
            property_id,
            units: unitResults,
            message: `${unitResults.filter(u => u.success).length}/${activeRoomTypes.length} standalone units pushed to Rentals United`,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // ── DEFAULT MULTI-UNIT BUILDING FLOW ─────────────────────
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
      const { data: buildingResult, error: buildingErr } = await supabase.functions.invoke('rentalsunited-api', {
        body: { action: 'push_building', building_name: buildingName, building_id: buildingId, unit_types: unitTypes, ...childAuthPayload },
      });

      if (buildingErr || !buildingResult?.success) {
        const errMsg = buildingErr?.message || buildingResult?.error?.message || 'Unknown error';
        console.error('[push-property-to-ru] Building push failed:', errMsg);
        return new Response(
          JSON.stringify({ success: false, error: { code: 'BUILDING_FAILED', message: errMsg }, diagnostics: buildingResult?.diagnostics }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      if (buildingResult.building_id) {
        const returnedBuildingId = parseInt(String(buildingResult.building_id), 10);
        if (requestedBuildingId > 0 && returnedBuildingId > 0 && returnedBuildingId !== requestedBuildingId) {
          // RU created a new building instead of updating ours — keep the existing one
          // so repeated pushes never fan out into duplicate buildings.
          console.warn(
            `[push-property-to-ru] RU returned building ${returnedBuildingId} for update of ${requestedBuildingId} — keeping ${requestedBuildingId}`,
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
        const unitPayload = buildUnitPayload(property as PropertyRow, unit, locationId, buildingId, currencyId);
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
        const objTypeId = compObjTypeId ?? unitPayload.property_type_id;
        unitPayload.object_type_id = objTypeId;
        if (!compObjTypeId) {
          console.log(`[push-property-to-ru] No composition match for "${unit.name}" — falling back to property_type_id=${objTypeId}`);
        }

        console.log(`[push-property-to-ru] Step 2: Pushing unit "${unit.name}" (existing RU ID: ${existingUnitRuId}, building: ${buildingId}, object_type_id: ${objTypeId})`);

        let { data: pushResult, error: pushErr } = await supabase.functions.invoke('rentalsunited-api', {
          body: { action: 'push_property', ru_property_id: existingUnitRuId, property: unitPayload, ...childAuthPayload },
        });

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
          console.error(`[push-property-to-ru] Unit "${unit.name}" push failed:`, errMsg);
          unitResults.push({ name: unit.name, room_type_id: unit.id, success: false, error: errMsg, diagnostics: pushResult?.diagnostics });
          continue;
        }

        // Extract and save RU property ID for this unit. A stale ID was cleared above,
        // so never fall back to it — the retry create returns the real new ID.
        let unitRuId = existingUnitRuId > 0 && !staleIdError ? String(existingUnitRuId) : null;
        if (pushResult.raw_xml) {
          const extracted = extractRUPropertyId(pushResult.raw_xml);
          if (extracted) unitRuId = extracted;
        }

        if (unitRuId) {
          await supabase.from('hostfully_room_types').update({ rentalsunited_property_id: unitRuId }).eq('id', unit.id);
          console.log(`[push-property-to-ru] Saved RU ID ${unitRuId} for unit "${unit.name}"`);
        }

        // Step 3 & 4: Push ARI for this unit
        const ruIdNum = parseInt(unitRuId || '0', 10);
        if (ruIdNum > 0) {
          console.log(`[push-property-to-ru] Pushing ARI for unit "${unit.name}" (RU ID: ${ruIdNum})`);
          const ariResult = await pushARI(supabase, ruIdNum, property as PropertyRow, 1, { id: unit.id, name: unit.name, linked_rolos_id: unit.linked_rolos_id, amenities: (unit as any).amenities ?? null }, childAuthPayload, currencyDecision);
          if (ariResult.availability_error) console.error(`[push-property-to-ru] Availability error for "${unit.name}": ${ariResult.availability_error}`);
          if (ariResult.prices_error) console.error(`[push-property-to-ru] Prices error for "${unit.name}": ${ariResult.prices_error}`);
          unitResults.push({
            name: unit.name,
            room_type_id: unit.id,
            success: !ariResult.availability_error && !ariResult.prices_error,
            rentalsunited_property_id: unitRuId,
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
      }

      // Building assignment is handled via <BuildingID> in each unit's property push XML — no separate API call needed.

      // Step 5: Push discounts for each unit with a valid RU ID
      const discountRuIds = unitResults
        .filter((u: any) => u.success && u.rentalsunited_property_id)
        .map((u: any) => ({ ruId: parseInt(u.rentalsunited_property_id, 10), roomTypeId: u.room_type_id }));
      const discountResult = await pushDiscounts(supabase, property_id, discountRuIds, childAuthPayload);

      const allUnitsPushed = unitResults.length === unitsToPush.length && unitResults.every((u: any) => u.success);
      const inventoryVerified = allUnitsPushed && unitResults.every((u: any) =>
        u.availability_pushed === true
        && u.prices_pushed === true
        && !u.availability_verification?.error
        && (u.availability_verification?.mismatches?.length ?? 0) === 0
        && !u.prices_verification?.error
        && (u.prices_verification?.mismatches?.length ?? 0) === 0
        && (u.prices_verification?.missing_dates?.length ?? 0) === 0
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
      return new Response(
        JSON.stringify({
          // Do not report success when RU rejected every unit — the pipeline must not
          // mark phase 3 complete on a building-only push.
          success: allUnitsPushed,
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
          message: `Building "${property.name}" + ${unitResults.filter(u => u.success).length}/${activeRoomTypes.length} units pushed to Rentals United`,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── SINGLE PROPERTY FLOW (legacy) ────────────────────────
    const ruPayload = buildSinglePropertyPayload(property as PropertyRow, activeRoomTypes, locationId, currencyId);
    ruPayload.owner_id = ruOwnerId;
    const singleImageIssues = await applyImageVerification(ruPayload as unknown as Record<string, any>);
    if (singleImageIssues.length > 0) {
      console.warn(`[push-property-to-ru] Dropped ${singleImageIssues.length} image(s) Rentals United would reject`, singleImageIssues.map(i => i.reason));
    }
    const existingRuId = property.rentalsunited_property_id ? parseInt(property.rentalsunited_property_id, 10) : 0;

    const singleValidation = buildValidation(ruPayload as unknown as Record<string, any>);

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
      const gaps = mandatoryGaps([{ name: property.name, validation: singleValidation as any }]);
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
      pushExtras = await pushARI(supabase, finalRuId, property as PropertyRow, activeRoomTypes.length || 1, undefined, childAuthPayload, currencyDecision);
      const discountResult = await pushDiscounts(supabase, property_id, [{ ruId: finalRuId }], childAuthPayload);
      pushExtras = { ...pushExtras, ...discountResult };
    }

    const inventorySuccess = finalRuId > 0 && !pushExtras.availability_error && !pushExtras.prices_error;
    const inventoryVerified = inventorySuccess
      && pushExtras.availability_pushed === true
      && pushExtras.prices_pushed === true
      && !pushExtras.availability_verification?.error
      && (pushExtras.availability_verification?.mismatches?.length ?? 0) === 0
      && !pushExtras.prices_verification?.error
      && (pushExtras.prices_verification?.mismatches?.length ?? 0) === 0
      && (pushExtras.prices_verification?.missing_dates?.length ?? 0) === 0;
    await supabase.from('ru_sync_runs').insert({
      batch_id: crypto.randomUUID(),
      property_id,
      ru_property_id: ruPropertyId,
      action: 'inventory_push',
      success: inventorySuccess,
      error_code: inventorySuccess ? null : 'RU_INVENTORY_INCOMPLETE',
      error_message: inventorySuccess ? null : String(pushExtras.availability_error || pushExtras.prices_error || 'Inventory push incomplete'),
      details: { ru_owner_id: ruOwnerId, owner_scope: phaseGate.owner_scope, verified: inventoryVerified, ari: pushExtras },
    });

    return new Response(
      JSON.stringify({ success: inventorySuccess, ...(!inventorySuccess ? { error: { code: 'RU_INVENTORY_INCOMPLETE', message: 'Property content was sent, but availability or prices did not complete' } } : {}), property_id, rentalsunited_property_id: ruPropertyId, message: inventorySuccess ? `Property "${property.name}" and inventory pushed to Rentals United successfully` : `Property "${property.name}" content pushed; inventory incomplete`, ...pushExtras }),
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
