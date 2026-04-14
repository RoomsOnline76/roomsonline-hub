import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * Push Property to Rentals United
 * 
 * Orchestrator that loads a ROL'OS property + room types,
 * maps them to the RU Push_PutProperty_RQ format,
 * calls the rentalsunited-api edge function,
 * and stores the returned RU property ID back on the property record.
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
}

interface RoomTypeRow {
  id: string;
  name: string;
  description: string | null;
  max_guests: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  beds: number | null;
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

  // Pad with generic amenities if fewer than 10
  const padIds = [2, 6, 11, 12, 14, 39, 42, 44, 45, 60, 61, 62];
  for (const id of padIds) {
    if (mapped.length >= 10) break;
    if (!seen.has(id)) {
      seen.add(id);
      mapped.push({ id, count: 1 });
    }
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
      if (ruId && !seen.has(ruId)) {
        seen.add(ruId);
        methods.push(ruId);
      }
    }
  }

  if (methods.length === 0) methods.push(1, 2);
  return methods;
}

/**
 * Map cancellation policies from DB format to RU format.
 * DB: [{days: 999, forfeit: 10, type: "% of Total"}, {days: 30, forfeit: 100}]
 * RU expects flat CancellationPolicy entries like:
 * <CancellationPolicy ValidFrom="0" ValidTo="30">100</CancellationPolicy>
 */
function mapCancellationPolicies(amenities: Record<string, unknown> | null): { valid_from: number; valid_to: number; percentage: number }[] {
  const policies = amenities?.cancellation_policies;
  if (!Array.isArray(policies) || policies.length === 0) {
    return [
      { valid_from: 0, valid_to: 14, percentage: 100 },
      { valid_from: 15, valid_to: 30, percentage: 50 },
    ];
  }

  // Sort policies by days ascending so we can build contiguous ranges
  const sorted = [...policies]
    .filter((p: any) => p.days != null && p.forfeit != null)
    .map((p: any) => ({ days: Number(p.days), forfeit: Number(p.forfeit) }))
    .filter((p) => Number.isFinite(p.days) && Number.isFinite(p.forfeit) && p.days >= 0)
    .sort((a, b) => a.days - b.days);

  if (sorted.length === 0) {
    return [{ valid_from: 0, valid_to: 30, percentage: 100 }];
  }

  const rules: { valid_from: number; valid_to: number; percentage: number }[] = [];
  
  for (let i = 0; i < sorted.length; i++) {
    const policy = sorted[i] as any;
    const fromDays = i === 0 ? 0 : (sorted[i - 1] as any).days + 1;
    const toDays = policy.days;
    if (fromDays <= toDays) {
      rules.push({ valid_from: fromDays, valid_to: toDays, percentage: policy.forfeit });
    }
  }

  return rules;
}

/**
 * Resolve RU DetailedLocationID via coordinates lookup.
 * Falls back to 1 if lookup fails.
 */
async function resolveLocationId(supabase: any, lat: number, lng: number): Promise<number> {
  if (!lat || !lng) return 1;

  try {
    const { data, error } = await supabase.functions.invoke('rentalsunited-api', {
      body: { action: 'get_location_by_coordinates', metadata: { latitude: lat, longitude: lng } },
    });

    if (error || !data?.success || !data?.location_id) {
      console.warn('[push-property-to-ru] Location lookup failed, using fallback:', error?.message || data?.error);
      return 1;
    }

    console.log(`[push-property-to-ru] Resolved LocationID: ${data.location_id}`);
    return data.location_id;
  } catch (err) {
    console.warn('[push-property-to-ru] Location lookup exception:', err);
    return 1;
  }
}

