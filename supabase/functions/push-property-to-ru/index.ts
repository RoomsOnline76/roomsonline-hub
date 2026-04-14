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

async function resolveLocationId(supabase: any, lat: number, lng: number): Promise<number> {
  if (!lat || !lng) return 1;
  try {
    const { data, error } = await supabase.functions.invoke('rentalsunited-api', {
      body: { action: 'get_location_by_coordinates', metadata: { latitude: lat, longitude: lng } },
    });
    if (error || !data?.success || !data?.location_id) return 1;
    console.log(`[push-property-to-ru] Resolved LocationID: ${data.location_id}`);
    return data.location_id;
  } catch { return 1; }
}

// ── Build RU payload for a single unit ───────────────────────

function buildUnitPayload(
  property: PropertyRow,
  unit: RoomTypeRow,
  locationId: number,
  buildingId?: number,
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
  if (Array.isArray(unit.bed_configuration) && unit.bed_configuration.length > 0) {
    beds = unit.bed_configuration.reduce((sum: number, b: any) => sum + (b.count || 0), 0);
  }
  if (!beds) beds = unit.beds || unit.bedrooms || Math.max(1, maxGuests);
  const descText = unit.description || property.description || unit.name;
  
  return {
    name: unit.name,
    property_type_id: objectTypeId,
    can_sleep_max: maxGuests,
    standard_guests: Math.ceil(maxGuests * 0.7),
    number_of_beds: beds,
    owner_id: 738925,
    no_of_units: 1,
    floor: 0,
    space,
    street,
    detailed_location_id: locationId,
    zip_code: zipCode,
    latitude: lat,
    longitude: lng,
    amenities: unitAmenities,
    rooms: [{ room_id: 1, amenities: unitAmenities.slice(0, 5) }],
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
  };
}

// Legacy single-property payload builder (kept for properties with no room types)
function buildSinglePropertyPayload(property: PropertyRow, roomTypes: RoomTypeRow[], locationId: number) {
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
  const rooms = roomTypes.map((rt, i) => ({ room_id: i + 1, amenities: mapAmenities(rt.amenities).slice(0, 5) }));
  if (rooms.length === 0) rooms.push({ room_id: 1, amenities: [{ id: 2, count: 1 }] });
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
}

function resolveUnitRateKey(seasonRates: Record<string, any>, seasonId: string, unit: UnitContext, amenities: Record<string, any>): number | null {
  // Try multiple keys to find the rate for this specific unit
  const roomTypes = (amenities.room_types || []) as any[];
  const candidateKeys = [unit.id];
  if (unit.linked_rolos_id) candidateKeys.push(unit.linked_rolos_id);
  // Find matching amenity room by name
  const matchedRoom = roomTypes.find((rt: any) => rt.name === unit.name || rt.id === unit.id);
  if (matchedRoom && matchedRoom.id && !candidateKeys.includes(matchedRoom.id)) candidateKeys.push(matchedRoom.id);

  for (const [, rateData] of Object.entries(seasonRates)) {
    if (typeof rateData !== 'object' || rateData === null) continue;
    for (const roomKey of candidateKeys) {
      const compositeKey = `${seasonId}-${roomKey}`;
      const entry = (rateData as Record<string, any>)[compositeKey];
      if (entry && typeof entry === 'object' && typeof (entry as any).roomAmount === 'number' && (entry as any).roomAmount > 0) {
        return (entry as any).roomAmount;
      }
    }
  }

  // Fallback: find lowest rate for this season across all entries
  let lowest = Infinity;
  for (const [, rateData] of Object.entries(seasonRates)) {
    if (typeof rateData !== 'object' || rateData === null) continue;
    for (const [subKey, subData] of Object.entries(rateData as Record<string, any>)) {
      if (subKey.startsWith(seasonId + '-') && typeof subData === 'object' && subData !== null) {
        const amount = (subData as any).roomAmount;
        if (typeof amount === 'number' && amount > 0 && amount < lowest) lowest = amount;
      }
    }
  }
  return lowest < Infinity ? lowest : null;
}

