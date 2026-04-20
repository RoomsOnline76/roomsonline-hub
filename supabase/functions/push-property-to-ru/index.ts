import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

const AMENITY_MAP: Record<string, number> = {
  wifi: 6, internet: 6, parking: 14, pool: 22, swimming_pool: 22,
  air_conditioning: 11, ac: 11, heating: 12, kitchen: 39,
  washing_machine: 42, dryer: 43, dishwasher: 40, tv: 2, television: 2,
  cable_tv: 3, satellite_tv: 3, balcony: 31, terrace: 32, garden: 34,
  bbq: 35, braai: 35, fireplace: 47, hot_tub: 23, jacuzzi: 23,
  sauna: 24, gym: 55, elevator: 56, wheelchair_accessible: 57,
  pet_friendly: 58, smoke_detector: 77, fire_extinguisher: 78,
  first_aid_kit: 79, iron: 44, hair_dryer: 45, linens: 60, towels: 61,
  toiletries: 62, coffee_maker: 63, microwave: 41, oven: 64,
  refrigerator: 65, toaster: 66, safe: 67, workspace: 68, desk: 68,
  crib: 69, high_chair: 70, books: 71, board_games: 72, security: 73,
  cctv: 73, alarm: 74,
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
  latitude: number | null;
  longitude: number | null;
  max_guests: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
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

function mapAmenities(amenitiesData: Record<string, unknown> | null): { id: number; count: number }[] {
  if (!amenitiesData) return [];
  const mapped: { id: number; count: number }[] = [];
  const seen = new Set<number>();
  const amenityList = Array.isArray(amenitiesData)
    ? amenitiesData
    : (amenitiesData.list || amenitiesData.amenities || amenitiesData.features || []);
  if (Array.isArray(amenityList)) {
    for (const item of amenityList) {
      const key = typeof item === 'string'
        ? item.toLowerCase().replace(/[\s-]+/g, '_')
        : (item?.key || item?.name || '').toLowerCase().replace(/[\s-]+/g, '_');
      const ruId = AMENITY_MAP[key];
      if (ruId && !seen.has(ruId)) {
        seen.add(ruId);
        mapped.push({ id: ruId, count: 1 });
      }
    }
  }
  const padIds = [2, 6, 11, 12, 14, 39, 42, 44, 45, 60, 61, 62];
  for (const id of padIds) {
    if (mapped.length >= 10) break;
    if (!seen.has(id)) { seen.add(id); mapped.push({ id, count: 1 }); }
  }
  return mapped;
}

function mapImages(images: unknown[] | null): { url: string; type_id: number; is_main: boolean }[] {
  if (!Array.isArray(images) || images.length === 0) return [];
  return images.map((img, i) => {
    const url = typeof img === 'string' ? img : (img as Record<string, unknown>)?.url as string || '';
    return { url, type_id: 1, is_main: i === 0 };
  }).filter(img => img.url);
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
): Promise<number> {
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
  const zipCode = unit.address_postal_code || '0000';
  const maxGuests = unit.max_guests || 2;
  const space = unit.room_size || 50;

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
  let images = mapImages(unit.images as unknown[] | null);
  if (images.length < 10) {
    const propImages = mapImages(property.images as unknown[] | null);
    const seenUrls = new Set(images.map(i => i.url));
    for (const pi of propImages) {
      if (!seenUrls.has(pi.url)) { images.push(pi); seenUrls.add(pi.url); }
    }
  }
  images = images.map((img, index) => ({ ...img, is_main: index === 0, type_id: index === 0 ? 1 : 3 }));

  // Amenities: merge unit + property
  let unitAmenities = mapAmenities(unit.amenities);
  if (unitAmenities.length < 10) {
    const propAmenities = mapAmenities(property.amenities);
    const seenIds = new Set(unitAmenities.map(a => a.id));
    for (const pa of propAmenities) {
      if (!seenIds.has(pa.id)) { unitAmenities.push(pa); seenIds.add(pa.id); }
    }
  }

  // Calculate beds from bed_configuration if available
  let beds = 0;
  const bedAmenities: { id: number; count: number }[] = [];
  if (Array.isArray(unit.bed_configuration) && unit.bed_configuration.length > 0) {
    beds = unit.bed_configuration.reduce((sum: number, b: any) => sum + (b.count || 0), 0);
    // Map bed types to RU bed amenity IDs
    const seenBedIds = new Set<number>();
    for (const bedEntry of unit.bed_configuration) {
      const bedType = (bedEntry.type || '').toLowerCase().replace(/[\s]+/g, '-');
      const ruBedId = BED_AMENITY_MAP[bedType];
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
      const bedType = (bedEntry.type || '').toLowerCase().replace(/[\s]+/g, '-');
      const ruBedId = BED_AMENITY_MAP[bedType] || 98; // default = double bed
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
    owner_id: 738925, // Will be overridden by resolveRuOwnerAccount
    no_of_units: 1,
    floor: 0,
    space,
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

// ── RU Sub-Account Resolution ────────────────────────────────

function generateSecurePassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
  let password = '';
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  for (const byte of array) password += chars[byte % chars.length];
  return password;
}

async function resolveRuOwnerAccount(
  supabase: any,
  ownerEmail: string,
  ownerName: string,
): Promise<{ ru_owner_id: number; ru_user_id: string | null; created: boolean }> {
  // 1. Check if an RU sub-account already exists for this owner
  const { data: existing } = await supabase
    .from('ru_owner_accounts')
    .select('ru_owner_id, ru_user_id')
    .eq('owner_email', ownerEmail)
    .maybeSingle();

  if (existing?.ru_owner_id) {
    console.log(`[push-property-to-ru] Found existing RU owner account for ${ownerEmail}: owner_id=${existing.ru_owner_id}`);
    return { ru_owner_id: parseInt(existing.ru_owner_id, 10), ru_user_id: existing.ru_user_id, created: false };
  }

  // 2. Create a new RU sub-account
  const nameParts = ownerName.split(' ');
  const firstName = nameParts[0] || 'Property';
  const lastName = nameParts.slice(1).join(' ') || 'Owner';
  const password = generateSecurePassword();
  // Use the owner email directly for the RU login
  const ruLoginEmail = ownerEmail;

  console.log(`[push-property-to-ru] Creating new RU sub-account for ${ownerEmail} (${firstName} ${lastName})`);

  const { data: createResult, error: createErr } = await supabase.functions.invoke('rentalsunited-api', {
    body: {
      action: 'create_user',
      user: { first_name: firstName, last_name: lastName, email: ruLoginEmail, password },
    },
  });

  if (createErr || !createResult?.success) {
    const errMsg = createErr?.message || createResult?.error?.message || 'Unknown error';
    console.error(`[push-property-to-ru] Failed to create RU sub-account for ${ownerEmail}: ${errMsg}`);
    // Fall back to master account owner ID
    return { ru_owner_id: 738925, ru_user_id: null, created: false };
  }

  const userAccountId = createResult.user_account_id;
  console.log(`[push-property-to-ru] Created RU sub-account: UserAccountId=${userAccountId}`);

  // 3. List users to find the OwnerID for this new account
  let ownerId: string | null = null;
  try {
    const { data: listResult } = await supabase.functions.invoke('rentalsunited-api', {
      body: { action: 'list_users' },
    });
    if (listResult?.success && Array.isArray(listResult.users)) {
      const matched = listResult.users.find((u: any) => u.user_account_id === userAccountId || u.email === ruLoginEmail);
      if (matched?.owner_id) ownerId = matched.owner_id;
    }
  } catch (e) {
    console.warn(`[push-property-to-ru] Failed to list users to resolve OwnerID:`, e);
  }

  // 4. Store the account details
  const { error: insertErr } = await supabase.from('ru_owner_accounts').upsert({
    owner_email: ownerEmail,
    ru_user_id: userAccountId,
    ru_owner_id: ownerId,
    ru_login_email: ruLoginEmail,
    ru_login_url: 'https://new.rentalsunited.com',
  }, { onConflict: 'owner_email' });

  if (insertErr) console.error(`[push-property-to-ru] Failed to save RU account: ${insertErr.message}`);

  const resolvedOwnerId = ownerId ? parseInt(ownerId, 10) : 738925;
  console.log(`[push-property-to-ru] Resolved RU OwnerID: ${resolvedOwnerId} for ${ownerEmail}`);
  return { ru_owner_id: resolvedOwnerId, ru_user_id: userAccountId, created: true };
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
  const zipCode = primaryRoom?.address_postal_code || '0000';
  let maxGuests = property.max_guests || 0;
  if (maxGuests <= 1 && roomTypes.length > 0) maxGuests = roomTypes.reduce((sum, rt) => sum + (rt.max_guests || 2), 0);
  if (maxGuests < 1) maxGuests = 2;
  const space = primaryRoom?.room_size || 50;
  const houseRules = (amenities as any)?.house_rules || {};
  const contact = (amenities as any)?.contact || {};
  const banking = (amenities as any)?.banking || {};
  const depositPercent = toFiniteNumber(banking.deposit_percentage ?? banking.prepayment_percentage);
  const depositAmount = toFiniteNumber(banking.deposit_amount ?? banking.prepayment_amount);
  const deposit = depositPercent && depositPercent > 0 ? depositPercent : depositAmount && depositAmount > 0 ? depositAmount : 0;
  const depositTypeId = depositPercent && depositPercent > 0 ? 3 : depositAmount && depositAmount > 0 ? 5 : 1;
  const securityDeposit = banking.security_deposit || primaryRoom?.security_deposit || undefined;
  const cleaningPrice = toFiniteNumber(primaryRoom?.cleaning_fee) ?? 0;
  // Building-level rooms: emit one Bedroom (257) per room type — these are RU's only valid IDs.
  const rooms = roomTypes.map(() => ({ room_id: 257, amenities: [{ id: 98, count: 1 }] }));
  if (rooms.length === 0) rooms.push({ room_id: 257, amenities: [{ id: 98, count: 1 }] });
  let allImages = mapImages(property.images as unknown[] | null);
  for (const rt of roomTypes) allImages = allImages.concat(mapImages(rt.images as unknown[] | null));
  const seenUrls = new Set<string>();
  allImages = allImages.filter(img => { if (seenUrls.has(img.url)) return false; seenUrls.add(img.url); return true; });
  allImages = allImages.map((img, index) => ({ ...img, is_main: index === 0, type_id: index === 0 ? 1 : 3 }));
  const totalBeds = roomTypes.reduce((sum, rt) => sum + (rt.beds || 0), 0);
  const numberOfBeds = totalBeds > 0 ? totalBeds : (property.bedrooms || Math.max(1, maxGuests));
  return {
    name: property.name,
    property_type_id: objectTypeId,
    can_sleep_max: maxGuests,
    standard_guests: Math.ceil(maxGuests * 0.7),
    number_of_beds: numberOfBeds,
    currency_id: currencyId ?? mapCurrencyToRUId(property.amenities, property.country),
    owner_id: 738925, no_of_units: 1, floor: 0, space, street,
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
  windowTo: string
): Promise<PriceVerification> {
  const report: PriceVerification = { checked: false, total_seasons: requested.length, matches: 0, mismatches: [], missing_dates: [] };
  try {
    const { data, error } = await supabase.functions.invoke('rentalsunited-api', {
      body: { action: 'get_prices', ru_property_id: ruPropertyId, date_from: windowFrom, date_to: windowTo },
    });
    if (error || !data?.success || !data?.raw_xml) {
      report.error = error?.message || data?.error?.message || 'No XML returned';
      return report;
    }
    const xml = String(data.raw_xml);
    // RU returns: <Season DateFrom="..." DateTo="..."><Price>X</Price><ExtraGuestPrice>Y</ExtraGuestPrice></Season>
    // Some variants use child elements: <Season><DateFrom>...</DateFrom><DateTo>...</DateTo>...</Season>
    const returnedSeasons: { date_from: string; date_to: string; price: number | null; extra_guest_price: number | null }[] = [];
    const seasonBlockRegex = /<Season\b([^>]*)>([\s\S]*?)<\/Season>/gi;
    const attr = (s: string, name: string): string | null => {
      const m = new RegExp(`${name}="([^"]*)"`, 'i').exec(s);
      return m ? m[1] : null;
    };
    let m: RegExpExecArray | null;
    while ((m = seasonBlockRegex.exec(xml)) !== null) {
      const attrs = m[1];
      const inner = m[2];
      const df = attr(attrs, 'DateFrom') || (inner.match(/<DateFrom>([\s\S]*?)<\/DateFrom>/i)?.[1]?.trim() ?? null);
      const dt = attr(attrs, 'DateTo') || (inner.match(/<DateTo>([\s\S]*?)<\/DateTo>/i)?.[1]?.trim() ?? null);
      if (!df || !dt) continue;
      const priceMatch = inner.match(/<Price>([\s\S]*?)<\/Price>/i);
      const extraMatch = inner.match(/<ExtraGuestPrice>([\s\S]*?)<\/ExtraGuestPrice>/i);
      returnedSeasons.push({
        date_from: df,
        date_to: dt,
        price: priceMatch ? Number(priceMatch[1].trim()) : null,
        extra_guest_price: extraMatch ? Number(extraMatch[1].trim()) : null,
      });
    }

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
  windowTo: string
): Promise<AvailabilityVerification> {
  const report: AvailabilityVerification = { checked: false, total_days: 0, matches: 0, mismatches: [] };
  try {
    const { data, error } = await supabase.functions.invoke('rentalsunited-api', {
      body: { action: 'get_availability', ru_property_id: ruPropertyId, date_from: windowFrom, date_to: windowTo },
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

async function pushARI(supabase: any, ruPropertyId: number, property: PropertyRow, unitUnits: number = 1, unit?: UnitContext) {
  const amenities = (property.amenities || {}) as Record<string, any>;
  const seasons = amenities.seasons as any[] | undefined;
  const seasonRates = amenities.season_rates as Record<string, any> | undefined;
  const result: { availability_pushed?: boolean; prices_pushed?: boolean; availability_error?: string; prices_error?: string; availability_verification?: AvailabilityVerification; prices_verification?: PriceVerification } = {};

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
        body: { action: 'push_availability', ru_property_id: ruPropertyId, availability: availEntries },
      });
      if (availErr || !availResult?.success) {
        result.availability_error = availErr?.message || availResult?.error?.message || 'Unknown error';
      } else {
        result.availability_pushed = true;
        // 6.2 + 6.3 — Verify
        const verification = await verifyAvailability(supabase, ruPropertyId, availEntries, todayStr, oneYearStr);
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
      const priceEntries: { date_from: string; date_to: string; price: number; extra_guest_price?: number }[] = [];
      let lastKnownRate = 0;
      let lastKnownExtraGuest: number | undefined;

      if (seasonRates && Array.isArray(seasons) && seasons.length > 0) {
        for (const season of seasons) {
          const seasonId = String(season.id);
          let resolved: ResolvedRate | null = null;

          if (unit) {
            resolved = resolveUnitRateKey(seasonRates, seasonId, unit, amenities);
          } else {
            // Legacy single-unit: find lowest rate
            let lowestRate = Infinity;
            let lowestExtra: number | undefined;
            for (const [, rateData] of Object.entries(seasonRates)) {
              if (typeof rateData === 'object' && rateData !== null) {
                for (const [subKey, subData] of Object.entries(rateData as Record<string, any>)) {
                  if (subKey.startsWith(seasonId + '-') && typeof subData === 'object' && subData !== null) {
                    const amount = (subData as any).roomAmount;
                    if (typeof amount === 'number' && amount > 0 && amount < lowestRate) {
                      lowestRate = amount;
                      lowestExtra = typeof (subData as any).adultAmount === 'number' && (subData as any).adultAmount > 0 ? (subData as any).adultAmount : undefined;
                    }
                  }
                }
              }
            }
            resolved = lowestRate < Infinity ? { price: lowestRate, extra_guest_price: lowestExtra } : null;
          }

          if (resolved !== null && resolved.price > 0) {
            lastKnownRate = resolved.price;
            lastKnownExtraGuest = resolved.extra_guest_price;
            const periods = season.periods || [{ from: season.from, to: season.to }];
            for (const period of periods) {
              if (period.from && period.to) priceEntries.push({ date_from: period.from, date_to: period.to, price: resolved.price, extra_guest_price: resolved.extra_guest_price });
            }
          }
        }
        // Filler period with last known rate
        if (lastKnownRate > 0 && latestEnd < oneYearStr) {
          const nextDay = new Date(latestEnd); nextDay.setDate(nextDay.getDate() + 1);
          const fillerFrom = nextDay.toISOString().slice(0, 10);
          if (fillerFrom <= oneYearStr) priceEntries.push({ date_from: fillerFrom, date_to: oneYearStr, price: lastKnownRate, extra_guest_price: lastKnownExtraGuest });
        }
      }

      // Fallback: RU requires pricing for 365 days with price > 0
      if (priceEntries.length === 0) {
        priceEntries.push({ date_from: todayStr, date_to: oneYearStr, price: 1 });
        console.log(`[pushARI] WARNING: No valid prices found — pushing fallback price of 1 for ${todayStr} to ${oneYearStr}`);
      }

      const { data: priceResult, error: priceErr } = await supabase.functions.invoke('rentalsunited-api', {
        body: { action: 'push_prices', ru_property_id: ruPropertyId, prices: priceEntries },
      });
      if (priceErr || !priceResult?.success) {
        result.prices_error = priceErr?.message || priceResult?.error?.message || 'Unknown error';
      } else {
        result.prices_pushed = true;
        // 7.2 — Verify prices post-push
        const priceVerification = await verifyPrices(supabase, ruPropertyId, priceEntries, todayStr, oneYearStr);
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
              : `${priceVerification.matches}/${priceVerification.total_seasons} seasons matched, ${priceVerification.mismatches.length} mismatches, ${priceVerification.missing_dates.length} missing dates`,
            request_data: { ru_property_id: ruPropertyId, unit_id: unit?.id ?? null, seasons: priceEntries.length, sample: priceEntries.slice(0, 3) },
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

interface SpecialRow {
  id: string;
  name: string;
  special_type: string;
  discount_percent: number | null;
  min_stay: number | null;
  max_stay: number | null;
  book_from: string | null;
  book_until: string | null;
  valid_from: string | null;
  valid_to: string | null;
  is_active: boolean | null;
  applicable_room_ids: string[] | null;
}

// ── Step 8: Discount validation + verification ──────────────────────────

type LongStayTier = { date_from: string; date_to: string; nights_from: number; nights_to: number; percentage: number };
type LastMinuteTier = { date_from: string; date_to: string; days_to_arrival_from: number; days_to_arrival_to: number; percentage: number };

function validateDiscountTiers(
  tiers: Array<{ percentage: number; nights_from?: number; days_to_arrival_from?: number }>,
  kind: 'long_stay' | 'last_minute',
): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const seenKeys = new Set<string>();
  for (const t of tiers) {
    if (!Number.isFinite(t.percentage) || t.percentage <= 0 || t.percentage > 100) {
      errors.push(`${kind}: percentage out of range (0,100]: ${t.percentage}`);
    }
    const key = kind === 'long_stay' ? `n:${t.nights_from}` : `d:${t.days_to_arrival_from}`;
    if (seenKeys.has(key)) errors.push(`${kind}: duplicate tier key ${key}`);
    seenKeys.add(key);
  }
  return { ok: errors.length === 0, errors };
}

function parseRuDiscountResponse(rawXml: string, attrFrom: string, attrTo: string): Array<Record<string, string>> {
  const out: Array<Record<string, string>> = [];
  const re = /<Discount\s+([^/>]+)\/?>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(rawXml)) !== null) {
    const attrs: Record<string, string> = {};
    const attrRe = /(\w+)="([^"]*)"/g;
    let am: RegExpExecArray | null;
    while ((am = attrRe.exec(m[1])) !== null) attrs[am[1]] = am[2];
    out.push(attrs);
  }
  return out;
}

async function verifyDiscounts(
  supabase: any,
  ruPropertyId: number,
  longStayRequested: LongStayTier[],
  lastMinuteRequested: LastMinuteTier[],
): Promise<{ long_stay: any; last_minute: any }> {
  const report: { long_stay: any; last_minute: any } = { long_stay: null, last_minute: null };

  // Long stay
  try {
    const { data, error } = await supabase.functions.invoke('rentalsunited-api', {
      body: { action: 'get_long_stay_discounts', ru_property_id: ruPropertyId },
    });
    if (error || !data?.success) {
      report.long_stay = { error: error?.message || data?.error?.message || 'pull failed', requested: longStayRequested.length, returned: 0, matches: 0, mismatches: [] };
    } else {
      const returned = parseRuDiscountResponse(data.raw_xml || '', 'NightsFrom', 'NightsTo');
      const mismatches: any[] = [];
      let matches = 0;
      for (const req of longStayRequested) {
        const hit = returned.find(r =>
          r.DateFrom === req.date_from && r.DateTo === req.date_to &&
          Number(r.NightsFrom) === req.nights_from &&
          Math.abs(Number(r.Percentage) - req.percentage) < 0.01,
        );
        if (hit) matches++;
        else mismatches.push({ requested: req, found: null });
      }
      report.long_stay = { requested: longStayRequested.length, returned: returned.length, matches, mismatches };
    }
  } catch (e) {
    report.long_stay = { error: e instanceof Error ? e.message : String(e), requested: longStayRequested.length };
  }

  // Last minute
  try {
    const { data, error } = await supabase.functions.invoke('rentalsunited-api', {
      body: { action: 'get_last_minute_discounts', ru_property_id: ruPropertyId },
    });
    if (error || !data?.success) {
      report.last_minute = { error: error?.message || data?.error?.message || 'pull failed', requested: lastMinuteRequested.length, returned: 0, matches: 0, mismatches: [] };
    } else {
      const returned = parseRuDiscountResponse(data.raw_xml || '', 'DaysToArrivalFrom', 'DaysToArrivalTo');
      const mismatches: any[] = [];
      let matches = 0;
      for (const req of lastMinuteRequested) {
        const hit = returned.find(r =>
          r.DateFrom === req.date_from && r.DateTo === req.date_to &&
          Number(r.DaysToArrivalFrom) === req.days_to_arrival_from &&
          Math.abs(Number(r.Percentage) - req.percentage) < 0.01,
        );
        if (hit) matches++;
        else mismatches.push({ requested: req, found: null });
      }
      report.last_minute = { requested: lastMinuteRequested.length, returned: returned.length, matches, mismatches };
    }
  } catch (e) {
    report.last_minute = { error: e instanceof Error ? e.message : String(e), requested: lastMinuteRequested.length };
  }

  return report;
}

async function pushDiscounts(
  supabase: any,
  propertyId: string,
  ruPropertyIds: { ruId: number; roomTypeId?: string }[],
) {
  const result: {
    long_stay_discounts_pushed: number;
    last_minute_discounts_pushed: number;
    discount_errors: string[];
    discounts_skipped: boolean;
    discounts_verification: Record<string, any>;
  } = {
    long_stay_discounts_pushed: 0,
    last_minute_discounts_pushed: 0,
    discount_errors: [],
    discounts_skipped: false,
    discounts_verification: {},
  };

  const { data: specials, error: specErr } = await supabase
    .from('property_specials')
    .select('id, name, special_type, discount_percent, min_stay, max_stay, book_from, book_until, valid_from, valid_to, is_active, applicable_room_ids')
    .eq('property_id', propertyId)
    .eq('is_active', true)
    .eq('special_type', 'discount')
    .gt('discount_percent', 0);

  if (specErr) {
    result.discount_errors.push(`Failed to load specials: ${specErr.message}`);
    return result;
  }

  if (!specials || specials.length === 0) {
    // 8.3 — Empty: skip RU calls, log to sync_logs
    result.discounts_skipped = true;
    console.log(`[push-property-to-ru] No active discount specials for property ${propertyId} — skipping RU discount endpoints`);
    try {
      await supabase.from('sync_logs').insert({
        property_id: propertyId,
        sync_type: 'discounts_verification',
        status: 'skipped',
        message: 'No active discount specials configured; skipped Push_PutLongStayDiscounts_RQ and Push_PutLastMinuteDiscounts_RQ',
        metadata: { ru_property_ids: ruPropertyIds.map(r => r.ruId) },
      });
    } catch (logErr) {
      console.warn(`[push-property-to-ru] Failed to log discount-skip:`, logErr);
    }
    return result;
  }

  console.log(`[push-property-to-ru] Found ${specials.length} active percentage discounts for property ${propertyId}`);

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const oneYearStr = new Date(today.getFullYear() + 1, today.getMonth(), today.getDate()).toISOString().slice(0, 10);

  for (const { ruId, roomTypeId } of ruPropertyIds) {
    if (ruId <= 0) continue;

    const applicableSpecials = specials.filter((s: SpecialRow) => {
      if (!s.applicable_room_ids || s.applicable_room_ids.length === 0) return true;
      if (!roomTypeId) return true;
      return s.applicable_room_ids.includes(roomTypeId);
    });

    const longStayDiscounts: LongStayTier[] = [];
    const lastMinuteDiscounts: LastMinuteTier[] = [];

    for (const special of applicableSpecials as SpecialRow[]) {
      const dateFrom = special.valid_from || todayStr;
      const dateTo = special.valid_to || oneYearStr;
      const pct = special.discount_percent!;

      if ((special.min_stay || 0) > 0) {
        longStayDiscounts.push({
          date_from: dateFrom,
          date_to: dateTo,
          nights_from: special.min_stay!,
          nights_to: special.max_stay || 999,
          percentage: pct,
        });
      } else if (special.book_from || special.book_until) {
        const bookFrom = special.book_from ? new Date(special.book_from) : today;
        const bookUntil = special.book_until ? new Date(special.book_until) : new Date(dateTo);
        const arrivalDate = new Date(dateFrom);
        const daysToArrivalFrom = Math.max(0, Math.floor((arrivalDate.getTime() - bookUntil.getTime()) / 86400000));
        const daysToArrivalTo = Math.max(daysToArrivalFrom + 1, Math.floor((arrivalDate.getTime() - bookFrom.getTime()) / 86400000));

        lastMinuteDiscounts.push({
          date_from: dateFrom,
          date_to: dateTo,
          days_to_arrival_from: daysToArrivalFrom,
          days_to_arrival_to: Math.min(daysToArrivalTo, 365),
          percentage: pct,
        });
      }
    }

    // Sort tiers ascending so RU sees a consistent ladder
    longStayDiscounts.sort((a, b) => a.nights_from - b.nights_from);
    lastMinuteDiscounts.sort((a, b) => a.days_to_arrival_from - b.days_to_arrival_from);

    // 8.3 — Local validation
    const lsValidation = validateDiscountTiers(longStayDiscounts, 'long_stay');
    const lmValidation = validateDiscountTiers(lastMinuteDiscounts, 'last_minute');
    if (!lsValidation.ok) result.discount_errors.push(...lsValidation.errors.map(e => `RU ${ruId}: ${e}`));
    if (!lmValidation.ok) result.discount_errors.push(...lmValidation.errors.map(e => `RU ${ruId}: ${e}`));

    // 8.1 — Push long stay
    if (longStayDiscounts.length > 0 && lsValidation.ok) {
      try {
        const { data: lsResult, error: lsErr } = await supabase.functions.invoke('rentalsunited-api', {
          body: { action: 'push_long_stay_discounts', ru_property_id: ruId, discounts: longStayDiscounts },
        });
        if (lsErr || !lsResult?.success) {
          result.discount_errors.push(`Long stay (RU ${ruId}): ${lsErr?.message || lsResult?.error?.message || 'Unknown error'}`);
        } else {
          result.long_stay_discounts_pushed += longStayDiscounts.length;
          console.log(`[push-property-to-ru] Pushed ${longStayDiscounts.length} long stay discounts to RU ${ruId}`);
        }
      } catch (e) {
        result.discount_errors.push(`Long stay (RU ${ruId}): ${e instanceof Error ? e.message : 'Unknown'}`);
      }
    }

    // 8.2 — Push last minute
    if (lastMinuteDiscounts.length > 0 && lmValidation.ok) {
      try {
        const { data: lmResult, error: lmErr } = await supabase.functions.invoke('rentalsunited-api', {
          body: { action: 'push_last_minute_discounts', ru_property_id: ruId, discounts: lastMinuteDiscounts },
        });
        if (lmErr || !lmResult?.success) {
          result.discount_errors.push(`Last minute (RU ${ruId}): ${lmErr?.message || lmResult?.error?.message || 'Unknown error'}`);
        } else {
          result.last_minute_discounts_pushed += lastMinuteDiscounts.length;
          console.log(`[push-property-to-ru] Pushed ${lastMinuteDiscounts.length} last minute discounts to RU ${ruId}`);
        }
      } catch (e) {
        result.discount_errors.push(`Last minute (RU ${ruId}): ${e instanceof Error ? e.message : 'Unknown'}`);
      }
    }

    // Verify (8.x) — diff requested vs returned
    const verification = await verifyDiscounts(supabase, ruId, longStayDiscounts, lastMinuteDiscounts);
    result.discounts_verification[`ru_${ruId}`] = verification;
    console.log(`[push-property-to-ru] Discount verification RU ${ruId}: long_stay matches=${verification.long_stay?.matches ?? 'n/a'}, last_minute matches=${verification.last_minute?.matches ?? 'n/a'}`);

    try {
      await supabase.from('sync_logs').insert({
        property_id: propertyId,
        sync_type: 'discounts_verification',
        status: result.discount_errors.length === 0 ? 'success' : 'partial',
        message: `RU ${ruId}: long_stay ${verification.long_stay?.matches ?? 0}/${longStayDiscounts.length}, last_minute ${verification.last_minute?.matches ?? 0}/${lastMinuteDiscounts.length}`,
        metadata: {
          ru_property_id: ruId,
          requested: { long_stay: longStayDiscounts, last_minute: lastMinuteDiscounts },
          verification,
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
    const forceLocationIdRaw = reqBody.force_location_id;
    const forceLocationId = Number.isFinite(Number(forceLocationIdRaw)) && Number(forceLocationIdRaw) > 1
      ? Number(forceLocationIdRaw)
      : null;

    // ── Seed: pull RU's master list of cities + currencies into public.ru_locations ──
    // One-shot (or periodic) cache primer. Without this, name lookups can't be country-scoped
    // and we can't detect when an RU LocationID is configured to the wrong currency.
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

      const [{ data: buildingProps }, { data: unitRows }] = await Promise.all([
        supabase
          .from('properties')
          .select('id, name, rentalsunited_property_id, country, latitude, longitude, amenities, city')
          .not('rentalsunited_property_id', 'is', null),
        supabase
          .from('hostfully_room_types')
          .select('property_id, properties!inner(id, name, rentalsunited_property_id, country, latitude, longitude, amenities, city)')
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
        const loc = await resolveLocationId(supabase, lat, lng, p.country, p.city);

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
          .select('id, name, rentalsunited_property_id, country, latitude, longitude, amenities')
          .not('rentalsunited_property_id', 'is', null),
        supabase
          .from('hostfully_room_types')
          .select('property_id, properties!inner(id, name, rentalsunited_property_id, country, latitude, longitude, amenities)')
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
        const loc = await resolveLocationId(supabase, lat, lng, p.country);
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
      .select('id, name, description, property_type, address, city, country, latitude, longitude, max_guests, bedrooms, bathrooms, amenities, images, rentalsunited_property_id, rentalsunited_building_id, owner_email')
      .eq('id', property_id)
      .single();

    if (propErr || !property) {
      return new Response(
        JSON.stringify({ success: false, error: { code: 'NOT_FOUND', message: `Property not found: ${propErr?.message}` } }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: roomTypes } = await supabase
      .from('hostfully_room_types')
      .select('id, name, description, max_guests, bedrooms, bathrooms, beds, bed_configuration, linked_rolos_id, amenities, images, check_in_time, check_out_time, check_in_instructions, cleaning_fee, security_deposit, address_street, address_postal_code, latitude, longitude, property_type, cancellation_policy, room_size, rentalsunited_property_id')
      .eq('property_id', property_id)
      .eq('is_active', true);

    const activeRoomTypes = (roomTypes || []) as RoomTypeRow[];
    const isMultiUnit = activeRoomTypes.length > 0;

    const lat = property.latitude || activeRoomTypes[0]?.latitude || 0;
    const lng = property.longitude || activeRoomTypes[0]?.longitude || 0;
    const country = property.country;

    // Resolve currency once for the whole push so every unit uses the same value.
    const currencyId = mapCurrencyToRUId(property.amenities as Record<string, unknown> | null, country);

    // Prefer cached RU location/currency if coords haven't drifted (T5).
    const cached = await loadRuPropertyMapping(supabase, property_id);
    const coordsHash = hashCoords(lat, lng);
    let locationId = 0;
    if (forceLocationId) {
      locationId = forceLocationId;
      console.log(`[push-property-to-ru] FORCE override: using LocationID ${locationId} (bypasses coord/cache resolution)`);
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

    // ── RU OwnerID: ALWAYS use master account ─────────────────
    // Sub-account creation is not yet approved/active by RU. Until further
    // notice, all properties (create + update + ARI) run under the master
    // account so credentials match ownership and ARI pushes succeed.
    const ruOwnerId = 738925; // master account
    console.log(`[push-property-to-ru] Using master RU OwnerID ${ruOwnerId} (sub-accounts disabled), CurrencyID=${currencyId}, LocationID=${locationId}`);

    // ── MULTI-UNIT BUILDING FLOW ─────────────────────────────
    if (isMultiUnit) {
      console.log(`[push-property-to-ru] Multi-unit mode: ${activeRoomTypes.length} units for "${property.name}"`);

      // Dry run: validate each unit
      if (dry_run) {
        const units = activeRoomTypes.map(rt => {
          const payload = buildUnitPayload(property as PropertyRow, rt, locationId, undefined, currencyId);
          return {
            room_type_id: rt.id,
            name: rt.name,
            ru_property_id: rt.rentalsunited_property_id || null,
            validation: {
              images_count: payload.images.length,
              amenities_count: payload.amenities.length,
              rooms_count: 1,
              has_coordinates: payload.latitude !== 0 && payload.longitude !== 0,
              meets_minimum_images: payload.images.length >= 10,
              meets_minimum_amenities: payload.amenities.length >= 10,
              max_guests: payload.can_sleep_max,
            },
          };
        });

        return new Response(
          JSON.stringify({
            success: true,
            dry_run: true,
            multi_unit: true,
            property_id,
            building_id: property.rentalsunited_building_id || null,
            units,
            validation: {
              total_units: units.length,
              all_ready: units.every(u => u.validation.meets_minimum_images && u.validation.meets_minimum_amenities && u.validation.has_coordinates),
              images_count: units.reduce((s, u) => s + u.validation.images_count, 0),
              amenities_count: units[0]?.validation.amenities_count || 0,
              rooms_count: units.length,
              has_coordinates: units.every(u => u.validation.has_coordinates),
              meets_minimum_images: units.every(u => u.validation.meets_minimum_images),
              meets_minimum_amenities: units.every(u => u.validation.meets_minimum_amenities),
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
          // ObjectTypeID = property_type_id (no composition lookup)
          unitPayload.object_type_id = unitPayload.property_type_id;

          if (existingUnitRuId === 0 && unitPayload.images.length < 10) {
            console.warn(`[push-property-to-ru] Unit "${unit.name}" skipped: only ${unitPayload.images.length} images (<10)`);
            unitResults.push({ name: unit.name, room_type_id: unit.id, success: false, error: `Needs ≥10 images (has ${unitPayload.images.length})` });
            continue;
          }

          console.log(`[push-property-to-ru] Pushing standalone unit "${unit.name}" (existing RU ID: ${existingUnitRuId}, object_type_id: ${unitPayload.object_type_id})`);

          const { data: pushResult, error: pushErr } = await supabase.functions.invoke('rentalsunited-api', {
            body: { action: 'push_property', ru_property_id: existingUnitRuId, property: unitPayload },
          });

          if (pushErr || !pushResult?.success) {
            const errMsg = pushErr?.message || pushResult?.error?.message || 'Unknown error';
            console.error(`[push-property-to-ru] Unit "${unit.name}" push failed:`, errMsg);
            unitResults.push({ name: unit.name, room_type_id: unit.id, success: false, error: errMsg, diagnostics: pushResult?.diagnostics });
            continue;
          }

          let unitRuId = existingUnitRuId > 0 ? String(existingUnitRuId) : null;
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
            ariResult = await pushARI(supabase, ruIdNum, property as PropertyRow, 1, { id: unit.id, name: unit.name, linked_rolos_id: unit.linked_rolos_id, amenities: (unit as any).amenities ?? null });
            if (ariResult.availability_error) console.error(`[push-property-to-ru] Availability error for "${unit.name}": ${ariResult.availability_error}`);
            if (ariResult.prices_error) console.error(`[push-property-to-ru] Prices error for "${unit.name}": ${ariResult.prices_error}`);
          }

          unitResults.push({
            name: unit.name,
            room_type_id: unit.id,
            success: true,
            rentalsunited_property_id: unitRuId,
            ari: ariResult,
            diagnostics: pushResult?.diagnostics,
          });
        }

        return new Response(
          JSON.stringify({
            success: true,
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

      const { data: buildingResult, error: buildingErr } = await supabase.functions.invoke('rentalsunited-api', {
        body: { action: 'push_building', building_name: buildingName, building_id: buildingId, unit_types: unitTypes },
      });

      if (buildingErr || !buildingResult?.success) {
        const errMsg = buildingErr?.message || buildingResult?.error?.message || 'Unknown error';
        console.error('[push-property-to-ru] Building push failed:', errMsg);
        return new Response(
          JSON.stringify({ success: false, error: { code: 'BUILDING_FAILED', message: errMsg }, diagnostics: buildingResult?.diagnostics }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (buildingResult.building_id) {
        buildingId = buildingResult.building_id;
        await supabase.from('properties').update({ rentalsunited_building_id: String(buildingId) }).eq('id', property_id);
        console.log(`[push-property-to-ru] Building ID saved: ${buildingId}`);
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
      const unitResults: any[] = [];
      for (const unit of activeRoomTypes) {
        const existingUnitRuId = unit.rentalsunited_property_id ? parseInt(unit.rentalsunited_property_id, 10) : 0;
        const unitPayload = buildUnitPayload(property as PropertyRow, unit, locationId, buildingId, currencyId);
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

        const { data: pushResult, error: pushErr } = await supabase.functions.invoke('rentalsunited-api', {
          body: { action: 'push_property', ru_property_id: existingUnitRuId, property: unitPayload },
        });

        if (pushErr || !pushResult?.success) {
          const errMsg = pushErr?.message || pushResult?.error?.message || 'Unknown error';
          console.error(`[push-property-to-ru] Unit "${unit.name}" push failed:`, errMsg);
          unitResults.push({ name: unit.name, room_type_id: unit.id, success: false, error: errMsg, diagnostics: pushResult?.diagnostics });
          continue;
        }

        // Extract and save RU property ID for this unit
        let unitRuId = existingUnitRuId > 0 ? String(existingUnitRuId) : null;
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
          const ariResult = await pushARI(supabase, ruIdNum, property as PropertyRow, 1, { id: unit.id, name: unit.name, linked_rolos_id: unit.linked_rolos_id, amenities: (unit as any).amenities ?? null });
          if (ariResult.availability_error) console.error(`[push-property-to-ru] Availability error for "${unit.name}": ${ariResult.availability_error}`);
          if (ariResult.prices_error) console.error(`[push-property-to-ru] Prices error for "${unit.name}": ${ariResult.prices_error}`);
          unitResults.push({
            name: unit.name,
            room_type_id: unit.id,
            success: true,
            rentalsunited_property_id: unitRuId,
            diagnostics: pushResult?.diagnostics,
            ...ariResult,
          });
        } else {
          console.warn(`[push-property-to-ru] Skipping ARI for "${unit.name}" — no valid RU ID`);
          unitResults.push({
            name: unit.name,
            room_type_id: unit.id,
            success: true,
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
      const discountResult = await pushDiscounts(supabase, property_id, discountRuIds);

      return new Response(
        JSON.stringify({
          success: true,
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
    const existingRuId = property.rentalsunited_property_id ? parseInt(property.rentalsunited_property_id, 10) : 0;

    if (dry_run) {
      return new Response(
        JSON.stringify({
          success: true, dry_run: true, multi_unit: false, property_id,
          ru_property_id: existingRuId || null,
          validation: {
            images_count: ruPayload.images.length,
            amenities_count: ruPayload.amenities.length,
            rooms_count: ruPayload.rooms.length,
            has_coordinates: ruPayload.latitude !== 0 && ruPayload.longitude !== 0,
            meets_minimum_images: ruPayload.images.length >= 10,
            meets_minimum_amenities: ruPayload.amenities.length >= 10,
          },
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (existingRuId === 0 && ruPayload.images.length < 10) {
      return new Response(
        JSON.stringify({ success: false, error: { code: 'VALIDATION_FAILED', message: `Property needs at least 10 images (has ${ruPayload.images.length}).` } }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: pushResult, error: pushErr } = await supabase.functions.invoke('rentalsunited-api', {
      body: { action: 'push_property', ru_property_id: existingRuId, property: ruPayload },
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
      pushExtras = await pushARI(supabase, finalRuId, property as PropertyRow, activeRoomTypes.length || 1);
      const discountResult = await pushDiscounts(supabase, property_id, [{ ruId: finalRuId }]);
      pushExtras = { ...pushExtras, ...discountResult };
    }

    return new Response(
      JSON.stringify({ success: true, property_id, rentalsunited_property_id: ruPropertyId, message: `Property "${property.name}" pushed to Rentals United successfully`, ...pushExtras }),
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