function buildRUPayload(
  property: PropertyRow,
  roomTypes: RoomTypeRow[],
  locationId: number,
) {
  const primaryRoom = roomTypes[0] || null;
  const amenities = property.amenities || {};

  const objectTypeId = PROPERTY_TYPE_MAP[
    (primaryRoom?.property_type || property.property_type || 'apartment').toLowerCase().replace(/[\s-]+/g, '_')
  ] || 1;

  const lat = primaryRoom?.latitude || property.latitude || 0;
  const lng = primaryRoom?.longitude || property.longitude || 0;
  const street = primaryRoom?.address_street || property.address || 'Not specified';
  const zipCode = primaryRoom?.address_postal_code || '0000';

  // max_guests: use property value if > 1, else aggregate from room types
  let maxGuests = property.max_guests || 0;
  if (maxGuests <= 1 && roomTypes.length > 0) {
    maxGuests = roomTypes.reduce((sum, rt) => sum + (rt.max_guests || 2), 0);
  }
  if (maxGuests < 1) maxGuests = 2;

  // Space: use room_size from first room type, or property data, or default
  const space = primaryRoom?.room_size || 50;

  // Check-in/out: read from property amenities.house_rules, then room type, then defaults
  const houseRules = (amenities as any)?.house_rules || {};
  const contact = (amenities as any)?.contact || {};
  const checkInFrom = houseRules.check_in_from || primaryRoom?.check_in_time || '14:00';
  const checkInTo = houseRules.check_in_to || '22:00';
  const checkOutUntil = houseRules.check_out_to || primaryRoom?.check_out_time || '10:00';
  const arrivalLandlord = contact.name || contact.full_name || property.name || 'RoomsOnline';
  const arrivalEmail = (amenities as any)?.contact_email || contact.email || 'dev@roomsonline.co.za';
  const arrivalPhone = (amenities as any)?.telephone || (amenities as any)?.mobile_number || contact.telephone || contact.phone || '+27 824602220';
  const arrivalHowToArrive = primaryRoom?.check_in_instructions || houseRules.check_in_instructions || '';
  const arrivalDaysBefore = toFiniteNumber(houseRules.days_before_arrival) ?? 0;

  // Deposit/prepayment + security deposit from amenities.banking or room type
  const banking = (amenities as any)?.banking || {};
  const depositPercent = toFiniteNumber(
    banking.deposit_percentage ?? banking.prepayment_percentage ?? banking.prepayment_percent,
  );
  const depositAmount = toFiniteNumber(
    banking.deposit_amount ?? banking.prepayment_amount ?? banking.deposit ?? banking.prepayment,
  );
  const deposit = depositPercent && depositPercent > 0
    ? depositPercent
    : depositAmount && depositAmount > 0
      ? depositAmount
      : 0;
  const depositTypeId = depositPercent && depositPercent > 0 ? 3 : depositAmount && depositAmount > 0 ? 5 : 1;
  const securityDeposit = banking.security_deposit || primaryRoom?.security_deposit || undefined;
  const cleaningPrice = toFiniteNumber(primaryRoom?.cleaning_fee) ?? 0;

  // Build rooms from room types
  const rooms = roomTypes.map((rt, i) => ({
    room_id: i + 1,
    amenities: mapAmenities(rt.amenities).slice(0, 5),
  }));

  if (rooms.length === 0) {
    rooms.push({ room_id: 1, amenities: [{ id: 2, count: 1 }] });
  }

  // Collect all images from property + room types
  let allImages = mapImages(property.images as unknown[] | null);
  for (const rt of roomTypes) {
    allImages = allImages.concat(mapImages(rt.images as unknown[] | null));
  }
  // Deduplicate by URL
  const seenUrls = new Set<string>();
  allImages = allImages.filter(img => {
    if (seenUrls.has(img.url)) return false;
    seenUrls.add(img.url);
    return true;
  });
  allImages = allImages.map((img, index) => ({
    ...img,
    is_main: index === 0,
    type_id: index === 0 ? 1 : (img.type_id && img.type_id !== 1 ? img.type_id : 3),
  }));

  // Build descriptions
  const descText = property.description || property.name || 'Beautiful property';
  const descriptions = [{ language_id: 1, text: descText }];

  // Cancellation policies from DB
  const cancellationPolicies = mapCancellationPolicies(amenities as Record<string, unknown>);

  // Number of beds: sum from room types, or derive from bedrooms/max_guests
  const totalBeds = roomTypes.reduce((sum, rt) => sum + (rt.beds || 0), 0);
  const numberOfBeds = totalBeds > 0 ? totalBeds : (property.bedrooms || Math.max(1, maxGuests));

  return {
    name: property.name,
    property_type_id: objectTypeId,
    can_sleep_max: maxGuests,
    standard_guests: Math.ceil(maxGuests * 0.7),
    number_of_beds: numberOfBeds,
    owner_id: 738925,
    no_of_units: 1,
    floor: 0,
    space,
    street,
    detailed_location_id: locationId,
    zip_code: zipCode,
    latitude: lat,
    longitude: lng,
    amenities: mapAmenities(property.amenities),
    rooms,
    descriptions,
    images: allImages,
    payment_methods: mapPaymentMethods(property.amenities),
    deposit,
    deposit_type_id: depositTypeId,
    cleaning_price: cleaningPrice,
    cancellation_policies: cancellationPolicies,
    security_deposit: securityDeposit,
    arrival_landlord: String(arrivalLandlord),
    arrival_email: String(arrivalEmail),
    arrival_phone: String(arrivalPhone),
    arrival_days_before: arrivalDaysBefore,
    arrival_how_to_arrive: String(arrivalHowToArrive),
    check_in_from: checkInFrom,
    check_in_to: checkInTo,
    check_out_until: checkOutUntil,
    check_in_place: 'at_the_apartment',
  };
}