async function pushARI(supabase: any, ruPropertyId: number, property: PropertyRow, unitUnits: number = 1, unit?: UnitContext) {
  const amenities = (property.amenities || {}) as Record<string, any>;
  const seasons = amenities.seasons as any[] | undefined;
  const seasonRates = amenities.season_rates as Record<string, any> | undefined;
  const result: { availability_pushed?: boolean; prices_pushed?: boolean; availability_error?: string; prices_error?: string } = {};

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

  if (allPeriods.length > 0) {
    try {
      const availEntries = allPeriods.map(p => ({ date_from: p.from, date_to: p.to, units: unitUnits, min_stay: p.minStay }));
      const { data: availResult, error: availErr } = await supabase.functions.invoke('rentalsunited-api', {
        body: { action: 'push_availability', ru_property_id: ruPropertyId, availability: availEntries },
      });
      if (availErr || !availResult?.success) {
        result.availability_error = availErr?.message || availResult?.error?.message || 'Unknown error';
      } else {
        result.availability_pushed = true;
      }
    } catch (e) { result.availability_error = e instanceof Error ? e.message : 'Unknown error'; }
  }

  if (seasonRates && Array.isArray(seasons) && seasons.length > 0) {
    try {
      const priceEntries: { date_from: string; date_to: string; price: number }[] = [];
      let lastKnownRate = 0;
      for (const season of seasons) {
        const seasonId = String(season.id);
        let rate: number | null = null;

        if (unit) {
          // Unit-specific rate resolution
          rate = resolveUnitRateKey(seasonRates, seasonId, unit, amenities);
        } else {
          // Legacy single-unit: find lowest rate
          let lowestRate = Infinity;
          for (const [, rateData] of Object.entries(seasonRates)) {
            if (typeof rateData === 'object' && rateData !== null) {
              for (const [subKey, subData] of Object.entries(rateData as Record<string, any>)) {
                if (subKey.startsWith(seasonId + '-') && typeof subData === 'object' && subData !== null) {
                  const amount = (subData as any).roomAmount;
                  if (typeof amount === 'number' && amount > 0 && amount < lowestRate) lowestRate = amount;
                }
              }
            }
          }
          rate = lowestRate < Infinity ? lowestRate : null;
        }

        if (rate !== null && rate > 0) {
          lastKnownRate = rate;
          const periods = season.periods || [{ from: season.from, to: season.to }];
          for (const period of periods) {
            if (period.from && period.to) priceEntries.push({ date_from: period.from, date_to: period.to, price: rate });
          }
        }
      }
      if (lastKnownRate > 0 && latestEnd < oneYearStr) {
        const nextDay = new Date(latestEnd); nextDay.setDate(nextDay.getDate() + 1);
        const fillerFrom = nextDay.toISOString().slice(0, 10);
        if (fillerFrom <= oneYearStr) priceEntries.push({ date_from: fillerFrom, date_to: oneYearStr, price: lastKnownRate });
      }
      if (priceEntries.length > 0) {
        const { data: priceResult, error: priceErr } = await supabase.functions.invoke('rentalsunited-api', {
          body: { action: 'push_prices', ru_property_id: ruPropertyId, prices: priceEntries },
        });
        if (priceErr || !priceResult?.success) {
          result.prices_error = priceErr?.message || priceResult?.error?.message || 'Unknown error';
        } else { result.prices_pushed = true; }
      }
    } catch (e) { result.prices_error = e instanceof Error ? e.message : 'Unknown error'; }
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
    const { property_id, dry_run } = await req.json();

    if (!property_id) {
      return new Response(
        JSON.stringify({ success: false, error: { code: 'MISSING_PARAM', message: 'property_id is required' } }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[push-property-to-ru] Loading property ${property_id}...`);

    const { data: property, error: propErr } = await supabase
      .from('properties')
      .select('id, name, description, property_type, address, city, country, latitude, longitude, max_guests, bedrooms, bathrooms, amenities, images, rentalsunited_property_id, rentalsunited_building_id')
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
    const locationId = await resolveLocationId(supabase, lat, lng);

    // ── MULTI-UNIT BUILDING FLOW ─────────────────────────────
    if (isMultiUnit) {
      console.log(`[push-property-to-ru] Multi-unit mode: ${activeRoomTypes.length} units for "${property.name}"`);

      // Dry run: validate each unit
      if (dry_run) {
        const units = activeRoomTypes.map(rt => {
          const payload = buildUnitPayload(property as PropertyRow, rt, locationId);
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

      // Step 1: Create/update RU Building
      let buildingId = property.rentalsunited_building_id ? parseInt(property.rentalsunited_building_id, 10) : 0;
      // Truncate building name to 20 chars (RU API limit)
      const buildingName = property.name.substring(0, 20);
      console.log(`[push-property-to-ru] Step 1: Push building "${buildingName}" (existing ID: ${buildingId})`);

      const { data: buildingResult, error: buildingErr } = await supabase.functions.invoke('rentalsunited-api', {
        body: { action: 'push_building', building_name: buildingName, building_id: buildingId },
      });

      if (buildingErr || !buildingResult?.success) {
        const errMsg = buildingErr?.message || buildingResult?.error?.message || 'Unknown error';
        console.error('[push-property-to-ru] Building push failed:', errMsg);
        return new Response(
          JSON.stringify({ success: false, error: { code: 'BUILDING_FAILED', message: errMsg } }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (buildingResult.building_id) {
        buildingId = buildingResult.building_id;
        await supabase.from('properties').update({ rentalsunited_building_id: String(buildingId) }).eq('id', property_id);
        console.log(`[push-property-to-ru] Building ID saved: ${buildingId}`);
      }

      // Step 2: Push each unit as an individual RU property
      const unitResults: any[] = [];
      for (const unit of activeRoomTypes) {
        const existingUnitRuId = unit.rentalsunited_property_id ? parseInt(unit.rentalsunited_property_id, 10) : 0;
        const unitPayload = buildUnitPayload(property as PropertyRow, unit, locationId, buildingId);

        console.log(`[push-property-to-ru] Step 2: Pushing unit "${unit.name}" (existing RU ID: ${existingUnitRuId}, building: ${buildingId})`);

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
          const ariResult = await pushARI(supabase, ruIdNum, property as PropertyRow, 1, { id: unit.id, name: unit.name, linked_rolos_id: unit.linked_rolos_id });
          if (ariResult.availability_error) console.error(`[push-property-to-ru] Availability error for "${unit.name}": ${ariResult.availability_error}`);
          if (ariResult.prices_error) console.error(`[push-property-to-ru] Prices error for "${unit.name}": ${ariResult.prices_error}`);
          unitResults.push({
            name: unit.name,
            room_type_id: unit.id,
            success: true,
            rentalsunited_property_id: unitRuId,
            ...ariResult,
          });
        } else {
          console.warn(`[push-property-to-ru] Skipping ARI for "${unit.name}" — no valid RU ID`);
          unitResults.push({
            name: unit.name,
            room_type_id: unit.id,
            success: true,
            rentalsunited_property_id: unitRuId,
            availability_error: 'Skipped — no valid RU property ID',
            prices_error: 'Skipped — no valid RU property ID',
          });
        }
      }

      // Building assignment is handled via <BuildingID> in each unit's property push XML — no separate API call needed.

      return new Response(
        JSON.stringify({
          success: true,
          multi_unit: true,
          property_id,
          building_id: buildingId,
          units: unitResults,
          building_assignment: { success: true, note: 'Units assigned via BuildingID in property XML' },
          message: `Building "${property.name}" + ${unitResults.filter(u => u.success).length}/${activeRoomTypes.length} units pushed to Rentals United`,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── SINGLE PROPERTY FLOW (legacy) ────────────────────────
    const ruPayload = buildSinglePropertyPayload(property as PropertyRow, activeRoomTypes, locationId);
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
    let pushExtras = {};
    if (finalRuId > 0) {
      pushExtras = await pushARI(supabase, finalRuId, property as PropertyRow, activeRoomTypes.length || 1);
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