// ── Extract RU Property ID from response XML ────────────────

function extractRUPropertyId(rawXml: string): string | null {
  // RU returns <ID>123</ID> in Push_PutProperty_RS (not <PropertyID>)
  const match = rawXml.match(/<ID>(\d+)<\/ID>/);
  return match?.[1] || null;
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

    // Load property
    const { data: property, error: propErr } = await supabase
      .from('properties')
      .select('id, name, description, property_type, address, city, country, latitude, longitude, max_guests, bedrooms, bathrooms, amenities, images, rentalsunited_property_id')
      .eq('id', property_id)
      .single();

    if (propErr || !property) {
      return new Response(
        JSON.stringify({ success: false, error: { code: 'NOT_FOUND', message: `Property not found: ${propErr?.message}` } }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Load room types
    const { data: roomTypes } = await supabase
      .from('hostfully_room_types')
      .select('id, name, description, max_guests, bedrooms, bathrooms, beds, amenities, images, check_in_time, check_out_time, check_in_instructions, cleaning_fee, security_deposit, address_street, address_postal_code, latitude, longitude, property_type, cancellation_policy, room_size')
      .eq('property_id', property_id)
      .eq('is_active', true);

    // Resolve RU location ID from coordinates
    const lat = property.latitude || (roomTypes?.[0] as any)?.latitude || 0;
    const lng = property.longitude || (roomTypes?.[0] as any)?.longitude || 0;
    const locationId = await resolveLocationId(supabase, lat, lng);

    // Build the RU payload
    const ruPayload = buildRUPayload(property as PropertyRow, (roomTypes || []) as RoomTypeRow[], locationId);

    // Determine RU property ID: use existing or 0 for new
    const existingRuId = property.rentalsunited_property_id
      ? parseInt(property.rentalsunited_property_id, 10)
      : 0;

    console.log(`[push-property-to-ru] Mapped property "${property.name}" → RU format (${ruPayload.images.length} images, ${ruPayload.amenities.length} amenities, locationId: ${locationId}, maxGuests: ${ruPayload.can_sleep_max})`);

    // Dry run: return mapped payload without pushing
    if (dry_run) {
      return new Response(
        JSON.stringify({
          success: true,
          dry_run: true,
          property_id,
          ru_property_id: existingRuId || null,
          mapped_payload: ruPayload,
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

    // Validate minimums before pushing (only enforce for NEW properties, not updates)
    if (existingRuId === 0 && ruPayload.images.length < 10) {
      return new Response(
        JSON.stringify({
          success: false,
          error: {
            code: 'VALIDATION_FAILED',
            message: `Property needs at least 10 images (has ${ruPayload.images.length}). Add more images before pushing to RU.`,
          },
        }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Call rentalsunited-api push_property
    const { data: pushResult, error: pushErr } = await supabase.functions.invoke('rentalsunited-api', {
      body: {
        action: 'push_property',
        ru_property_id: existingRuId,
        property: ruPayload,
      },
    });

    if (pushErr) {
      console.error('[push-property-to-ru] Push failed:', pushErr.message);
      return new Response(
        JSON.stringify({ success: false, error: { code: 'PUSH_FAILED', message: pushErr.message } }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!pushResult?.success) {
      console.error('[push-property-to-ru] RU push failed:', JSON.stringify(pushResult?.error));
      if (pushResult?.diagnostics) {
        console.error('[push-property-to-ru] Diagnostics:', JSON.stringify(pushResult.diagnostics));
      }
      return new Response(
        JSON.stringify({
          success: false,
          error: pushResult?.error || { code: 'RU_ERROR', message: 'Unknown RU error' },
          diagnostics: pushResult?.diagnostics || null,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract RU property ID from response
    let ruPropertyId = existingRuId > 0 ? String(existingRuId) : null;
    if (pushResult.raw_xml) {
      const extractedId = extractRUPropertyId(pushResult.raw_xml);
      if (extractedId) {
        ruPropertyId = extractedId;
      }
    }

    // Store RU property ID back on the property
    if (ruPropertyId) {
      const { error: updateErr } = await supabase
        .from('properties')
        .update({ rentalsunited_property_id: ruPropertyId })
        .eq('id', property_id);

      if (updateErr) {
        console.error('[push-property-to-ru] Failed to save RU ID:', updateErr.message);
      } else {
        console.log(`[push-property-to-ru] Saved RU property ID ${ruPropertyId} for ${property_id}`);
      }
    }

    // ── Push Availability & Prices from Seasons data ──────────
    const finalRuId = parseInt(ruPropertyId || '0', 10);
    const amenities = (property.amenities || {}) as Record<string, any>;
    const seasons = amenities.seasons as any[] | undefined;
    const seasonRates = amenities.season_rates as Record<string, any> | undefined;
    const pushExtras: { availability_pushed?: boolean; prices_pushed?: boolean; availability_error?: string; prices_error?: string } = {};

    if (finalRuId > 0 && !dry_run) {
      const totalUnits = (roomTypes || []).length || 1;
      const today = new Date();
      const todayStr = today.toISOString().slice(0, 10);
      const oneYearLater = new Date(today);
      oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);
      const oneYearStr = oneYearLater.toISOString().slice(0, 10);

      // Collect all season periods with their season metadata
      type PeriodEntry = { from: string; to: string; minStay: number; seasonId: string };
      const allPeriods: PeriodEntry[] = [];
      if (Array.isArray(seasons)) {
        for (const season of seasons) {
          const periods = season.periods || [{ from: season.from, to: season.to }];
          for (const period of periods) {
            if (period.from && period.to) {
              allPeriods.push({ from: period.from, to: period.to, minStay: season.minStay || 1, seasonId: String(season.id) });
            }
          }
        }
      }
      // Sort by start date
      allPeriods.sort((a, b) => a.from.localeCompare(b.from));

      // Find the latest end date covered by seasons
      let latestEnd = todayStr;
      for (const p of allPeriods) {
        if (p.to > latestEnd) latestEnd = p.to;
      }

      // If seasons don't cover up to oneYearStr, extend with a filler period
      if (latestEnd < oneYearStr) {
        const nextDay = new Date(latestEnd);
        nextDay.setDate(nextDay.getDate() + 1);
        const fillerFrom = nextDay.toISOString().slice(0, 10);
        if (fillerFrom <= oneYearStr) {
          allPeriods.push({ from: fillerFrom, to: oneYearStr, minStay: 1, seasonId: '__filler__' });
        }
      }

      // Build availability entries
      if (allPeriods.length > 0) {
        try {
          const availEntries = allPeriods.map(p => ({
            date_from: p.from,
            date_to: p.to,
            units: totalUnits,
            min_stay: p.minStay,
          }));

          const { data: availResult, error: availErr } = await supabase.functions.invoke('rentalsunited-api', {
            body: { action: 'push_availability', ru_property_id: finalRuId, availability: availEntries },
          });
          if (availErr || !availResult?.success) {
            pushExtras.availability_error = availErr?.message || availResult?.error?.message || 'Unknown error';
            console.error('[push-property-to-ru] Availability push failed:', pushExtras.availability_error);
          } else {
            pushExtras.availability_pushed = true;
            console.log(`[push-property-to-ru] Pushed ${availEntries.length} availability periods (up to ${oneYearStr})`);
          }
        } catch (e) {
          pushExtras.availability_error = e instanceof Error ? e.message : 'Unknown error';
        }
      }

      // Build prices: find lowest rate per season, extend filler with last known rate
      if (seasonRates && Array.isArray(seasons) && seasons.length > 0) {
        try {
          const priceEntries: { date_from: string; date_to: string; price: number }[] = [];
          let lastKnownRate = 0;

          for (const season of seasons) {
            const seasonId = String(season.id);
            let lowestRate = Infinity;
            for (const [, rateData] of Object.entries(seasonRates)) {
              if (typeof rateData === 'object' && rateData !== null) {
                for (const [subKey, subData] of Object.entries(rateData as Record<string, any>)) {
                  if (subKey.startsWith(seasonId + '-') && typeof subData === 'object' && subData !== null) {
                    const amount = (subData as any).roomAmount;
                    if (typeof amount === 'number' && amount > 0 && amount < lowestRate) {
                      lowestRate = amount;
                    }
                  }
                }
              }
            }
            if (lowestRate < Infinity) {
              lastKnownRate = lowestRate;
              const periods = season.periods || [{ from: season.from, to: season.to }];
              for (const period of periods) {
                if (period.from && period.to) {
                  priceEntries.push({ date_from: period.from, date_to: period.to, price: lowestRate });
                }
              }
            }
          }

          // Add filler price if seasons don't cover full year
          if (lastKnownRate > 0 && latestEnd < oneYearStr) {
            const nextDay = new Date(latestEnd);
            nextDay.setDate(nextDay.getDate() + 1);
            const fillerFrom = nextDay.toISOString().slice(0, 10);
            if (fillerFrom <= oneYearStr) {
              priceEntries.push({ date_from: fillerFrom, date_to: oneYearStr, price: lastKnownRate });
              console.log(`[push-property-to-ru] Extended prices with filler ${fillerFrom} → ${oneYearStr} @ ${lastKnownRate}`);
            }
          }

          if (priceEntries.length > 0) {
            const { data: priceResult, error: priceErr } = await supabase.functions.invoke('rentalsunited-api', {
              body: { action: 'push_prices', ru_property_id: finalRuId, prices: priceEntries },
            });
            if (priceErr || !priceResult?.success) {
              pushExtras.prices_error = priceErr?.message || priceResult?.error?.message || 'Unknown error';
              console.error('[push-property-to-ru] Prices push failed:', pushExtras.prices_error);
            } else {
              pushExtras.prices_pushed = true;
              console.log(`[push-property-to-ru] Pushed ${priceEntries.length} price periods`);
            }
          }
        } catch (e) {
          pushExtras.prices_error = e instanceof Error ? e.message : 'Unknown error';
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        property_id,
        rentalsunited_property_id: ruPropertyId,
        message: `Property "${property.name}" pushed to Rentals United successfully`,
        ...pushExtras,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[push-property-to-ru] Error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Unknown error' },
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
