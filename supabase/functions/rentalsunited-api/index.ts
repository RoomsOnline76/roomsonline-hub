import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * Rentals United XML API Adapter
 * 
 * Pull (read) actions:
 * - health_check: Verify API connectivity and credentials
 * - list_properties: Pull_ListOwnerProp_RQ
 * - get_property: Pull_ListSpecProp_RQ
 * - get_availability: Pull_ListPropertyAvailabilityCalendar_RQ
 * - get_prices: Pull_ListPropertyPrices_RQ
 * - list_reservations: Pull_ListReservations_RQ
 * - get_leads: Pull_GetLeads_RQ
 * - list_users: Pull_ListMyUsers_RQ
 * 
 * Push (write) actions:
 * - push_property: Push_PutProperty_RQ
 * - push_availability: Push_PutAvbUnits_RQ
 * - push_prices: Push_PutPrices_RQ (standard <Season> with optional EGPS/LOSS)
 * - push_prices_fsp: Push_PutPrices_RQ (Full Stay Pricing matrix)
 * - subscribe_notifications: LNM_PutHandlerUrl_RQ
 * - push_long_stay_discounts: Push_PutLongStayDiscounts_RQ
 * - push_last_minute_discounts: Push_PutLastMinuteDiscounts_RQ
 * - create_user: Push_CreateUser_RQ
 * - fill_company_details: Push_FillCompanyDetails_RQ
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// ── Types ────────────────────────────────────────────────────

interface RUCredentials {
  api_key: string;
  api_secret: string;
  endpoint: string;
  source: 'runtime_secrets' | 'database';
}

interface RUAmenity {
  id: number;
  count?: number;
}

interface RURoom {
  room_id: number;
  amenities: RUAmenity[];
}

interface RUDescription {
  language_id: number;
  text: string;
}

interface RUImage {
  url: string;
  type_id?: number;
  /** Additional RU tags for the same photo (emitted as repeated <Image> nodes). */
  extra_type_ids?: number[];
  is_main?: boolean;
}

interface RUCancellationPolicy {
  valid_from: number;
  valid_to: number;
  percentage: number;
}

interface RUBuildingUnitType {
  name: string;
  quantity: number;
}

interface RUPropertyPayload {
  name: string;
  property_type_id: number;
  object_type_id?: number; // Required when BuildingID is set; identifies the unit type within the building's Composition
  /**
   * RU CurrencyID (mandatory). Examples: ZAR=48, USD=144, NAD=91, EUR=47, GBP=49, BWP=24.
   * Without this RU silently falls back to the master account default currency, which is
   * why downstream channel checks (e.g. LekkeSlaap "ZAR currency not met") fail.
   */
  currency_id: number;
  can_sleep_max: number;
  standard_guests: number;
  number_of_beds?: number; // No longer emitted at Property root (RU XSD removed it); kept for back-compat / fallback bed count
  floor: number;
  space: number;
  street: string;
  detailed_location_id: number;
  zip_code: string;
  latitude: number;
  longitude: number;
  amenities: RUAmenity[];
  rooms: RURoom[];
  descriptions: RUDescription[];
  images: RUImage[];
  payment_methods: number[];
  deposit?: number;
  deposit_type_id?: number;
  cancellation_policies: RUCancellationPolicy[];
  owner_id?: number;
  no_of_units?: number;
  cleaning_price?: number;
  security_deposit?: number;
  arrival_landlord?: string;
  arrival_email?: string;
  arrival_phone?: string;
  arrival_days_before?: number;
  arrival_pickup_service?: string | null;
  arrival_how_to_arrive?: string | null;
  check_in_from?: string;
  check_in_to?: string;
  check_out_until?: string;
  check_in_place?: string;
  building_id?: number;
}

const PAYMENT_METHOD_LABELS: Record<number, string> = {
  1: 'Cash',
  2: 'Credit card',
  3: 'Mastercard',
  4: 'American Express',
  5: 'Bank transfer',
  6: 'PayPal',
};

interface RUAvailabilityEntry {
  date_from: string;
  date_to: string;
  units: number;
  min_stay?: number;
  max_stay?: number;
  changeover?: number; // RU <C>: 1=both (default), 2=checkin-only, 3=checkout-only, 4=none
}

interface RUExtraGuestPrice {
  extra_guests: number; // ExtraGuests attribute (1, 2, …)
  price: number;
}

interface RULosNightlyByGuests {
  nr_of_guests: number;
  price: number;
}

interface RULosPricing {
  nights: number; // <LOS Nights="N">
  price: number; // base nightly price for that LOS
  losps?: RULosNightlyByGuests[]; // optional per-guest overrides
}

interface RUPriceEntry {
  date_from: string;
  date_to: string;
  price: number;
  extra_guest_price?: number;
  /** Optional <EGPS> block — extra guest pricing per # of extra guests */
  extra_guest_prices?: RUExtraGuestPrice[];
  /** Optional <LOSS> block — length-of-stay nightly pricing */
  los_pricing?: RULosPricing[];
}

// Full Stay Pricing matrix (alternative to <Season>)
interface RUFspPriceCell {
  nr_of_nights: number;
  price: number;
}

interface RUFspRow {
  nr_of_guests: number;
  prices: RUFspPriceCell[];
}

interface RUFspSeason {
  date: string; // YYYY-MM-DD
  default_price: number;
  rows: RUFspRow[];
}

interface RUDiscountEntry {
  date_from: string;
  date_to: string;
  nights_from: number;
  nights_to?: number;
  discount_percentage: number;
}

interface RequestBody {
  action: string;
  property_id?: string;
  ru_property_id?: number;
  date_from?: string;
  date_to?: string;
  test_mode?: boolean;
  metadata?: Record<string, unknown>;
  // Push payloads
  property?: RUPropertyPayload;
  availability?: RUAvailabilityEntry[];
  prices?: RUPriceEntry[];
  fsp_seasons?: RUFspSeason[];
  handler_url?: string;
  discounts?: RUDiscountEntry[];
  search_terms?: string;
  // Building payloads
  building_name?: string;
  building_id?: number;
  unit_types?: RUBuildingUnitType[];
  property_ids?: number[];
  // Dry-run / mapping persistence
  dry_run?: boolean;
  property_uuid?: string;
  // User management payloads
  user?: { first_name: string; last_name: string; email: string; password: string };
  company?: { name: string; address?: string; city?: string; country?: string; phone?: string; email?: string; vat_number?: string };
  owner_id?: string | number;
  // Sub-user ("child") authentication. API keys are mandatory for RU accounts created
  // after the Nov-2025 rollout; username/password remains for legacy accounts only.
  auth_access_key?: string;
  auth_secret_key?: string;
  auth_username?: string;
  auth_password?: string;
  // API key management
  key_label?: string;
  target_access_key?: string;
}

// ── XML Helpers ──────────────────────────────────────────────

function buildAuthXml(creds: RUCredentials): string {
  return `<Authentication>
    <AccessKey>${escapeXml(creds.api_key)}</AccessKey>
    <SecretKey>${escapeXml(creds.api_secret)}</SecretKey>
  </Authentication>`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function extractStatusId(xml: string): { id: string; message: string } {
  // Check for <error ID="..."> responses first (XML parse errors, auth failures)
  const errorMatch = xml.match(/<error\s+ID="([^"]+)"[^>]*>([\s\S]*?)<\/error>/i);
  if (errorMatch) {
    return { id: errorMatch[1], message: errorMatch[2]?.trim() || 'RU error' };
  }
  const idMatch = xml.match(/<Status\s+ID="(\d+)"/);
  const msgMatch = xml.match(/<Status[^>]*>(.*?)<\/Status>/s);
  return {
    id: idMatch?.[1] || '0',
    message: msgMatch?.[1]?.trim() || 'Unknown',
  };
}

function extractPropertyIds(xml: string): { id: string; name: string }[] {
  const regex = /<Property\s+ID="(\d+)"[^>]*>[\s\S]*?<Name>(.*?)<\/Name>/g;
  const results: { id: string; name: string }[] = [];
  let match;
  while ((match = regex.exec(xml)) !== null) {
    results.push({ id: match[1], name: match[2].trim() });
  }
  return results;
}

function compactXml(xml: string): string {
  return xml.replace(/<\?xml[^?]*\?>\s*/gi, '').replace(/>\s+</g, '><').trim();
}

function sanitizeXmlForLogs(xml: string): string {
  return xml
    .replace(/<AccessKey>.*?<\/AccessKey>/gi, '<AccessKey>[REDACTED]</AccessKey>')
    .replace(/<SecretKey>.*?<\/SecretKey>/gi, '<SecretKey>[REDACTED]</SecretKey>')
    .replace(/<Password>.*?<\/Password>/gi, '<Password>[REDACTED]</Password>');
}

function previewXml(xml: string, limit = 1200): string {
  return xml.length > limit ? `${xml.substring(0, limit)}…` : xml;
}

// ── API Call Helper ──────────────────────────────────────────

async function callRentalsUnited(creds: RUCredentials, xmlBody: string): Promise<string> {
  const compactRequestXml = compactXml(xmlBody);
  console.log(`[rentalsunited-api] Compact XML first 500: "${previewXml(sanitizeXmlForLogs(compactRequestXml), 500)}"`);

  const response = await fetch(creds.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml; charset=utf-8' },
    body: compactRequestXml,
  });

  if (!response.ok) {
    throw new Error(`RU API returned HTTP ${response.status}: ${await response.text()}`);
  }

  return await response.text();
}

// ── Credential Loader ────────────────────────────────────────

async function loadCredentials(): Promise<RUCredentials | null> {
  const normalizeCredential = (value: string | null | undefined): string => (value ?? '').trim();
  const looksLikePlaceholder = (value: string): boolean => {
    const normalized = value.toLowerCase().trim();
    return !normalized
      || normalized === 'configured'
      || normalized.includes('placeholder')
      || normalized.includes('••')
      || normalized.includes('xxxx')
      || normalized.includes('enter accesskey')
      || normalized.includes('enter secretkey');
  };

  const envApiKey = normalizeCredential(Deno.env.get('RENTALS_UNITED_API_KEY'));
  const envApiSecret = normalizeCredential(Deno.env.get('RENTALS_UNITED_API_SECRET'));

  if (envApiKey && envApiSecret) {
    if (looksLikePlaceholder(envApiKey) || looksLikePlaceholder(envApiSecret)) return null;
    return {
      api_key: envApiKey,
      api_secret: envApiSecret,
      endpoint: normalizeCredential(Deno.env.get('RENTALS_UNITED_ENDPOINT')) || 'https://rm.rentalsunited.com/api/Handler.ashx',
      source: 'runtime_secrets',
    };
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data, error } = await supabase
      .from('pms_credentials')
      .select('api_key, api_secret, base_url')
      .eq('system_type', 'rentalsunited')
      .eq('is_active', true)
      .maybeSingle();

    if (error || !data) return null;

    const apiKey = normalizeCredential(data.api_key);
    const apiSecret = normalizeCredential(data.api_secret);
    if (looksLikePlaceholder(apiKey) || looksLikePlaceholder(apiSecret)) return null;

    return {
      api_key: apiKey,
      api_secret: apiSecret,
      endpoint: normalizeCredential(data.base_url) || 'https://rm.rentalsunited.com/api/Handler.ashx',
      source: 'database',
    };
  } catch {
    return null;
  }
}

// ── JSON Response Helper ─────────────────────────────────────

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function errorResponse(code: string, message: string, status = 400): Response {
  return jsonResponse({ success: false, error: { code, message } }, status);
}

// ── Pull XML Builders ────────────────────────────────────────

function buildListPropertiesXml(creds: RUCredentials, ownerId: number): string {
  // RU rejects Pull_ListOwnerProp_RQ without an <OwnerID> (status 94).
  return `<?xml version="1.0" encoding="utf-8"?>
<Pull_ListOwnerProp_RQ>
  ${buildAuthXml(creds)}
  <OwnerID>${ownerId}</OwnerID>
</Pull_ListOwnerProp_RQ>`;
}

function buildVerifyOwnerAccessXml(creds: RUCredentials, ownerId: number): string {
  return buildListPropertiesXml(creds, ownerId);
}

/**
 * Resolve the RU OwnerID to list properties for: explicit param → RU_OWNER_ID
 * secret → first owner returned by Pull_ListMyUsers_RQ.
 */
// No hardcoded master OwnerID: an unresolved OwnerID is a hard error so inventory
// is never silently attributed to the RoomsOnline master account.

async function resolveOwnerId(creds: RUCredentials, explicit?: number | string | null): Promise<number | null> {
  const direct = Number(explicit ?? Deno.env.get('RU_OWNER_ID') ?? '');
  if (Number.isFinite(direct) && direct > 0) return direct;
  try {
    const usersXml = await callRentalsUnited(creds, buildListUsersXml(creds));
    for (const u of extractUsers(usersXml)) {
      const id = Number(u.owner_id || u.user_account_id);
      if (Number.isFinite(id) && id > 0) return id;
    }
  } catch (_e) { /* fall through */ }
  return null;
}

function buildGetPropertyXml(creds: RUCredentials, propertyId: number): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<Pull_ListSpecProp_RQ>
  ${buildAuthXml(creds)}
  <PropertyID>${propertyId}</PropertyID>
</Pull_ListSpecProp_RQ>`;
}

function buildGetAvailabilityXml(creds: RUCredentials, propertyId: number, dateFrom: string, dateTo: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<Pull_ListPropertyAvailabilityCalendar_RQ>
  ${buildAuthXml(creds)}
  <PropertyID>${propertyId}</PropertyID>
  <DateFrom>${dateFrom}</DateFrom>
  <DateTo>${dateTo}</DateTo>
</Pull_ListPropertyAvailabilityCalendar_RQ>`;
}

function buildGetPricesXml(creds: RUCredentials, propertyId: number, dateFrom: string, dateTo: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<Pull_ListPropertyPrices_RQ>
  ${buildAuthXml(creds)}
  <PropertyID>${propertyId}</PropertyID>
  <DateFrom>${dateFrom}</DateFrom>
  <DateTo>${dateTo}</DateTo>
</Pull_ListPropertyPrices_RQ>`;
}

// RU's Pull_ListReservations_RQ / Pull_GetLeads_RQ require full datetime
// (`YYYY-MM-DD HH:MM:SS`). A bare `YYYY-MM-DD` triggers RU status -3
// "String was not recognized as a valid DateTime". Normalize defensively.
function normalizeRUDateTime(value: string, endOfDay = false): string {
  const trimmed = (value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return `${trimmed} ${endOfDay ? '23:59:59' : '00:00:00'}`;
  }
  // Already datetime-ish — pass through.
  return trimmed;
}

function buildListReservationsXml(creds: RUCredentials, dateFrom: string, dateTo: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<Pull_ListReservations_RQ>
  ${buildAuthXml(creds)}
  <DateFrom>${normalizeRUDateTime(dateFrom)}</DateFrom>
  <DateTo>${normalizeRUDateTime(dateTo, true)}</DateTo>
</Pull_ListReservations_RQ>`;
}

function buildGetLeadsXml(creds: RUCredentials, dateFrom: string, dateTo: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<Pull_GetLeads_RQ>
  ${buildAuthXml(creds)}
  <DateFrom>${normalizeRUDateTime(dateFrom)}</DateFrom>
  <DateTo>${normalizeRUDateTime(dateTo, true)}</DateTo>
</Pull_GetLeads_RQ>`;
}

// ── Push XML Builders ────────────────────────────────────────

function buildPushPropertyXml(creds: RUCredentials, propertyId: number, prop: RUPropertyPayload): string {
  const buildOptionalNode = (tag: string, value?: string | null) => {
    const normalized = value?.trim();
    return normalized ? `<${tag}>${escapeXml(normalized)}</${tag}>` : `<${tag} />`;
  };

  // Build CompositionRoomsAmenities. Per RU spec the attribute name is `CompositionRoomID`
  // (NOT `RoomID`). Wrong attribute name → RU silently parses 0 → "Wrong composition room id:0".
  const roomsXml = prop.rooms && prop.rooms.length > 0
    ? `<CompositionRoomsAmenities>
      ${prop.rooms.map(r => `<CompositionRoomAmenities CompositionRoomID="${r.room_id}">
        <Amenities>
          ${r.amenities.map(a => `<Amenity Count="${a.count || 1}">${a.id}</Amenity>`).join('\n          ')}
        </Amenities>
      </CompositionRoomAmenities>`).join('\n      ')}
    </CompositionRoomsAmenities>` : '';

  const amenitiesXml = prop.amenities
    .map(a => `<Amenity Count="${a.count || 1}">${a.id}</Amenity>`)
    .join('\n      ');

  const descriptionsXml = prop.descriptions
    .map(d => `<Description LanguageID="${d.language_id}"><Text>${escapeXml(d.text)}</Text></Description>`)
    .join('\n      ');

  // RU accepts one ImageTypeID per <Image> node, so a photo carrying multiple tags is
  // repeated with the same URL and a distinct tag on each node.
  let imageRefId = 0;
  const imagesXml = prop.images
    .flatMap((img, index) => {
      const primary = index === 0 ? 1 : (img.type_id && img.type_id !== 1 ? img.type_id : 3);
      const extras = (img.extra_type_ids || []).filter(
        (id) => Number.isFinite(id) && id > 0 && id !== 1 && id !== primary,
      );
      return [primary, ...Array.from(new Set(extras))].map((typeId) => {
        imageRefId += 1;
        return `<Image ImageTypeID="${typeId}" ImageReferenceID="${imageRefId}">${escapeXml(img.url)}</Image>`;
      });
    })
    .join('\n      ');

  const paymentMethodsXml = prop.payment_methods
    .map(pm => `<PaymentMethod PaymentMethodID="${pm}">${escapeXml(PAYMENT_METHOD_LABELS[pm] || `Method ${pm}`)}</PaymentMethod>`)
    .join('\n      ');

  const depositXml = `<Deposit DepositTypeID="${prop.deposit_type_id || 1}">${prop.deposit ?? 0}</Deposit>`;

  const cancellationPoliciesXml = prop.cancellation_policies
    .map(cp => `<CancellationPolicy ValidFrom="${cp.valid_from}" ValidTo="${cp.valid_to}">${cp.percentage}</CancellationPolicy>`)
    .join('\n      ');

  const cleaningPriceXml = `<CleaningPrice>${prop.cleaning_price ?? 0}</CleaningPrice>`;
  const arrivalInstructionsXml = `<ArrivalInstructions>
      <Landlord>${escapeXml(prop.arrival_landlord || 'RoomsOnline')}</Landlord>
      <Email>${escapeXml(prop.arrival_email || 'dev@roomsonline.co.za')}</Email>
      <Phone>${escapeXml(prop.arrival_phone || '+27 824602220')}</Phone>
      <DaysBeforeArrival>${Math.max(0, Math.trunc(prop.arrival_days_before ?? 0))}</DaysBeforeArrival>
      ${buildOptionalNode('PickupService', prop.arrival_pickup_service)}
      ${buildOptionalNode('HowToArrive', prop.arrival_how_to_arrive)}
    </ArrivalInstructions>`;

  // Build CheckInOut block
  const checkInOutXml = `<CheckInOut>
      <CheckInFrom>${prop.check_in_from || '14:00'}</CheckInFrom>
      <CheckInTo>${prop.check_in_to || '22:00'}</CheckInTo>
      <CheckOutUntil>${prop.check_out_until || '10:00'}</CheckOutUntil>
      <Place>${escapeXml(prop.check_in_place || 'at_the_apartment')}</Place>
    </CheckInOut>`;

  // SecurityDeposit is REQUIRED by RU XSD (must be the final element). Int32 only — no decimals.
  const secVal = prop.security_deposit != null ? Math.trunc(Number(prop.security_deposit)) : 0;
  const securityDepositXml = `\n    <SecurityDeposit DepositTypeID="${secVal > 0 ? 5 : 1}">${secVal}</SecurityDeposit>`;

  // Strict XSD element order per RU schema (validated against live RS errors):
  // ID > Name > OwnerID > CurrencyID > DetailedLocationID > IsActive > IsArchived >
  // CleaningPrice > Space > StandardGuests > CanSleepMax > PropertyTypeID > ObjectTypeID >
  // Floor > BuildingID > Street > ZipCode > Coordinates(Longitude+Latitude) >
  // CompositionRoomsAmenities > ArrivalInstructions > Amenities > Images > CheckInOut >
  // PaymentMethods > Deposit > CancellationPolicies > Descriptions > SecurityDeposit
  //
  // CurrencyID positioning: RU's XSD accepts <CurrencyID> immediately after <OwnerID>.
  // Without it RU silently inherits the master account's default currency — this is the
  // root cause of LekkeSlaap "ZAR currency not met" errors for South African properties.
  //
  // NOTES:
  //  - <NoOfUnits> was REMOVED — RU's XSD rejects it at this position with
  //    "invalid child element 'NoOfUnits'. List of possible elements expected: 'Floor'."
  //  - <Coordinates> wrapper is MANDATORY — loose <Longitude>/<Latitude> siblings produce
  //    "Missing mandatory element: Coordinates."
  //  - <NumberOfBeds> at root removed — bed counts go inside <CompositionRoomsAmenities> as
  //    bed amenities (97-101) within Bedroom blocks (RoomID=257). Per Pull_ListCompositionRooms_RQ
  //    the only valid IDs are: 53(WC), 81(Bathroom), 94(Kitchen+Living), 101(Kitchen),
  //    249(LivingRoom), 257(Bedroom), 372(LivingRoom/Bedroom), 517(Bedroom/LR/Kitchen).
  //    There is NO 81/82/83 per-bedroom variant — all bedrooms repeat RoomID=257.
  //  - <ObjectTypeID> is REQUIRED when <BuildingID> is set. Falls back to PropertyTypeID at
  //    the orchestrator layer when RU's building composition lookup is unavailable.
  //  - <ArrivalInstructions> MUST come AFTER <CompositionRoomsAmenities>. Placing it directly
  //    after Coordinates triggers schema error: "List of possible elements expected:
  //    'Distances, CompositionRooms, CompositionRoomsAmenities'."
  const objectTypeIdXml = prop.object_type_id && prop.object_type_id > 0
    ? `\n    <ObjectTypeID>${prop.object_type_id}</ObjectTypeID>` : '';

  return `<Push_PutProperty_RQ>
  ${buildAuthXml(creds)}
  <Property>
    <ID>${propertyId}</ID>
    <Name>${escapeXml(prop.name)}</Name>
    <OwnerID>${prop.owner_id}</OwnerID>
    <CurrencyID>${prop.currency_id}</CurrencyID>
    <DetailedLocationID TypeID="4">${prop.detailed_location_id}</DetailedLocationID>
    <IsActive>true</IsActive>
    <IsArchived>false</IsArchived>
    ${cleaningPriceXml}
    <Space>${prop.space}</Space>
    <StandardGuests>${Math.min(prop.standard_guests, prop.can_sleep_max)}</StandardGuests>
    <CanSleepMax>${prop.can_sleep_max}</CanSleepMax>
    <PropertyTypeID>${prop.property_type_id}</PropertyTypeID>${objectTypeIdXml}
    <Floor>${prop.floor}</Floor>${prop.building_id ? `\n    <BuildingID>${prop.building_id}</BuildingID>` : ''}
    <Street>${escapeXml(prop.street)}</Street>
    <ZipCode>${escapeXml(prop.zip_code)}</ZipCode>
    <Coordinates>
      <Longitude>${prop.longitude}</Longitude>
      <Latitude>${prop.latitude}</Latitude>
    </Coordinates>${roomsXml ? `\n    ${roomsXml}` : ''}
    <Amenities>
      ${amenitiesXml}
    </Amenities>
    <Images>
      ${imagesXml}
    </Images>
    ${arrivalInstructionsXml}
    ${checkInOutXml}
    <PaymentMethods>
      ${paymentMethodsXml}
    </PaymentMethods>
    ${depositXml}
    <CancellationPolicies>
      ${cancellationPoliciesXml}
    </CancellationPolicies>
    <Descriptions>
      ${descriptionsXml}
    </Descriptions>${securityDepositXml}
  </Property>
</Push_PutProperty_RQ>`;
}

function buildPushAvailabilityXml(creds: RUCredentials, propertyId: number, availability: RUAvailabilityEntry[]): string {
  // Push_PutAvbUnits_RQ — canonical schema per RU docs:
  //   https://developer.rentalsunited.com/#upload-available-units
  // Wrapper is <MuCalendar PropertyID="X"> with <Date From="..." To="..." MSMXTypeID="1">
  // child elements: <U> units, <MS> min stay, <MX> max stay, <C> changeover.
  const datesXml = availability
    .map(a => {
      const u = a.units ?? 0;
      const ms = a.min_stay ?? 1;
      const mx = a.max_stay ?? 30;
      const c = a.changeover ?? 1;
      return `<Date From="${a.date_from}" To="${a.date_to}" MSMXTypeID="1">
      <U>${u}</U>
      <MS>${ms}</MS>
      <MX>${mx}</MX>
      <C>${c}</C>
    </Date>`;
    })
    .join('\n    ');

  return `<?xml version="1.0" encoding="utf-8"?>
<Push_PutAvbUnits_RQ>
  ${buildAuthXml(creds)}
  <MuCalendar PropertyID="${propertyId}">
    ${datesXml}
  </MuCalendar>
</Push_PutAvbUnits_RQ>`;
}

function buildPushPricesXml(creds: RUCredentials, propertyId: number, prices: RUPriceEntry[]): string {
  // Canonical RU schema (https://developer.rentalsunited.com/#put-prices):
  //   <Prices PropertyID="X">
  //     <Season DateFrom="..." DateTo="...">
  //       <Price>...</Price>
  //       <Extra>...</Extra>           <!-- optional -->
  //       <LOSS>...</LOSS>             <!-- optional, length-of-stay nightly pricing -->
  //       <EGPS>...</EGPS>             <!-- optional, extra-guest pricing -->
  //     </Season>
  //   </Prices>
  // Element ordering inside <Season>: Price → Extra → LOSS → EGPS.
  const seasonsXml = prices
    .map(p => {
      const parts: string[] = [`<Price>${p.price}</Price>`];
      if (p.extra_guest_price != null) {
        parts.push(`<Extra>${p.extra_guest_price}</Extra>`);
      }
      if (p.los_pricing && p.los_pricing.length > 0) {
        const losXml = p.los_pricing
          .map(los => {
            const lospsXml = los.losps && los.losps.length > 0
              ? `\n          <LOSPS>${los.losps.map(lp => `\n            <LOSP NrOfGuests="${lp.nr_of_guests}"><Price>${lp.price}</Price></LOSP>`).join('')}\n          </LOSPS>`
              : '';
            return `<LOS Nights="${los.nights}"><Price>${los.price}</Price>${lospsXml}</LOS>`;
          })
          .join('\n        ');
        parts.push(`<LOSS>\n        ${losXml}\n      </LOSS>`);
      }
      if (p.extra_guest_prices && p.extra_guest_prices.length > 0) {
        const egpsXml = p.extra_guest_prices
          .map(eg => `<EGP ExtraGuests="${eg.extra_guests}"><Price>${eg.price}</Price></EGP>`)
          .join('\n        ');
        parts.push(`<EGPS>\n        ${egpsXml}\n      </EGPS>`);
      }
      return `<Season DateFrom="${p.date_from}" DateTo="${p.date_to}">\n      ${parts.join('\n      ')}\n    </Season>`;
    })
    .join('\n    ');

  return `<?xml version="1.0" encoding="utf-8"?>
<Push_PutPrices_RQ>
  ${buildAuthXml(creds)}
  <Prices PropertyID="${propertyId}">
    ${seasonsXml}
  </Prices>
</Push_PutPrices_RQ>`;
}

function buildPushFspPricesXml(creds: RUCredentials, propertyId: number, fspSeasons: RUFspSeason[]): string {
  // Full Stay Pricing matrix (https://developer.rentalsunited.com/#put-prices, Example 2):
  //   <Prices PropertyID><FSPSeasons><FSPSeason Date DefaultPrice>
  //     <FSPRows><FSPRow NrOfGuests><Prices><Price NrOfNights>...</Price></Prices></FSPRow></FSPRows>
  //   </FSPSeason></FSPSeasons></Prices>
  // Mutually exclusive with the standard <Season> form.
  const seasonsXml = fspSeasons
    .map(s => {
      const rowsXml = s.rows
        .map(r => {
          const pricesXml = r.prices
            .map(c => `<Price NrOfNights="${c.nr_of_nights}">${c.price}</Price>`)
            .join('\n              ');
          return `<FSPRow NrOfGuests="${r.nr_of_guests}">
            <Prices>
              ${pricesXml}
            </Prices>
          </FSPRow>`;
        })
        .join('\n          ');
      return `<FSPSeason Date="${s.date}" DefaultPrice="${s.default_price}">
        <FSPRows>
          ${rowsXml}
        </FSPRows>
      </FSPSeason>`;
    })
    .join('\n      ');

  return `<?xml version="1.0" encoding="utf-8"?>
<Push_PutPrices_RQ>
  ${buildAuthXml(creds)}
  <Prices PropertyID="${propertyId}">
    <FSPSeasons>
      ${seasonsXml}
    </FSPSeasons>
  </Prices>
</Push_PutPrices_RQ>`;
}

function validatePriceEntry(p: RUPriceEntry): string | null {
  if (!p.date_from || !p.date_to) return 'date_from and date_to are required';
  if (p.date_from > p.date_to) return `DateFrom (${p.date_from}) must be <= DateTo (${p.date_to})`;
  if (p.price == null || p.price < 0) return 'price must be >= 0';
  if (p.los_pricing) {
    for (const los of p.los_pricing) {
      if (los.nights == null || los.nights <= 0) return 'LOS nights must be > 0';
      if (los.price == null || los.price < 0) return 'LOS price must be >= 0';
    }
  }
  if (p.extra_guest_prices) {
    for (const eg of p.extra_guest_prices) {
      if (eg.extra_guests == null || eg.extra_guests <= 0) return 'EGP extra_guests must be > 0';
      if (eg.price == null || eg.price < 0) return 'EGP price must be >= 0';
    }
  }
  return null;
}

function validateFspSeason(s: RUFspSeason): string | null {
  if (!s.date) return 'FSP date is required';
  if (s.default_price == null || s.default_price < 0) return 'FSP default_price must be >= 0';
  if (!s.rows || s.rows.length === 0) return 'FSP rows are required';
  for (const r of s.rows) {
    if (r.nr_of_guests == null || r.nr_of_guests <= 0) return 'FSP nr_of_guests must be > 0';
    if (!r.prices || r.prices.length === 0) return 'FSP row prices required';
    for (const c of r.prices) {
      if (c.nr_of_nights == null || c.nr_of_nights <= 0) return 'FSP nr_of_nights must be > 0';
      if (c.price == null || c.price < 0) return 'FSP price must be >= 0';
    }
  }
  return null;
}

function buildGetLongStayDiscountsXml(creds: RUCredentials, propertyId: number): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<Pull_ListPropertyLongStayDiscounts_RQ>
  ${buildAuthXml(creds)}
  <PropertyID>${propertyId}</PropertyID>
</Pull_ListPropertyLongStayDiscounts_RQ>`;
}

function buildGetLastMinuteDiscountsXml(creds: RUCredentials, propertyId: number): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<Pull_ListPropertyLastMinuteDiscounts_RQ>
  ${buildAuthXml(creds)}
  <PropertyID>${propertyId}</PropertyID>
</Pull_ListPropertyLastMinuteDiscounts_RQ>`;
}

function buildSubscribeNotificationsXml(creds: RUCredentials, handlerUrl: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<LNM_PutHandlerUrl_RQ>
  ${buildAuthXml(creds)}
  <HandlerUrl>${escapeXml(handlerUrl)}</HandlerUrl>
</LNM_PutHandlerUrl_RQ>`;
}

function validateDiscountEntry(d: RUDiscountEntry): string | null {
  if (!d.date_from || !d.date_to) return 'date_from and date_to are required';
  if (d.date_from > d.date_to) return `DateFrom (${d.date_from}) must be <= DateTo (${d.date_to})`;
  if (d.nights_from == null || d.nights_from < 0) return 'nights_from must be >= 0';
  if (d.nights_to != null && d.nights_to < d.nights_from) return `nights_to (${d.nights_to}) must be >= nights_from (${d.nights_from})`;
  if (d.discount_percentage == null || d.discount_percentage < 0 || d.discount_percentage > 100) return 'discount_percentage must be 0-100';
  return null;
}

function buildPushLongStayDiscountsXml(creds: RUCredentials, propertyId: number, discounts: RUDiscountEntry[]): string {
  // Push_PutLongStayDiscounts_RQ — canonical RU schema:
  //   https://developer.rentalsunited.com/#put-long-stay-discounts
  //   <LongStays PropertyID="X">
  //     <LongStay DateFrom="..." DateTo="..." Bigger="N" Smaller="N">PERCENT</LongStay>
  //   </LongStays>
  // Bigger = min nights (inclusive), Smaller = max nights (inclusive), inner text = % off.
  const longStaysXml = discounts
    .map(d => {
      const smaller = d.nights_to != null ? ` Smaller="${d.nights_to}"` : '';
      return `<LongStay DateFrom="${d.date_from}" DateTo="${d.date_to}" Bigger="${d.nights_from}"${smaller}>${d.discount_percentage}</LongStay>`;
    })
    .join('\n    ');

  return `<?xml version="1.0" encoding="utf-8"?>
<Push_PutLongStayDiscounts_RQ>
  ${buildAuthXml(creds)}
  <LongStays PropertyID="${propertyId}">
    ${longStaysXml}
  </LongStays>
</Push_PutLongStayDiscounts_RQ>`;
}

function buildPushLastMinuteDiscountsXml(creds: RUCredentials, propertyId: number, discounts: RUDiscountEntry[]): string {
  // Push_PutLastMinuteDiscounts_RQ — canonical RU schema:
  //   https://developer.rentalsunited.com/#put-last-minute-discounts
  //   <LastMinutes PropertyID="X">
  //     <LastMinute DateFrom="..." DateTo="..." DaysToArrivalFrom="N" DaysToArrivalTo="N">PERCENT</LastMinute>
  //   </LastMinutes>
  // For last-minute: nights_from -> DaysToArrivalFrom, nights_to -> DaysToArrivalTo, inner text = % off.
  const lastMinutesXml = discounts
    .map(d => {
      const to = d.nights_to != null ? ` DaysToArrivalTo="${d.nights_to}"` : '';
      return `<LastMinute DateFrom="${d.date_from}" DateTo="${d.date_to}" DaysToArrivalFrom="${d.nights_from}"${to}>${d.discount_percentage}</LastMinute>`;
    })
    .join('\n    ');

  return `<?xml version="1.0" encoding="utf-8"?>
<Push_PutLastMinuteDiscounts_RQ>
  ${buildAuthXml(creds)}
  <LastMinutes PropertyID="${propertyId}">
    ${lastMinutesXml}
  </LastMinutes>
</Push_PutLastMinuteDiscounts_RQ>`;
}

function buildSetPropertyStatusXml(creds: RUCredentials, propertyId: number, isActive: boolean, isArchived: boolean): string {
  return `<Push_SetPropertiesStatus_RQ>
  ${buildAuthXml(creds)}
  <IsActive>${isActive ? 1 : 0}</IsActive>
  <IsArchived>${isArchived ? 1 : 0}</IsArchived>
  <PropertyIDs>
    <PropertyID>${propertyId}</PropertyID>
  </PropertyIDs>
</Push_SetPropertiesStatus_RQ>`;
}

function buildBuildingCompositionXml(unitTypes?: RUBuildingUnitType[]): string {
  if (!unitTypes || unitTypes.length === 0) return '';

  const unitTypeNodes = unitTypes
    .filter((unitType) => unitType.name?.trim() && Number.isFinite(unitType.quantity) && unitType.quantity > 0)
    .map((unitType) => `<UnitType><UnitTypeName>${escapeXml(unitType.name.trim())}</UnitTypeName><Quantity>${Math.trunc(unitType.quantity)}</Quantity></UnitType>`)
    .join('');

  return unitTypeNodes ? `<Composition><UnitsComposition>${unitTypeNodes}</UnitsComposition></Composition>` : '';
}

function buildPushBuildingXml(creds: RUCredentials, buildingId: number, buildingName: string, unitTypes?: RUBuildingUnitType[], childAuth?: ChildAuth | null): string {
  const truncatedName = buildingName.substring(0, 20);
  const buildingIdXml = buildingId > 0 ? `<BuildingID>${buildingId}</BuildingID>` : '';
  const compositionXml = buildBuildingCompositionXml(unitTypes);
  // Element order matters: RU's XSD expects <BuildingID> (update key) before
  // <BuildingName>. With the wrong order RU ignores the ID and creates a new
  // building on every push, which duplicates inventory.
  return `<Push_PutBuilding_RQ>${childAuth ? buildChildAuthXml(childAuth) : buildAuthXml(creds)}${buildingIdXml}<BuildingName>${escapeXml(truncatedName)}</BuildingName>${compositionXml}</Push_PutBuilding_RQ>`;
}

function buildListBuildingsXml(creds: RUCredentials, childAuth?: ChildAuth | null): string {
  return `<Pull_ListBuildings_RQ>${childAuth ? buildChildAuthXml(childAuth) : buildAuthXml(creds)}</Pull_ListBuildings_RQ>`;
}

function buildGetBuildingXml(creds: RUCredentials, buildingId: number, childAuth?: ChildAuth | null): string {
  return `<Pull_GetBuilding_RQ>${childAuth ? buildChildAuthXml(childAuth) : buildAuthXml(creds)}<BuildingID>${buildingId}</BuildingID></Pull_GetBuilding_RQ>`;
}


/**
 * Pull_ListCompositionRooms_RQ — fetch the global RU dictionary of valid
 * CompositionRoom IDs (e.g. bedroom variants like "1 single bed", "1 double bed").
 * These IDs are required when populating <CompositionRoomsAmenities> in property pushes.
 * Status 6 ("Wrong composition room id") is raised when an unknown ID is sent, so we
 * use this dictionary to resolve a valid ID per room rather than guessing.
 */
function buildListCompositionRoomsXml(creds: RUCredentials): string {
  return `<Pull_ListCompositionRooms_RQ>${buildAuthXml(creds)}</Pull_ListCompositionRooms_RQ>`;
}

/**
 * Pull_ListAmenities_RQ — fetch RU's global amenity dictionary (AmenityID + name,
 * optionally grouped by StaticName/AmenityTypeID). Used to populate the ROLOS
 * room/unit amenity picker with RU's real option set instead of hand-written labels.
 */
function buildListAmenitiesXml(creds: RUCredentials): string {
  return `<Pull_ListAmenities_RQ>${buildAuthXml(creds)}</Pull_ListAmenities_RQ>`;
}

/**
 * Parse Pull_ListAmenities_RS. RU has shipped several shapes over time:
 *  A) <Amenity AmenityID="6" AmenityTypeID="3">Internet</Amenity>
 *  B) <Amenity ID="6">Internet</Amenity>
 *  C) <Amenity><AmenityID>6</AmenityID><AmenityName>Internet</AmenityName></Amenity>
 */
function extractAmenities(xml: string): { id: number; name: string; group_id: number | null }[] {
  const results: { id: number; name: string; group_id: number | null }[] = [];
  const seen = new Set<number>();
  const decode = (s: string) =>
    s
      .replace(/&amp;amp;/gi, '&')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/\s+/g, ' ')
      .trim();
  const push = (rawId: string, rawName: string, rawGroup?: string | null) => {
    const id = parseInt(rawId, 10);
    const name = decode(rawName.replace(/<[^>]+>/g, ''));
    if (!Number.isFinite(id) || id <= 0 || !name || seen.has(id)) return;
    seen.add(id);
    const group = rawGroup ? parseInt(rawGroup, 10) : NaN;
    results.push({ id, name, group_id: Number.isFinite(group) ? group : null });
  };


  // Format A/B: attribute id + text content
  const attrRegex = /<Amenity\b([^>]*)>([\s\S]*?)<\/Amenity>/gi;
  let m: RegExpExecArray | null;
  while ((m = attrRegex.exec(xml)) !== null) {
    const attrs = m[1];
    const inner = m[2];
    const idMatch = attrs.match(/\bAmenityID\s*=\s*"(\d+)"/i) || attrs.match(/\bID\s*=\s*"(\d+)"/i);
    const groupMatch = attrs.match(/\bAmenityTypeID\s*=\s*"(\d+)"/i) || attrs.match(/\bTypeID\s*=\s*"(\d+)"/i);
    if (idMatch && inner.trim() && !/<Amenity(ID|Name)>/i.test(inner)) {
      push(idMatch[1], inner, groupMatch?.[1] ?? null);
      continue;
    }
    // Format C: child elements
    const cId = inner.match(/<AmenityID>(\d+)<\/AmenityID>/i);
    const cName = inner.match(/<AmenityName>([\s\S]*?)<\/AmenityName>/i);
    const cGroup = inner.match(/<AmenityTypeID>(\d+)<\/AmenityTypeID>/i);
    if (cId && cName) push(cId[1], cName[1], cGroup?.[1] ?? null);
  }

  return results;
}

/**
 * RU's dictionary is ~1600 entries deep and mixes clean amenity names with legacy
 * free-text fragments. We classify each entry into a readable category and flag a
 * curated "recommended" subset so the ROLOS picker can lead with the useful options
 * while still exposing the full catalogue through search.
 */
const AMENITY_CATEGORY_RULES: { category: string; re: RegExp }[] = [
  { category: 'Internet & Workspace', re: /(wi-?fi|internet|broadband|adsl|laptop|desk|work ?space|printer|computer|office|fax|copy service)/i },
  { category: 'Kitchen & Dining', re: /(kitchen|kettle|oven|hob|cooker|stove|microwave|toaster|fridge|freezer|dishwasher|crockery|cutlery|cookware|coffee|tea|dining|plates|pans|utensil|breakfast bar|wine|blender|bread maker|baking|dish rack|kitchenette|espresso)/i },
  { category: 'Bathroom', re: /(bath|shower|toilet|wc|bidet|towel|toiletr|hair ?dryer|washbasin|bathrobe|slipper|shampoo|conditioner|soap|sauna towel|vanity)/i },
  { category: 'Bedroom & Beds', re: /(bed|mattress|linen|pillow|blanket|duvet|wardrobe|cupboard|closet|chest of drawers|night ?table|bedside|bedroom|cot|bunk|sofabed|sofa bed)/i },
  { category: 'Laundry & Cleaning', re: /(washing machine|laundry|dryer|drier|drying|iron|ironing|vacuum|clean|maid|housekeep|dry cleaning)/i },
  { category: 'Entertainment & Media', re: /(tv|television|dvd|cd |cd player|stereo|radio|netflix|playstation|xbox|console|games|book|library|billiard|pool table|table tennis|darts|piano|music|cinema|blu-?ray|satellite|cable)/i },
  { category: 'Heating & Cooling', re: /(air ?conditioning|aircon|\bac\b|heating|heater|radiator|fan|fireplace|chimney|wood burner|ventilation|climate)/i },
  { category: 'Outdoor & Garden', re: /(balcon|terrace|patio|garden|yard|bbq|braai|grill|sun ?lounger|deck|veranda|courtyard|outdoor|porch|hammock|fire pit|roof)/i },
  { category: 'Pool, Spa & Leisure', re: /(pool|jacuzzi|hot ?tub|sauna|spa|steam|gym|fitness|tennis|golf|sport|bicycle|bike|kayak|surf|ski|beach|massage|wellness|yoga)/i },
  { category: 'Family & Children', re: /(baby|child|kid|cot|high ?chair|creche|playground|toys|babysit|stroller|crib)/i },
  { category: 'Safety & Security', re: /(smoke detector|carbon monoxide|fire ext|first aid|alarm|safe\b|security|cctv|surveillance|gated|lock ?box|guard|sprinkler|emergency)/i },
  { category: 'Accessibility', re: /(wheelchair|accessib|disabled|braille|lift|elevator|step-?free|grab rail|hoist|ramp)/i },
  { category: 'Parking & Transport', re: /(parking|garage|car ?port|shuttle|transfer|airport|car rental|charging|ev charg|bus|train|metro|taxi)/i },
  { category: 'Services & Facilities', re: /(reception|concierge|help desk|room service|breakfast|restaurant|bar\b|shop|atm|currency|conference|meeting|business centre|luggage|check-?in|check-?out|host|welcome|chef|pet|smoking|towel change|linen change)/i },
  { category: 'Views & Location', re: /(view|sea|ocean|lake|river|mountain|city cent|beachfront|canal|panoram|garden view|quiet area|busy area)/i },
  { category: 'Living Areas', re: /(living|lounge|sofa|armchair|coffee table|hall|corridor|conservator|dining room|study|room$|rooms$)/i },
];

const RECOMMENDED_AMENITY_IDS = new Set<number>([
  6, 7, 8, 9, 11, 13, 19, 21, 2, 3, 4, 5, 17, 81, 87, 89, 100, 101, 124, 125, 130, 131, 135,
  140, 143, 152, 157, 167, 174, 180, 181, 187, 227, 235, 249, 250, 408, 444, 445, 461, 589,
  620, 661, 667, 674, 780, 833, 838, 880, 943, 1846, 1867, 1868,
]);

function classifyAmenity(name: string, id: number): { category: string; is_recommended: boolean } {
  for (const rule of AMENITY_CATEGORY_RULES) {
    if (rule.re.test(name)) {
      return { category: rule.category, is_recommended: RECOMMENDED_AMENITY_IDS.has(id) };
    }
  }
  return { category: 'General', is_recommended: RECOMMENDED_AMENITY_IDS.has(id) };
}





/**
 * Parse the response of Pull_ListCompositionRooms_RQ.
 * RU returns: <CompositionRooms><CompositionRoom CompositionRoomID="1">Single bed</CompositionRoom>...</CompositionRooms>
 * Some accounts return child elements: <CompositionRoom><CompositionRoomID>1</CompositionRoomID><CompositionRoomName>...</CompositionRoomName></CompositionRoom>
 */
function extractCompositionRooms(xml: string): { id: number; name: string }[] {
  const results: { id: number; name: string }[] = [];

  // Format A: attribute + text content
  const attrRegex = /<CompositionRoom\b[^>]*\bCompositionRoomID\s*=\s*"(\d+)"[^>]*>([\s\S]*?)<\/CompositionRoom>/gi;
  let m: RegExpExecArray | null;
  while ((m = attrRegex.exec(xml)) !== null) {
    const inner = m[2].trim();
    // strip any nested tags, fall back to inner text
    const name = inner.replace(/<[^>]+>/g, '').trim();
    results.push({ id: parseInt(m[1], 10), name });
  }

  // Format B: child elements
  if (results.length === 0) {
    const childRegex = /<CompositionRoom>[\s\S]*?<CompositionRoomID>(\d+)<\/CompositionRoomID>[\s\S]*?<CompositionRoomName>([\s\S]*?)<\/CompositionRoomName>[\s\S]*?<\/CompositionRoom>/gi;
    while ((m = childRegex.exec(xml)) !== null) {
      results.push({ id: parseInt(m[1], 10), name: m[2].trim() });
    }
  }

  return results;
}

function extractBuildingId(xml: string): string | null {
  const match = xml.match(/<BuildingID>(\d+)<\/BuildingID>/);
  return match?.[1] || null;
}

/**
 * Parse the UnitsComposition block from a Push_PutBuilding_RS response.
 * RU returns: <UnitsComposition><UnitType><UnitTypeName>STUDIO</UnitTypeName><UnitTypeID>123</UnitTypeID>...</UnitType>...</UnitsComposition>
 * The UnitTypeID is the ObjectTypeID required when pushing units that reference this building.
 */
function extractUnitTypeObjectIds(xml: string): { name: string; object_type_id: number }[] {
  const results: { name: string; object_type_id: number }[] = [];
  const blockRegex = /<UnitType\b[^>]*>([\s\S]*?)<\/UnitType>/gi;
  let m: RegExpExecArray | null;
  while ((m = blockRegex.exec(xml)) !== null) {
    const block = m[1];
    const nameMatch = block.match(/<UnitTypeName>([\s\S]*?)<\/UnitTypeName>/i);
    const idMatch = block.match(/<UnitTypeID>(\d+)<\/UnitTypeID>/i);
    if (nameMatch && idMatch) {
      results.push({ name: nameMatch[1].trim(), object_type_id: parseInt(idMatch[1], 10) });
    }
  }
  return results;
}

function extractBuildings(xml: string): { id: string; name: string }[] {
  const results: { id: string; name: string }[] = [];
  // RU returns buildings as self-closing or open tags with attributes:
  // <Building BuildingID="123" BuildingName="Foo" /> or <Building BuildingID="123" BuildingName="Foo">...</Building>
  const attrRegex = /<Building\b[^>]*\bBuildingID\s*=\s*"(\d+)"[^>]*\bBuildingName\s*=\s*"([^"]*)"[^>]*\/?>/g;
  let match;
  while ((match = attrRegex.exec(xml)) !== null) {
    results.push({ id: match[1], name: match[2].trim() });
  }
  // Fallback: handle attribute order reversed (BuildingName before BuildingID)
  if (results.length === 0) {
    const reverseRegex = /<Building\b[^>]*\bBuildingName\s*=\s*"([^"]*)"[^>]*\bBuildingID\s*=\s*"(\d+)"[^>]*\/?>/g;
    while ((match = reverseRegex.exec(xml)) !== null) {
      results.push({ id: match[2], name: match[1].trim() });
    }
  }
  // Fallback: legacy child-element format
  if (results.length === 0) {
    const childRegex = /<Building>[\s\S]*?<BuildingID>(\d+)<\/BuildingID>[\s\S]*?<BuildingName>(.*?)<\/BuildingName>[\s\S]*?<\/Building>/g;
    while ((match = childRegex.exec(xml)) !== null) {
      results.push({ id: match[1], name: match[2].trim() });
    }
  }
  return results;
}

// ── User Management XML Builders ─────────────────────────────

function buildCreateUserXml(
  creds: RUCredentials,
  user: { first_name: string; last_name: string; email: string; password: string },
  locationIds: number[],
): string {
  // Per RU spec: FirstName/LastName/Email/Password are DIRECT children of the root
  // (no <User> wrapper) and <Locations> with at least one <LocationId> is mandatory.
  const locations = locationIds.map((id) => `    <LocationId>${id}</LocationId>`).join('\n');
  return `<?xml version="1.0" encoding="utf-8"?>
<Push_CreateUser_RQ>
  ${buildAuthXml(creds)}
  <FirstName>${escapeXml(user.first_name)}</FirstName>
  <LastName>${escapeXml(user.last_name)}</LastName>
  <Email>${escapeXml(user.email)}</Email>
  <Password>${escapeXml(user.password)}</Password>
  <Locations>
${locations}
  </Locations>
</Push_CreateUser_RQ>`;
}


function buildListUsersXml(creds: RUCredentials): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<Pull_ListMyUsers_RQ>
  ${buildAuthXml(creds)}
</Pull_ListMyUsers_RQ>`;
}

/**
 * Push_FillCompanyDetails_RQ — the RU schema has NO UserAccountId: the details are
 * applied to whichever account authenticates. To fill a sub-user's profile we must
 * therefore authenticate as that sub-user (UserName/Password), not with the master
 * AccessKey/SecretKey. `auth` carries those child credentials when supplied.
 */
interface RUCompanyPayload {
  // ContactInfo (all mandatory on RU)
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  city: string;
  country_id: number;
  address: string;
  zip_code: string;
  birth_date?: string;
  language_id?: number;
  // CompanyInfo
  name: string;
  website?: string;
  company_city?: string;
  company_address?: string;
  company_country_id?: number;
  post_code?: string;
  company_phone?: string;
  vat_number?: string;
  merchant_name?: string;
  location_ids?: number[];
  // CompanyInfo extras — verified against the RU reference (Fill company details).
  time_zone?: string;
  region?: string;
  manager_identification_number?: string;
  number_of_properties?: number;
  number_of_employees?: number;
  years_in_business?: number;
  describe_your_business?: string;
  // LegalRepresentativeInfo — the only block that carries a nationality.
  legal_rep?: {
    first_name?: string;
    last_name?: string;
    email?: string;
    city?: string;
    country_of_residence_id?: number;
    address?: string;
    post_code?: string;
    birthday?: string;
    nationality_id?: number;
    region?: string;
  } | null;
}

const RU_COMPANY_REQUIRED: (keyof RUCompanyPayload)[] = [
  'first_name', 'last_name', 'email', 'phone', 'city', 'country_id', 'address', 'zip_code', 'name',
];

function missingCompanyFields(company: Partial<RUCompanyPayload>): string[] {
  const missing = RU_COMPANY_REQUIRED.filter((k) => {
    const v = (company as Record<string, unknown>)[k as string];
    return v === undefined || v === null || String(v).trim() === '' || (k === 'country_id' && !Number(v));
  }).map(String);
  if (!Array.isArray(company.location_ids) || company.location_ids.length === 0) missing.push('location_ids');
  return missing;
}

/**
 * Sub-user ("child") authentication envelope. RU treats every sub-user as a separate
 * account: since the API-keys rollout (Nov 2025) new accounts MUST authenticate with
 * that sub-user's own AccessKey/SecretKey. Legacy accounts may still use the portal
 * UserName/Password pair, so both shapes are supported.
 *
 * 🔒 ADAPTER LOCK (RU child isolation): never substitute the MASTER AccessKey/SecretKey
 * here — child-scoped methods (buildings, company details, archive) have no OwnerID and
 * would be applied to the master account.
 */
type ChildAuth =
  | { mode: 'keys'; access_key: string; secret_key: string }
  | { mode: 'password'; username: string; password: string };

function buildChildAuthXml(auth: ChildAuth): string {
  if (auth.mode === 'keys') {
    return `<Authentication>
    <AccessKey>${escapeXml(auth.access_key)}</AccessKey>
    <SecretKey>${escapeXml(auth.secret_key)}</SecretKey>
  </Authentication>`;
  }
  return `<Authentication>
    <UserName>${escapeXml(auth.username)}</UserName>
    <Password>${escapeXml(auth.password)}</Password>
  </Authentication>`;
}

function childAuthMode(auth: ChildAuth | null): string {
  if (!auth) return 'parent_access_key';
  return auth.mode === 'keys' ? 'child_api_keys' : 'child_user_password';
}

/**
 * 🔒 ADAPTER LOCK (RU child isolation): Rentals United treats every sub-user as its
 * own account. An authenticated MASTER request creates/updates the listing on the
 * master account regardless of the <OwnerID> carried in the payload — that is why
 * property, ARI and discount pushes for white-label sub-users landed on the ROL
 * master account. Swapping the credentials that build the <Authentication> envelope
 * for the sub-user's own AccessKey/SecretKey is the fix.
 *
 * Legacy accounts with only a portal UserName/Password fall back to master auth +
 * <OwnerID> (the pre-migration behaviour) — nothing that works today breaks.
 */
function effectiveCreds(creds: RUCredentials, childAuth: ChildAuth | null): RUCredentials {
  if (childAuth && childAuth.mode === 'keys') {
    return { ...creds, api_key: childAuth.access_key, api_secret: childAuth.secret_key };
  }
  return creds;
}

/** Actions that operate on a single sub-user's inventory and must authenticate as that sub-user. */
const CHILD_SCOPED_ACTIONS = new Set([
  'push_property',
  'push_availability',
  'push_prices',
  'push_prices_fsp',
  'push_long_stay_discounts',
  'push_last_minute_discounts',
  'set_property_status',
  'get_property',
  'get_availability',
  'get_prices',
  'get_long_stay_discounts',
  'get_last_minute_discounts',
  'list_properties',
]);

/**
 * Resolve the credentials to use for a child-scoped RU call.
 *
 * Order: keys supplied on the request → keys stored for that sub-user in
 * ru_owner_accounts → username/password supplied on the request (pre-migration
 * accounts only). Returns null when nothing usable is available.
 */
async function resolveChildAuth(body: RequestBody): Promise<ChildAuth | null> {
  const suppliedKey = typeof body.auth_access_key === 'string' ? body.auth_access_key.trim() : '';
  const suppliedSecret = typeof body.auth_secret_key === 'string' ? body.auth_secret_key.trim() : '';
  if (suppliedKey && suppliedSecret) {
    return { mode: 'keys', access_key: suppliedKey, secret_key: suppliedSecret };
  }

  const username = typeof body.auth_username === 'string' ? body.auth_username.trim() : '';
  const ownerId = body.owner_id != null ? String(body.owner_id).trim() : '';

  if (username || ownerId) {
    try {
      const admin = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      );

      const decrypt = async (enc: unknown): Promise<string | null> => {
        if (!enc) return null;
        const { data: secret } = await admin.rpc('decrypt_sensitive_text', { encrypted_data: enc });
        const plain = typeof secret === 'string' ? secret : '';
        if (!plain || plain === '[ENCRYPTED]' || plain === '[DECRYPTION_ERROR]') return null;
        return plain;
      };

      // Preferred store: per-OwnerID credentials (never overwritten by another sub-user)
      let credQuery = admin
        .from('ru_api_credentials')
        .select('access_key, secret_enc')
        .not('access_key', 'is', null)
        .limit(1);
      credQuery = ownerId ? credQuery.eq('ru_owner_id', ownerId) : credQuery.eq('login_email', username);
      const { data: credRow } = await credQuery.maybeSingle();
      if (credRow?.access_key) {
        const plain = await decrypt(credRow.secret_enc);
        if (plain) return { mode: 'keys', access_key: String(credRow.access_key), secret_key: plain };
      }

      // Legacy store: keys held on the bound ru_owner_accounts row
      let query = admin
        .from('ru_owner_accounts')
        .select('ru_api_access_key, ru_api_secret_enc')
        .not('ru_api_access_key', 'is', null)
        .limit(1);
      query = ownerId ? query.eq('ru_owner_id', ownerId) : query.eq('ru_login_email', username);
      const { data } = await query.maybeSingle();
      if (data?.ru_api_access_key && data?.ru_api_secret_enc) {
        const plain = await decrypt(data.ru_api_secret_enc);
        if (plain) return { mode: 'keys', access_key: String(data.ru_api_access_key), secret_key: plain };
      }
    } catch (e) {
      console.warn('[rentalsunited-api] child key lookup failed', e);
    }
  }


  const password = typeof body.auth_password === 'string' ? body.auth_password : '';
  if (username && password) return { mode: 'password', username, password };
  return null;
}

const CHILD_AUTH_REQUIRED_MESSAGE =
  'This action must authenticate as the RU sub-user. Rentals United requires the sub-user\'s own API keys (AccessKey + SecretKey) — generate them in the RU dashboard under Security settings and save them in Portfolios → RU accounts, then retry.';

function buildFillCompanyDetailsXml(
  creds: RUCredentials,
  company: RUCompanyPayload,
  ownerId: number,
  childAuth?: ChildAuth | null,
): string {
  const optNode = (tag: string, val?: string | number) =>
    val !== undefined && val !== null && String(val).trim() !== '' ? `<${tag}>${escapeXml(String(val))}</${tag}>` : '';
  const locations = (company.location_ids ?? []).map((id) => `      <Location Id="${Number(id)}" />`).join('\n');
  // LegalRepresentativeInfo is optional, but RU's XSD fixes the element order:
  // FirstName → LastName → Email → City → CountryOfResidenceId → Address → PostCode
  // → Birthday → NationalityId → Region.
  const rep = company.legal_rep ?? null;
  const repNodes = rep
    ? [
        optNode('FirstName', rep.first_name),
        optNode('LastName', rep.last_name),
        optNode('Email', rep.email),
        optNode('City', rep.city),
        optNode('CountryOfResidenceId', rep.country_of_residence_id),
        optNode('Address', rep.address),
        optNode('PostCode', rep.post_code),
        optNode('Birthday', rep.birthday),
        optNode('NationalityId', rep.nationality_id),
        optNode('Region', rep.region),
      ].filter(Boolean)
    : [];
  const legalRepXml = repNodes.length > 0
    ? `\n  <LegalRepresentativeInfo>\n    ${repNodes.join('\n    ')}\n  </LegalRepresentativeInfo>`
    : '';
  return `<?xml version="1.0" encoding="utf-8"?>
<Push_FillCompanyDetails_RQ>
  ${childAuth ? buildChildAuthXml(childAuth) : buildAuthXml(creds)}
  ${childAuth ? '' : `<OwnerID>${ownerId}</OwnerID>`}

  <ContactInfo>
    <FirstName>${escapeXml(company.first_name)}</FirstName>
    <LastName>${escapeXml(company.last_name)}</LastName>
    <Email>${escapeXml(company.email)}</Email>
    <Phone>${escapeXml(company.phone)}</Phone>
    <City>${escapeXml(company.city)}</City>
    <CountryId>${Number(company.country_id)}</CountryId>
    <Address>${escapeXml(company.address)}</Address>
    <ZipCode>${escapeXml(company.zip_code)}</ZipCode>
    <BirthDate>${escapeXml(company.birth_date || '1990-01-01')}</BirthDate>
    <LanguageId>${Number(company.language_id ?? 1)}</LanguageId>
  </ContactInfo>
  <CompanyInfo>
    <CompanyName>${escapeXml(company.name)}</CompanyName>
    <WebsiteAddress>${escapeXml(company.website || 'https://sleepinafrica.roomsonline.co.za')}</WebsiteAddress>
    <CompanyCity>${escapeXml(company.company_city || company.city)}</CompanyCity>
    ${optNode('Address', company.company_address || company.address)}
    ${optNode('CountryId', company.company_country_id ?? company.country_id)}
    ${optNode('PostCode', company.post_code || company.zip_code)}
    ${optNode('TimeZone', company.time_zone)}
    ${optNode('Region', company.region)}
    ${optNode('PhoneNumber', company.company_phone || company.phone)}
    ${optNode('VATNumber', company.vat_number)}
    ${optNode('ManagerIdentificationNumber', company.manager_identification_number)}
    <MerchantName>${escapeXml(company.merchant_name || company.name)}</MerchantName>
    <Locations>
${locations}
    </Locations>
    ${optNode('NumberOfProperties', company.number_of_properties)}
    ${optNode('NumberOfEmployees', company.number_of_employees)}
    ${optNode('YearsInBusiness', company.years_in_business)}
    ${optNode('DescribeYourBusiness', company.describe_your_business)}
  </CompanyInfo>${legalRepXml}
</Push_FillCompanyDetails_RQ>`;
}


function extractUserAccountId(xml: string): string | null {
  const match = xml.match(/<UserAccountId>(\d+)<\/UserAccountId>/);
  return match?.[1] || null;
}

interface RUListedUser {
  user_account_id: string;
  email: string;
  first_name: string;
  last_name: string;
  owner_id: string;
  archived: boolean;
}

/**
 * OwnerIDs that must never be offered in the UI again (abandoned test sub-users we
 * cannot sign into to mint API keys, so they can neither be used nor archived).
 */
const RU_SUPPRESSED_OWNER_IDS = new Set(['741769', '741776']);

/** RU renames a closed sub-user's login to `Archived_<email>` / `Archived.<email>`. */
function isArchivedRuLogin(email: string, ownerId: string, block?: string): boolean {
  if (RU_SUPPRESSED_OWNER_IDS.has(String(ownerId).trim())) return true;
  if (/^archived[._-]/i.test(email.trim())) return true;
  if (block && /<(IsArchived|Archived)>\s*(true|1)\s*<\/(IsArchived|Archived)>/i.test(block)) return true;
  if (block && /<IsActive>\s*(false|0)\s*<\/IsActive>/i.test(block)) return true;
  return false;
}

function extractUsers(xml: string): RUListedUser[] {
  const results: RUListedUser[] = [];
  // Current RU format: <Owner OwnerID="741761"><FirstName/><SurName/><Email/>...<UserAccountId>0</UserAccountId></Owner>
  const ownerRegex = /<Owner\b[^>]*\bOwnerID\s*=\s*"(\d+)"[^>]*>([\s\S]*?)<\/Owner>/gi;
  let m: RegExpExecArray | null;
  while ((m = ownerRegex.exec(xml)) !== null) {
    const ownerId = m[1];
    const block = m[2];
    const val = (tag: string) => block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i'))?.[1]?.trim() ?? '';
    const email = val('Email') || val('UserName');
    results.push({
      user_account_id: val('UserAccountId') || '',
      first_name: val('FirstName'),
      last_name: val('SurName') || val('LastName'),
      email,
      owner_id: ownerId,
      archived: isArchivedRuLogin(email, ownerId, block),
    });
  }
  if (results.length > 0) return results;

  // Legacy format: <User><UserAccountId/><FirstName/><LastName/><Email/><OwnerID/></User>
  const regex = /<User>[\s\S]*?<UserAccountId>(\d+)<\/UserAccountId>[\s\S]*?<FirstName>(.*?)<\/FirstName>[\s\S]*?<LastName>(.*?)<\/LastName>[\s\S]*?<Email>(.*?)<\/Email>[\s\S]*?(?:<OwnerID>(\d+)<\/OwnerID>)?[\s\S]*?<\/User>/g;
  let match;
  while ((match = regex.exec(xml)) !== null) {
    const email = match[4]?.trim() || '';
    const ownerId = match[5] || '';
    results.push({
      user_account_id: match[1],
      first_name: match[2]?.trim() || '',
      last_name: match[3]?.trim() || '',
      email,
      owner_id: ownerId,
      archived: isArchivedRuLogin(email, ownerId),
    });
  }
  return results;
}


// ── Action Handlers ──────────────────────────────────────────

function handleRUStatus(response: string): { ok: boolean; status: { id: string; message: string } } {
  const status = extractStatusId(response);
  return { ok: status.id === '0', status };
}

interface RUNotif {
  status_id: string;
  date_from?: string;
  date_to?: string;
  message: string;
}

function parseRUNotifs(xml: string): RUNotif[] {
  const notifs: RUNotif[] = [];
  const regex = /<Notif\s+([^>]*)>([\s\S]*?)<\/Notif>/g;
  let m;
  while ((m = regex.exec(xml)) !== null) {
    const attrs = m[1];
    const message = m[2].trim();
    const sid = attrs.match(/StatusID="([^"]*)"/)?.[1] ?? '';
    const df = attrs.match(/DateFrom="([^"]*)"/)?.[1];
    const dt = attrs.match(/DateTo="([^"]*)"/)?.[1];
    notifs.push({ status_id: sid, date_from: df, date_to: dt, message });
  }
  return notifs;
}

// For Push_PutLongStayDiscounts_RQ / Push_PutLastMinuteDiscounts_RQ:
//   Status ID 0 = full success, Status ID 5 = partial (some ranges failed, see <Notifs>),
//   anything else = full failure.
function parseDiscountResponse(response: string): { ok: boolean; partial: boolean; status: { id: string; message: string }; notifs: RUNotif[] } {
  const status = extractStatusId(response);
  const notifs = parseRUNotifs(response);
  const ok = status.id === '0';
  const partial = status.id === '5';
  return { ok, partial, status, notifs };
}

function ruErrorResponse(status: { id: string; message: string }, diagnostics?: Record<string, unknown>): Response {
  return jsonResponse({
    success: false,
    error: { code: 'RU_ERROR', message: status.message, ru_status_id: status.id },
    ...(diagnostics ? { diagnostics } : {}),
  });
}

function parseXmlErrorPosition(message: string): number | null {
  const match = message.match(/\(\d+,\s*(\d+)\)/);
  return match ? parseInt(match[1], 10) : null;
}

function buildDiagnostics(compactRequestXml: string, status: { id: string; message: string }, stage: string, responseXml?: string): Record<string, unknown> {
  const safeXml = sanitizeXmlForLogs(compactRequestXml);
  const xmlPos = parseXmlErrorPosition(status.message);
  return {
    error_stage: stage,
    xml_length: safeXml.length,
    xml_error_position: xmlPos,
    xml_context: xmlPos ? safeXml.substring(Math.max(0, xmlPos - 60), xmlPos + 60) : null,
    request_preview: previewXml(safeXml, 600),
    request_xml: safeXml,
    response_preview: responseXml ? previewXml(responseXml, 600) : null,
  };
}

// ── Main Handler ─────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: RequestBody = await req.json();
    const { action, ru_property_id, date_from, date_to, test_mode, metadata } = body;

    console.log(`[rentalsunited-api] Action: ${action}, test_mode: ${test_mode}`);

    const creds = await loadCredentials();

    // ── health_check ──
    if (action === 'health_check') {
      if (!creds || (!creds.api_key && !creds.api_secret)) {
        return jsonResponse({
          healthy: false,
          status: 'not_configured',
          message: 'Rentals United credentials not configured',
          integration_status: 'in_development',
          metadata: { ...metadata, checked_at: new Date().toISOString() },
        });
      }

      try {
        const today = new Date().toISOString().split('T')[0];
        const yesterdayDate = new Date();
        yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1);
        const yesterday = yesterdayDate.toISOString().split('T')[0];
        const xml = buildListReservationsXml(creds, yesterday, today);
        const response = await callRentalsUnited(creds, xml);
        const { ok, status } = handleRUStatus(response);

        return jsonResponse({
          healthy: ok,
          status: ok ? 'ok' : 'error',
          message: ok
            ? 'Rentals United XML API AccessKey / SecretKey accepted successfully'
            : `Rentals United API error: ${status.message}`,
          ru_status_id: status.id,
          ru_status_message: status.message,
          integration_status: 'in_development',
          capabilities: {
            health_check: true,
            list_properties: true,
            get_property: true,
            get_availability: true,
            get_prices: true,
            list_reservations: true,
            get_leads: true,
            push_property: true,
            push_availability: true,
            push_prices: true,
            subscribe_notifications: true,
            push_long_stay_discounts: true,
            push_last_minute_discounts: true,
            create_user: true,
            list_users: true,
            fill_company_details: true,
          },
          metadata: { ...metadata, checked_at: new Date().toISOString(), credential_source: creds.source, probe: 'Pull_ListReservations_RQ' },
        });
      } catch (err) {
        return jsonResponse({
          healthy: false,
          status: 'connection_error',
          message: `Could not reach Rentals United: ${err instanceof Error ? err.message : 'Unknown error'}`,
          metadata: { ...metadata, checked_at: new Date().toISOString() },
        });
      }
    }

    // All other actions require credentials
    if (!creds || !creds.api_key || !creds.api_secret) {
      return errorResponse('NOT_CONFIGURED', 'Rentals United credentials not configured');
    }

    // ── verify_owner_api_access / verify_subuser_credentials (legacy alias) ──
    // RU portal credentials and XML API credentials are distinct surfaces. Verify
    // that the configured parent API account can reach the bound child OwnerID;
    // never report a valid portal password as invalid based on an API-only probe.
    if (action === 'verify_owner_api_access' || action === 'verify_subuser_credentials') {
      const ownerId = Number(body.owner_id);
      if (!Number.isFinite(ownerId) || ownerId <= 0) {
        return errorResponse('MISSING_PARAM', 'A valid owner_id is required');
      }
      const xml = buildVerifyOwnerAccessXml(creds, ownerId);
      const response = await callRentalsUnited(creds, xml);
      const { ok, status } = handleRUStatus(response);
      if (!ok) {
        return jsonResponse({
          success: false,
          verified: false,
          error: {
            code: 'RU_OWNER_API_ACCESS_FAILED',
            message: `Rentals United API access to OwnerID ${ownerId} failed (${status.message || 'access rejected'}).`,
            ru_status_id: status.id,
          },
        }, 200);
      }
      return jsonResponse({
        success: true,
        verified: true,
        api_access_verified: true,
        auth_mode: 'parent_access_key_owner_scope',
        owner_id: String(ownerId),
      });
    }

    // ── verify_child_login ──
    // Real sub-user login test on RU's XML surface. Prefers the sub-user's own API keys
    // (mandatory for accounts created after RU's Nov-2025 API-keys rollout) and falls back
    // to the legacy UserName/Password envelope for older accounts.
    if (action === 'verify_child_login') {
      const childAuth = await resolveChildAuth(body);
      if (!childAuth) {
        return errorResponse(
          'MISSING_PARAM',
          'auth_access_key + auth_secret_key (preferred) or auth_username + auth_password are required',
        );
      }
      const xml = buildListBuildingsXml(creds, childAuth);
      const response = await callRentalsUnited(creds, xml);
      const { ok, status } = handleRUStatus(response);
      return jsonResponse({
        success: true,
        verified: ok,
        auth_mode: childAuthMode(childAuth),
        ru_status_id: status.id ?? null,
        ru_status_message: status.message ?? null,
      });
    }

    // ── create_child_api_key: Push_CreateApiKey_RQ (authenticated AS the sub-user) ──
    // RU only returns the SecretKey once, at creation time, so the caller must persist it.
    if (action === 'create_child_api_key') {
      const childAuth = await resolveChildAuth(body);
      if (!childAuth) {
        return jsonResponse({
          success: false,
          error: { code: 'RU_CHILD_AUTH_REQUIRED', message: CHILD_AUTH_REQUIRED_MESSAGE },
        }, 422);
      }
      const label = (typeof body.key_label === 'string' && body.key_label.trim())
        ? body.key_label.trim().substring(0, 255)
        : 'ROLOS';
      const xml = `<?xml version="1.0" encoding="utf-8"?>
<Push_CreateApiKey_RQ>${buildChildAuthXml(childAuth)}<Scope>XmlApi</Scope><Label>${escapeXml(label)}</Label></Push_CreateApiKey_RQ>`;
      const response = await callRentalsUnited(creds, xml);
      const { ok, status } = handleRUStatus(response);
      if (!ok) {
        return ruErrorResponse(
          status,
          buildDiagnostics(sanitizeXmlForLogs(compactXml(xml)), status, 'create_child_api_key', response),
        );
      }
      const accessKey = response.match(/<AccessKey>([\s\S]*?)<\/AccessKey>/i)?.[1]?.trim() ?? null;
      const secretKey = response.match(/<SecretKey>([\s\S]*?)<\/SecretKey>/i)?.[1]?.trim() ?? null;
      return jsonResponse({
        success: true,
        auth_mode: childAuthMode(childAuth),
        access_key: accessKey,
        secret_key: secretKey,
        label,
        message: accessKey && secretKey
          ? 'API key created. The secret is only returned once — store it now.'
          : 'RU accepted the request but no key pair was found in the response.',
      });
    }

    // ── list_child_api_keys: Pull_GetApiKeys_RQ (authenticated AS the sub-user) ──
    if (action === 'list_child_api_keys') {
      const childAuth = await resolveChildAuth(body);
      if (!childAuth) {
        return jsonResponse({
          success: false,
          error: { code: 'RU_CHILD_AUTH_REQUIRED', message: CHILD_AUTH_REQUIRED_MESSAGE },
        }, 422);
      }
      const xml = `<?xml version="1.0" encoding="utf-8"?>
<Pull_GetApiKeys_RQ>${buildChildAuthXml(childAuth)}</Pull_GetApiKeys_RQ>`;
      const response = await callRentalsUnited(creds, xml);
      const { ok, status } = handleRUStatus(response);
      if (!ok) {
        return ruErrorResponse(
          status,
          buildDiagnostics(sanitizeXmlForLogs(compactXml(xml)), status, 'list_child_api_keys', response),
        );
      }
      const keys = [...response.matchAll(/<ApiKeys>([\s\S]*?)<\/ApiKeys>/gi)].map((m) => {
        const block = m[1];
        const pick = (tag: string) =>
          block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i'))?.[1]?.trim() ?? null;
        return {
          access_key: pick('AccessKey'),
          label: pick('Label'),
          scope: pick('Scope'),
          created_at: pick('CreationTime'),
          last_used_at: pick('LastUsageDate'),
        };
      });
      return jsonResponse({ success: true, auth_mode: childAuthMode(childAuth), keys, count: keys.length });
    }

    // ── delete_child_api_key: Push_DeleteApiKey_RQ (authenticated AS the sub-user) ──
    if (action === 'delete_child_api_key') {
      const target = typeof body.target_access_key === 'string' ? body.target_access_key.trim() : '';
      if (!target) return errorResponse('MISSING_PARAM', 'target_access_key is required');
      const childAuth = await resolveChildAuth(body);
      if (!childAuth) {
        return jsonResponse({
          success: false,
          error: { code: 'RU_CHILD_AUTH_REQUIRED', message: CHILD_AUTH_REQUIRED_MESSAGE },
        }, 422);
      }
      const xml = `<?xml version="1.0" encoding="utf-8"?>
<Push_DeleteApiKey_RQ>${buildChildAuthXml(childAuth)}<AccessKey>${escapeXml(target)}</AccessKey></Push_DeleteApiKey_RQ>`;
      const response = await callRentalsUnited(creds, xml);
      const { ok, status } = handleRUStatus(response);
      if (!ok) {
        return ruErrorResponse(
          status,
          buildDiagnostics(sanitizeXmlForLogs(compactXml(xml)), status, 'delete_child_api_key', response),
        );
      }
      return jsonResponse({ success: true, deleted_access_key: target });
    }




    // ── Child-scoped auth resolution ─────────────────────────
    // Every action below that touches ONE sub-user's inventory authenticates as that
    // sub-user when API keys are on file, so the listing lands on the sub-account.
    const childAuth = CHILD_SCOPED_ACTIONS.has(action) ? await resolveChildAuth(body) : null;
    const scopedCreds = effectiveCreds(creds, childAuth);
    const authMode = childAuthMode(childAuth);
    if (CHILD_SCOPED_ACTIONS.has(action)) {
      console.log(`[rentalsunited-api] ${action} auth_mode=${authMode} owner_id=${body.owner_id ?? 'n/a'}`);
    }

    // ── list_properties ──
    if (action === 'list_properties') {
      const ownerId = await resolveOwnerId(creds, body.owner_id);
      if (!ownerId) {
        return errorResponse('MISSING_PARAM', 'Rentals United OwnerID could not be resolved. Pass owner_id or set the RU_OWNER_ID secret.');
      }
      const xml = buildListPropertiesXml(scopedCreds, ownerId);
      const response = await callRentalsUnited(scopedCreds, xml);
      const { ok, status } = handleRUStatus(response);
      if (!ok) return ruErrorResponse(status);

      const properties = extractPropertyIds(response);
      return jsonResponse({ success: true, properties, count: properties.length });
    }

    // ── get_property ──
    if (action === 'get_property') {
      if (!ru_property_id) return errorResponse('MISSING_PARAM', 'ru_property_id is required');
      const xml = buildGetPropertyXml(scopedCreds, ru_property_id);
      const response = await callRentalsUnited(scopedCreds, xml);
      const { ok, status } = handleRUStatus(response);
      if (!ok) return ruErrorResponse(status);
      return jsonResponse({ success: true, raw_xml: response });
    }

    // ── get_availability ──
    if (action === 'get_availability') {
      if (!ru_property_id || !date_from || !date_to) return errorResponse('MISSING_PARAM', 'ru_property_id, date_from, date_to are required');
      const xml = buildGetAvailabilityXml(scopedCreds, ru_property_id, date_from, date_to);
      const response = await callRentalsUnited(scopedCreds, xml);
      const { ok, status } = handleRUStatus(response);
      if (!ok) return ruErrorResponse(status);
      return jsonResponse({ success: true, raw_xml: response });
    }

    // ── get_prices ──
    if (action === 'get_prices') {
      if (!ru_property_id || !date_from || !date_to) return errorResponse('MISSING_PARAM', 'ru_property_id, date_from, date_to are required');
      const xml = buildGetPricesXml(scopedCreds, ru_property_id, date_from, date_to);
      const response = await callRentalsUnited(scopedCreds, xml);
      const { ok, status } = handleRUStatus(response);
      if (!ok) return ruErrorResponse(status);
      return jsonResponse({ success: true, raw_xml: response });
    }

    // ── list_reservations ──
    if (action === 'list_reservations') {
      if (!date_from || !date_to) return errorResponse('MISSING_PARAM', 'date_from and date_to are required');
      const xml = buildListReservationsXml(creds, date_from, date_to);
      const response = await callRentalsUnited(creds, xml);
      const { ok, status } = handleRUStatus(response);
      if (!ok) return ruErrorResponse(status);
      return jsonResponse({ success: true, raw_xml: response });
    }

    // ── get_leads (optional) ──
    if (action === 'get_leads') {
      if (!date_from || !date_to) return errorResponse('MISSING_PARAM', 'date_from and date_to are required');
      const xml = buildGetLeadsXml(creds, date_from, date_to);
      const response = await callRentalsUnited(creds, xml);
      const { ok, status } = handleRUStatus(response);
      if (!ok) return ruErrorResponse(status);
      return jsonResponse({ success: true, raw_xml: response });
    }

    // ── push_property (mandatory) ──
    if (action === 'push_property') {
      if (ru_property_id == null || ru_property_id === undefined) return errorResponse('MISSING_PARAM', 'ru_property_id is required (use 0 for new properties)');
      if (!body.property) return errorResponse('MISSING_PARAM', 'property payload is required');
      const p = body.property;
      if (!Number.isFinite(Number(p.owner_id)) || Number(p.owner_id) <= 0) {
        return errorResponse('RU_OWNER_ID_REQUIRED', 'A positive linked sub-user owner_id is required; master-account fallback is prohibited');
      }
      if (!p.name || !p.property_type_id || !p.can_sleep_max || p.floor == null || !p.space) {
        return errorResponse('VALIDATION', 'Property must include name, property_type_id, can_sleep_max, floor, and space');
      }
      if (!p.street || !p.detailed_location_id || !p.zip_code) {
        return errorResponse('VALIDATION', 'Property must include street, detailed_location_id, and zip_code');
      }
      if (p.latitude == null || p.longitude == null) {
        return errorResponse('VALIDATION', 'Property must include latitude and longitude');
      }
      if (!p.amenities || p.amenities.length < 10) {
        return errorResponse('VALIDATION', 'Property must include at least 10 amenities');
      }
      if (!p.rooms || p.rooms.length === 0) {
        return errorResponse('VALIDATION', 'Property must include at least 1 room');
      }
      // Only enforce 10-image minimum for NEW properties (ru_property_id === 0)
      if (ru_property_id === 0 && (!p.images || p.images.length < 10)) {
        return errorResponse('VALIDATION', 'Property must include at least 10 images');
      }
      if (!p.payment_methods || p.payment_methods.length === 0) {
        return errorResponse('VALIDATION', 'Property must include at least 1 payment method');
      }
      if (!p.cancellation_policies || p.cancellation_policies.length === 0) {
        return errorResponse('VALIDATION', 'Property must include at least 1 cancellation policy');
      }
      if (!Number.isFinite(p.currency_id) || (p.currency_id as number) <= 0) {
        return errorResponse('VALIDATION', 'Property must include a valid RU currency_id (e.g. 48=ZAR, 144=USD, 91=NAD)');
      }
      if (!Number.isFinite(p.detailed_location_id) || (p.detailed_location_id as number) <= 1) {
        // RU LocationID 1 = Andorra/test sentinel. Reject so we never accidentally tag SA/NA properties as Andorra.
        return errorResponse('VALIDATION', 'Property must include a resolvable detailed_location_id (>1). Got: ' + p.detailed_location_id);
      }

      const xml = buildPushPropertyXml(scopedCreds, ru_property_id, p);
      const compactRequestXml = compactXml(xml);
      console.log(`[rentalsunited-api] Push XML length: ${compactRequestXml.length}, ru_property_id: ${ru_property_id}, dry_run: ${body.dry_run === true}`);

      // ── Dry-run short-circuit: compose XML, validate, do NOT POST to RU ──
      if (body.dry_run === true) {
        return jsonResponse({
          success: true,
          dry_run: true,
          message: 'Dry-run: XML composed and validated; no HTTP POST sent to Rentals United',
          validation: {
            ru_property_id,
            building_id: p.building_id ?? null,
            name: p.name,
            amenities_count: p.amenities?.length ?? 0,
            images_count: p.images?.length ?? 0,
            rooms_count: p.rooms?.length ?? 0,
            payment_methods_count: p.payment_methods?.length ?? 0,
            cancellation_policies_count: p.cancellation_policies?.length ?? 0,
            xml_length: compactRequestXml.length,
          },
          compact_xml: sanitizeXmlForLogs(compactRequestXml),
        });
      }

      console.log(`[rentalsunited-api] XML first 300 chars: ${previewXml(sanitizeXmlForLogs(compactRequestXml), 300)}`);
      const response = await callRentalsUnited(scopedCreds, xml);
      console.log(`[rentalsunited-api] RU push response: ${response.substring(0, 500)}`);
      const { ok, status } = handleRUStatus(response);
      if (!ok) {
        const diag = buildDiagnostics(compactRequestXml, status, 'push_property', response);
        console.error(`[rentalsunited-api] RU error ${status.id}: ${status.message}`);
        console.error(`[rentalsunited-api] XML context around error: ${diag.xml_context}`);
        return ruErrorResponse(status, diag);
      }

      // Extract returned PropertyID from RU response (e.g. <PropertyID>12345</PropertyID>)
      const pidMatch = response.match(/<PropertyID[^>]*>(\d+)<\/PropertyID>/i);
      const returnedPropertyId = pidMatch ? parseInt(pidMatch[1], 10) : null;

      // ── Persist authoritative snake_case mapping on properties row ──
      let mapping_persisted = false;
      let mapping_error: string | null = null;
      if (returnedPropertyId && body.property_uuid) {
        try {
          const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
          const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
          const supabase = createClient(supabaseUrl, supabaseKey);
          const { error: upErr } = await supabase
            .from('properties')
            .update({
              rentalsunited_property_id: String(returnedPropertyId),
              rentalsunited_building_id: p.building_id != null ? String(p.building_id) : null,
            })
            .eq('id', body.property_uuid);
          if (upErr) {
            mapping_error = upErr.message;
          } else {
            mapping_persisted = true;
          }
        } catch (e) {
          mapping_error = e instanceof Error ? e.message : String(e);
        }
      }

      return jsonResponse({
        success: true,
        message: 'Property pushed successfully',
        auth_mode: authMode,
        ru_property_id: returnedPropertyId,
        building_id: p.building_id ?? null,
        mapping: {
          persisted: mapping_persisted,
          property_uuid: body.property_uuid ?? null,
          system_type: 'rentalsunited',
          rentalsunited_property_id: returnedPropertyId,
          rentalsunited_building_id: p.building_id ?? null,
          error: mapping_error,
        },
        raw_xml: response,
        diagnostics: {
          request_preview: previewXml(sanitizeXmlForLogs(compactRequestXml), 600),
          request_xml: sanitizeXmlForLogs(compactRequestXml),
          response_preview: previewXml(response, 600),
        },
      });
    }

    // ── push_availability (mandatory) ──
    if (action === 'push_availability') {
      if (!ru_property_id) return errorResponse('MISSING_PARAM', 'ru_property_id is required');
      if (!body.availability || body.availability.length === 0) return errorResponse('MISSING_PARAM', 'availability array is required');
      const xml = buildPushAvailabilityXml(scopedCreds, ru_property_id, body.availability);
      const response = await callRentalsUnited(scopedCreds, xml);
      const { ok, status } = handleRUStatus(response);
      if (!ok) return ruErrorResponse(status);
      return jsonResponse({ success: true, message: 'Availability pushed successfully', auth_mode: authMode, raw_xml: response });
    }

    // ── push_prices (mandatory) ──
    // RU returns Status 0 (full success) or Status 5 (partial — see <Notifs>) per
    // https://developer.rentalsunited.com/#put-prices. Treat 5 as partial-success.
    if (action === 'push_prices') {
      if (!ru_property_id) return errorResponse('MISSING_PARAM', 'ru_property_id is required');
      if (!body.prices || body.prices.length === 0) return errorResponse('MISSING_PARAM', 'prices array is required');
      for (const p of body.prices) {
        const err = validatePriceEntry(p);
        if (err) return errorResponse('INVALID_PARAM', `Invalid price entry: ${err}`);
      }
      const xml = buildPushPricesXml(scopedCreds, ru_property_id, body.prices);
      const response = await callRentalsUnited(scopedCreds, xml);
      const { ok, partial, status, notifs } = parseDiscountResponse(response);
      if (!ok && !partial) {
        // Surface the per-range <Notifs> detail — the bare status message
        // ("Warning! Look at Notifs collection.") is not actionable on its own.
        const notifDetail = notifs.map((n) => `${n.date_from ?? '?'}→${n.date_to ?? '?'}: ${n.message}`).join(' | ');
        return jsonResponse({
          success: false,
          error: {
            code: 'RU_ERROR',
            message: notifDetail ? `${status.message} — ${notifDetail}` : status.message,
            ru_status_id: status.id,
          },
          notifs,
          diagnostics: buildDiagnostics(compactXml(xml), status, 'push_prices', response),
        });
      }
      return jsonResponse({
        success: true,
        partial,
        message: partial ? 'Prices pushed with partial errors' : 'Prices pushed successfully',
        auth_mode: authMode,
        notifs,
        raw_xml: response,
      });
    }

    // ── push_prices_fsp (Full Stay Pricing matrix — alternative to push_prices) ──
    if (action === 'push_prices_fsp') {
      if (!ru_property_id) return errorResponse('MISSING_PARAM', 'ru_property_id is required');
      if (!body.fsp_seasons || body.fsp_seasons.length === 0) return errorResponse('MISSING_PARAM', 'fsp_seasons array is required');
      for (const s of body.fsp_seasons) {
        const err = validateFspSeason(s);
        if (err) return errorResponse('INVALID_PARAM', `Invalid FSP season: ${err}`);
      }
      const xml = buildPushFspPricesXml(scopedCreds, ru_property_id, body.fsp_seasons);
      const response = await callRentalsUnited(scopedCreds, xml);
      const { ok, partial, status, notifs } = parseDiscountResponse(response);
      if (!ok && !partial) return ruErrorResponse(status);
      return jsonResponse({
        success: true,
        partial,
        message: partial ? 'FSP prices pushed with partial errors' : 'FSP prices pushed successfully',
        notifs,
        raw_xml: response,
      });
    }

    // ── subscribe_notifications (mandatory RNLM) ──
    if (action === 'subscribe_notifications') {
      if (!body.handler_url) return errorResponse('MISSING_PARAM', 'handler_url is required');
      const xml = buildSubscribeNotificationsXml(creds, body.handler_url);
      const response = await callRentalsUnited(creds, xml);
      const { ok, status } = handleRUStatus(response);
      if (!ok) return ruErrorResponse(status);
      return jsonResponse({ success: true, message: 'Notification handler registered successfully', raw_xml: response });
    }

    // ── get_long_stay_discounts (verification) ──
    if (action === 'get_long_stay_discounts') {
      if (!ru_property_id) return errorResponse('MISSING_PARAM', 'ru_property_id is required');
      const xml = buildGetLongStayDiscountsXml(scopedCreds, ru_property_id);
      const response = await callRentalsUnited(scopedCreds, xml);
      const { ok, status } = handleRUStatus(response);
      if (!ok) return ruErrorResponse(status);
      return jsonResponse({ success: true, raw_xml: response });
    }

    // ── get_last_minute_discounts (verification) ──
    if (action === 'get_last_minute_discounts') {
      if (!ru_property_id) return errorResponse('MISSING_PARAM', 'ru_property_id is required');
      const xml = buildGetLastMinuteDiscountsXml(scopedCreds, ru_property_id);
      const response = await callRentalsUnited(scopedCreds, xml);
      const { ok, status } = handleRUStatus(response);
      if (!ok) return ruErrorResponse(status);
      return jsonResponse({ success: true, raw_xml: response });
    }

    // ── push_long_stay_discounts (optional) ──
    if (action === 'push_long_stay_discounts') {
      if (!ru_property_id) return errorResponse('MISSING_PARAM', 'ru_property_id is required');
      if (!body.discounts || body.discounts.length === 0) return errorResponse('MISSING_PARAM', 'discounts array is required');
      for (const d of body.discounts) {
        const err = validateDiscountEntry(d);
        if (err) return errorResponse('INVALID_PARAM', `Invalid long stay discount: ${err}`);
      }
      const xml = buildPushLongStayDiscountsXml(scopedCreds, ru_property_id, body.discounts);
      const response = await callRentalsUnited(scopedCreds, xml);
      const { ok, status, partial, notifs } = parseDiscountResponse(response);
      if (!ok && !partial) return ruErrorResponse(status);
      return jsonResponse({
        success: true,
        partial,
        message: partial ? 'Long stay discounts pushed with partial errors' : 'Long stay discounts pushed successfully',
        auth_mode: authMode,
        notifs,
        raw_xml: response,
      });
    }

    // ── push_last_minute_discounts (optional) ──
    if (action === 'push_last_minute_discounts') {
      if (!ru_property_id) return errorResponse('MISSING_PARAM', 'ru_property_id is required');
      if (!body.discounts || body.discounts.length === 0) return errorResponse('MISSING_PARAM', 'discounts array is required');
      for (const d of body.discounts) {
        const err = validateDiscountEntry(d);
        if (err) return errorResponse('INVALID_PARAM', `Invalid last minute discount: ${err}`);
      }
      const xml = buildPushLastMinuteDiscountsXml(scopedCreds, ru_property_id, body.discounts);
      const response = await callRentalsUnited(scopedCreds, xml);
      const { ok, status, partial, notifs } = parseDiscountResponse(response);
      if (!ok && !partial) return ruErrorResponse(status);
      return jsonResponse({
        success: true,
        partial,
        message: partial ? 'Last minute discounts pushed with partial errors' : 'Last minute discounts pushed successfully',
        auth_mode: authMode,
        notifs,
        raw_xml: response,
      });
    }

    // ── set_property_status ──
    if (action === 'set_property_status') {
      if (!ru_property_id) return errorResponse('MISSING_PARAM', 'ru_property_id is required');
      const isActive = body.metadata?.is_active !== false;
      const isArchived = body.metadata?.is_archived === true;
      const xml = buildSetPropertyStatusXml(scopedCreds, ru_property_id, isActive as boolean, isArchived as boolean);
      const response = await callRentalsUnited(scopedCreds, xml);
      console.log(`[rentalsunited-api] SetStatus response: ${response.substring(0, 500)}`);
      const { ok, status } = handleRUStatus(response);
      if (!ok) return ruErrorResponse(status);
      return jsonResponse({ success: true, message: 'Property status updated', raw_xml: response });
    }

    // ── get_location_by_coordinates ──
    if (action === 'get_location_by_coordinates') {
      const lat = (metadata as any)?.latitude;
      const lng = (metadata as any)?.longitude;
      if (!lat || !lng) return errorResponse('MISSING_PARAM', 'metadata.latitude and metadata.longitude are required');
      
      const xml = `<Pull_GetLocationByCoordinates_RQ>${buildAuthXml(creds)}<Latitude>${lat}</Latitude><Longitude>${lng}</Longitude></Pull_GetLocationByCoordinates_RQ>`;
      const response = await callRentalsUnited(creds, xml);
      console.log(`[rentalsunited-api] Location lookup response: ${response.substring(0, 500)}`);
      const { ok, status } = handleRUStatus(response);
      if (!ok) return ruErrorResponse(status);
      
      // Extract LocationID from response
      const locMatch = response.match(/LocationID="(\d+)"/);
      const locationId = locMatch ? parseInt(locMatch[1], 10) : null;
      return jsonResponse({ success: true, location_id: locationId, raw_xml: response });
    }

    // ── push_building ──
    // 🔒 ADAPTER LOCK (RU child isolation): Push_PutBuilding_RQ has NO <OwnerID> element in the
    // RU schema — the building is created on whichever account authenticates. Falling back to the
    // parent AccessKey/SecretKey therefore creates the building on the MASTER account, which is
    // forbidden in a White-Label integration. Child credentials are mandatory; never add a
    // parent fallback here.
    if (action === 'push_building') {
      if (!body.building_name) return errorResponse('MISSING_PARAM', 'building_name is required');
      const childAuth = await resolveChildAuth(body);
      const bId = body.building_id || 0;
      if (!childAuth) {
        return jsonResponse({
          success: false,
          error: {
            code: 'RU_CHILD_AUTH_REQUIRED',
            message: CHILD_AUTH_REQUIRED_MESSAGE,
          },
        }, 422);
      }
      const xml = buildPushBuildingXml(creds, bId, body.building_name, body.unit_types, childAuth);

      const response = await callRentalsUnited(creds, xml);
      const { ok, status } = handleRUStatus(response);
      console.log(`[rentalsunited-api] Push building (auth=${childAuthMode(childAuth)}) ok=${ok} response: ${response.substring(0, 500)}`);
      if (!ok) {
        return ruErrorResponse(
          status,
          buildDiagnostics(sanitizeXmlForLogs(compactXml(xml)), status, 'push_building', response),
        );
      }
      const buildingId = extractBuildingId(response);
      const unitTypeObjectIds = extractUnitTypeObjectIds(response);
      return jsonResponse({
        success: true,
        building_id: buildingId ? parseInt(buildingId, 10) : null,
        unit_type_object_ids: unitTypeObjectIds,
        auth_mode: childAuthMode(childAuth),
        message: 'Building pushed successfully',
        raw_xml: response,
        diagnostics: {
          request_preview: previewXml(sanitizeXmlForLogs(compactXml(xml)), 600),
          request_xml: sanitizeXmlForLogs(compactXml(xml)),
          response_preview: previewXml(response, 600),
          unit_type_count: unitTypeObjectIds.length,
        },
      });
    }

    // ── list_buildings ──
    // Child-scoped only (see push_building lock note): the parent envelope would list the
    // master account's buildings and cross-contaminate thewhite-label client's inventory.
    if (action === 'list_buildings') {
      const childAuth = await resolveChildAuth(body);
      const xml = buildListBuildingsXml(creds, childAuth);
      const response = await callRentalsUnited(creds, xml);
      const { ok, status } = handleRUStatus(response);
      if (!ok) return ruErrorResponse(status, buildDiagnostics(sanitizeXmlForLogs(compactXml(xml)), status, 'list_buildings', response));
      const buildings = extractBuildings(response);
      return jsonResponse({ success: true, buildings, count: buildings.length, raw_xml: response });
    }



    // ── list_composition_rooms ──
    // Fetch the global RU dictionary of valid CompositionRoomIDs so we can
    // populate <CompositionRoomsAmenities> with real IDs (avoids Status 6).
    if (action === 'list_composition_rooms') {
      const xml = buildListCompositionRoomsXml(creds);
      const response = await callRentalsUnited(creds, xml);
      const { ok, status } = handleRUStatus(response);
      if (!ok) return ruErrorResponse(status, buildDiagnostics(compactXml(xml), status, 'list_composition_rooms', response));
      const rooms = extractCompositionRooms(response);
      return jsonResponse({
        success: true,
        composition_rooms: rooms,
        count: rooms.length,
        raw_xml: response,
      });
    }

    // ── list_amenities / sync_amenities ──
    // Pull RU's global amenity dictionary. `sync_amenities` additionally caches the
    // result in public.ru_amenities so the ROLOS amenity picker works without a live call.
    if (action === 'list_amenities' || action === 'sync_amenities') {
      const xml = buildListAmenitiesXml(creds);
      const response = await callRentalsUnited(creds, xml);
      const { ok, status } = handleRUStatus(response);
      if (!ok) return ruErrorResponse(status, buildDiagnostics(compactXml(xml), status, action, response));
      const amenities = extractAmenities(response);

      let synced = 0;
      let sync_error: string | null = null;
      if (action === 'sync_amenities' && amenities.length > 0) {
        try {
          const supabase = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
          );
          const now = new Date().toISOString();
          const { error: upErr } = await supabase.from('ru_amenities').upsert(
            amenities.map((a) => {
              const cls = classifyAmenity(a.name, a.id);
              return {
                id: a.id,
                name: a.name,
                ru_group_id: a.group_id,
                category: cls.category,
                is_recommended: cls.is_recommended,
                is_active: true,
                synced_at: now,
              };
            }),
            { onConflict: 'id' },
          );

          if (upErr) sync_error = upErr.message;
          else synced = amenities.length;
        } catch (e) {
          sync_error = e instanceof Error ? e.message : String(e);
        }
      }

      return jsonResponse({
        success: true,
        amenities,
        count: amenities.length,
        synced,
        sync_error,
      });
    }



    // ── get_building ──
    // Read-only: fetch a building's composition (UnitsComposition) so we can backfill
    // unit_type_object_ids in pms_mappings without re-pushing the building.
    if (action === 'get_building') {
      const bId = body.building_id;
      if (!bId) return errorResponse('MISSING_PARAM', 'building_id is required');
      const childAuth = await resolveChildAuth(body);
      // Child-scoped only: no parent fallback (a building only exists on the account that
      // created it, and the parent envelope would read the master account's buildings).
      const xml = buildGetBuildingXml(creds, parseInt(String(bId), 10), childAuth);
      const response = await callRentalsUnited(creds, xml);

      const { ok, status } = handleRUStatus(response);
      if (!ok) return ruErrorResponse(status, buildDiagnostics(compactXml(xml), status, 'get_building', response));
      const buildingId = extractBuildingId(response);
      const nameMatch = response.match(/<BuildingName>([\s\S]*?)<\/BuildingName>/i);
      const unitTypeObjectIds = extractUnitTypeObjectIds(response);
      return jsonResponse({
        success: true,
        building_id: buildingId ? parseInt(buildingId, 10) : parseInt(String(bId), 10),
        building_name: nameMatch ? nameMatch[1].trim() : null,
        unit_type_object_ids: unitTypeObjectIds,
        unit_type_count: unitTypeObjectIds.length,
        raw_xml: response,
      });
    }

    // assign_building_properties removed — not a valid RU API method.
    // Units are assigned to buildings via <BuildingID> in each unit's property push XML.

    // ── create_user ──
    if (action === 'create_user') {
      if (!body.user) return errorResponse('MISSING_PARAM', 'user payload is required (first_name, last_name, email, password)');
      const { first_name, last_name, email, password } = body.user;
      if (!first_name || !last_name || !email || !password) return errorResponse('VALIDATION', 'user must include first_name, last_name, email, and password');

      // RU password policy: 12+ chars, lower, upper, digit, special, must not contain the email
      const pwdOk = String(password).length >= 12
        && /[a-z]/.test(password) && /[A-Z]/.test(password)
        && /[0-9]/.test(password) && /[^A-Za-z0-9]/.test(password)
        && !String(password).toLowerCase().includes(String(email).toLowerCase());
      if (!pwdOk) {
        return errorResponse('VALIDATION', "Password must be 12+ characters with an uppercase letter, a lowercase letter, a number and a special character, and must not contain the user's email");
      }

      const rawLocations = Array.isArray(body.location_ids)
        ? body.location_ids
        : (body.location_id != null ? [body.location_id] : []);
      const locationIds = rawLocations.map((v: unknown) => Number(v)).filter((n: number) => Number.isFinite(n) && n > 1);
      if (locationIds.length === 0) {
        return errorResponse('VALIDATION', 'At least one valid Rentals United LocationId is required to create a sub-user (location_id or location_ids)');
      }

      const xml = buildCreateUserXml(creds, { first_name, last_name, email, password }, locationIds);
      const response = await callRentalsUnited(creds, xml);
      console.log(`[rentalsunited-api] CreateUser response: ${response.substring(0, 500)}`);
      const { ok, status } = handleRUStatus(response);
      if (!ok) return ruErrorResponse(status);
      const userAccountId = extractUserAccountId(response);
      return jsonResponse({ success: true, user_account_id: userAccountId, message: 'User created successfully', raw_xml: response });
    }


    // ── list_users ──
    if (action === 'list_users') {
      const xml = buildListUsersXml(creds);
      const response = await callRentalsUnited(creds, xml);
      const { ok, status } = handleRUStatus(response);
      if (!ok) return ruErrorResponse(status);
      const users = extractUsers(response);
      return jsonResponse({ success: true, users, count: users.length, raw_xml: response });
    }

    // ── fill_company_details ──
    if (action === 'fill_company_details') {
      if (!body.company) return errorResponse('MISSING_PARAM', 'company payload is required');
      const missing = missingCompanyFields(body.company);
      if (missing.length > 0) {
        return jsonResponse({
          success: false,
          error: {
            code: 'COMPANY_DETAILS_INCOMPLETE',
            message: `Rentals United requires these company/contact fields: ${missing.join(', ')}`,
            missing,
          },
        }, 422);
      }
      const ownerId = Number(body.owner_id);
      if (!Number.isFinite(ownerId) || ownerId <= 0) {
        return errorResponse('MISSING_PARAM', 'A valid owner_id is required for company details');
      }
      const maskXml = (x: string) =>
        compactXml(x)
          .replace(/<Password>[\s\S]*?<\/Password>/g, '<Password>***</Password>')
          .replace(/<SecretKey>[\s\S]*?<\/SecretKey>/g, '<SecretKey>***</SecretKey>');
      // 🔒 ADAPTER LOCK (RU child isolation): Push_FillCompanyDetails_RQ has NO <OwnerID> element
      // in the RU schema — RU applies the details to whichever identity authenticates. Using the
      // parent AccessKey/SecretKey therefore overwrites the MASTER company profile, never the
      // child's. Child UserName/Password is the only valid path; never add a parent fallback.
      const childAuth = await resolveChildAuth(body);
      if (!childAuth) {
        return jsonResponse({
          success: false,
          error: {
            code: 'RU_CHILD_AUTH_REQUIRED',
            message: CHILD_AUTH_REQUIRED_MESSAGE,
          },
        }, 422);
      }
      const xml = buildFillCompanyDetailsXml(creds, body.company as RUCompanyPayload, ownerId, childAuth);
      const response = await callRentalsUnited(creds, xml);
      const { ok, status } = handleRUStatus(response);
      console.log(
        `[rentalsunited-api] FillCompanyDetails (auth=${childAuthMode(childAuth)}, owner=${ownerId}) ok=${ok} response: ${response.substring(0, 500)}`,
      );
      if (ok) {
        return jsonResponse({
          success: true,
          message: 'Company details filled successfully',
          auth_mode: childAuthMode(childAuth),
          owner_id: String(ownerId),
          raw_xml: response,
        });
      }
      return ruErrorResponse(
        status,
        buildDiagnostics(maskXml(xml), status, 'fill_company_details', response),
      );

    }


    // ── order_mcq: CM_LNM_OrderMinimumContentQualityCheck_RQ (Phase 4.3) ──
    if (action === 'order_mcq') {
      const ruPropertyId = Number(body.ru_property_id);
      if (!ruPropertyId) return errorResponse('MISSING_PARAM', 'ru_property_id is required');
      const xml = `<?xml version="1.0" encoding="utf-8"?>\n<CM_LNM_OrderMinimumContentQualityCheck_RQ>${buildAuthXml(creds)}<PropertyID>${ruPropertyId}</PropertyID></CM_LNM_OrderMinimumContentQualityCheck_RQ>`;
      const response = await callRentalsUnited(creds, xml);
      console.log(`[rentalsunited-api] OrderMCQ response: ${response.substring(0, 500)}`);
      const { ok, status } = handleRUStatus(response);
      if (!ok) return ruErrorResponse(status, buildDiagnostics(compactXml(xml), status, 'order_mcq', response));
      return jsonResponse({
        success: true,
        ru_property_id: ruPropertyId,
        ru_status_id: status?.id ?? null,
        message: 'Minimum Content Quality check ordered',
        raw_xml: response,
      });
    }

    // ── get_location_by_name ──
    // Pull_GetLocationByName_RQ — find a LocationID by free-text name. Better than coords for
    // ambiguous spots (e.g. "Stilbaai" returns the actual locality LocationID).
    if (action === 'get_location_by_name') {
      const name = (body.location_name || (metadata as any)?.location_name || '').toString().trim();
      if (!name) return errorResponse('MISSING_PARAM', 'location_name is required');
      const xml = `<Pull_GetLocationByName_RQ>${buildAuthXml(creds)}<LocationName>${escapeXml(name)}</LocationName></Pull_GetLocationByName_RQ>`;
      const response = await callRentalsUnited(creds, xml);
      console.log(`[rentalsunited-api] get_location_by_name response: ${response.substring(0, 500)}`);
      const { ok, status } = handleRUStatus(response);
      if (!ok) return ruErrorResponse(status, buildDiagnostics(compactXml(xml), status, 'get_location_by_name', response));
      const idMatch = response.match(/<LocationID[^>]*>(\d+)<\/LocationID>/i);
      const locationId = idMatch ? parseInt(idMatch[1], 10) : null;
      return jsonResponse({ success: true, location_id: locationId, raw_xml: response });
    }

    // ── list_cities_and_currencies ──
    // Pull_ListCitiesAndCurrencies_RQ — list every RU city with its country + assigned currency.
    // Used to seed the public.ru_locations cache. Optionally filtered by country IDs in body.country_ids.
    if (action === 'list_cities_and_currencies') {
      // Pull_ListCitiesAndCurrencies_RQ — returns every RU city with its assigned currency.
      // Shape: <City CurrencyCode="ZAR" LocationID="1611" Name="Cape Town">...</City>
      // (NOTE: Pull_ListCitiesProps_RQ is a different endpoint — it only lists cities where
      // THIS account already has active props. We need the master list to detect currency drift
      // on locations we haven't pushed yet.)
      const xml = `<Pull_ListCitiesAndCurrencies_RQ>${buildAuthXml(creds)}</Pull_ListCitiesAndCurrencies_RQ>`;
      const response = await callRentalsUnited(creds, xml);
      console.log(`[rentalsunited-api] list_cities_and_currencies response (first 800): ${response.substring(0, 800)}`);
      const { ok, status } = handleRUStatus(response);
      if (!ok) return ruErrorResponse(status, buildDiagnostics(compactXml(xml), status, 'list_cities_and_currencies', response));

      const locs: Array<{ id: number; name: string; parent_id: number | null; currency_iso: string | null; type: number | null }> = [];

      // Try <City ...> first (the correct Pull_ListCitiesAndCurrencies_RQ shape).
      const cityRe = /<City\b([^>]*)(?:\/>|>([\s\S]*?)<\/City>)/gi;
      let cm: RegExpExecArray | null;
      while ((cm = cityRe.exec(response)) !== null) {
        const attrs = cm[1] || '';
        const inner = cm[2] || '';
        const idAttr = /\bLocationID="(\d+)"/i.exec(attrs) || /\bID="(\d+)"/i.exec(attrs);
        const idInner = !idAttr ? /<ID[^>]*>(\d+)<\/ID>/i.exec(inner) : null;
        const id = idAttr ? parseInt(idAttr[1], 10) : (idInner ? parseInt(idInner[1], 10) : NaN);
        if (!Number.isFinite(id)) continue;
        const ccyAttr = /\bCurrencyCode="([A-Z]{3})"/i.exec(attrs);
        const nameAttr = /\bName="([^"]+)"/i.exec(attrs);
        const nameInner = !nameAttr ? /<Name[^>]*>([\s\S]*?)<\/Name>/i.exec(inner) : null;
        const parentAttr = /\bParentLocationID="(\d+)"/i.exec(attrs);
        const typeAttr = /\bType="(\d+)"/i.exec(attrs);
        const rawName = nameAttr ? nameAttr[1] : (nameInner ? nameInner[1].trim() : inner.replace(/<[^>]+>/g, '').trim());
        locs.push({
          id,
          name: rawName || `Location ${id}`,
          parent_id: parentAttr ? parseInt(parentAttr[1], 10) : null,
          currency_iso: ccyAttr ? ccyAttr[1].toUpperCase() : null,
          type: typeAttr ? parseInt(typeAttr[1], 10) : null,
        });
      }

      // Fallback: some deployments wrap in <Location ...> instead.
      if (locs.length === 0) {
        const locRe = /<Location\b([^>]*)(?:\/>|>([\s\S]*?)<\/Location>)/gi;
        let lm: RegExpExecArray | null;
        while ((lm = locRe.exec(response)) !== null) {
          const attrs = lm[1] || '';
          const inner = lm[2] || '';
          const idAttr = /\bLocationID="(\d+)"/i.exec(attrs) || /\bID="(\d+)"/i.exec(attrs);
          const idInner = !idAttr ? /<ID[^>]*>(\d+)<\/ID>/i.exec(inner) : null;
          const id = idAttr ? parseInt(idAttr[1], 10) : (idInner ? parseInt(idInner[1], 10) : NaN);
          if (!Number.isFinite(id)) continue;
          const ccyAttr = /\bCurrencyCode="([A-Z]{3})"/i.exec(attrs);
          const typeAttr = /\bType="(\d+)"/i.exec(attrs);
          const parentAttr = /\bParentLocationID="(\d+)"/i.exec(attrs);
          const nameInner = /<Name[^>]*>([\s\S]*?)<\/Name>/i.exec(inner);
          const name = nameInner ? nameInner[1].trim() : inner.replace(/<[^>]+>/g, '').trim();
          locs.push({
            id,
            name: name || `Location ${id}`,
            parent_id: parentAttr ? parseInt(parentAttr[1], 10) : null,
            currency_iso: ccyAttr ? ccyAttr[1].toUpperCase() : null,
            type: typeAttr ? parseInt(typeAttr[1], 10) : null,
          });
        }
      }

      return jsonResponse({ success: true, locations: locs, count: locs.length, raw_xml: response.length > 8000 ? response.substring(0, 8000) + '…[truncated]' : response });
    }

    // ── push_change_currency ──
    // Push_ChangeCurrency_RQ — set the currency for an entire RU location. Currency in RU
    // is owned by the LocationID, not by the property; this is the only way to make
    // <CurrencyID> on a property push actually stick on read.
    if (action === 'push_change_currency') {
      const locationId = body.location_id ?? (metadata as any)?.location_id;
      const currencyIso = (body.currency_iso || (metadata as any)?.currency_iso || '').toString().trim().toUpperCase();
      if (!locationId) return errorResponse('MISSING_PARAM', 'location_id is required');
      if (!currencyIso || !/^[A-Z]{3}$/.test(currencyIso)) return errorResponse('VALIDATION', 'currency_iso must be a 3-letter ISO code');
      const xml = `<Push_ChangeCurrency_RQ>${buildAuthXml(creds)}<Location>${parseInt(String(locationId), 10)}</Location><Currency>${currencyIso}</Currency></Push_ChangeCurrency_RQ>`;
      const compactRequestXml = compactXml(xml);
      const response = await callRentalsUnited(creds, xml);
      console.log(`[rentalsunited-api] push_change_currency response: ${response.substring(0, 500)}`);
      const { ok, status } = handleRUStatus(response);
      // Status 339 = "Location already has the requested currency set" — treat as success.
      if (!ok && status.id !== '339') {
        return ruErrorResponse(status, buildDiagnostics(compactRequestXml, status, 'push_change_currency', response));
      }
      return jsonResponse({
        success: true,
        already_set: status.id === '339',
        location_id: parseInt(String(locationId), 10),
        currency_iso: currencyIso,
        raw_xml: response,
      });
    }

    // Unknown action
    return errorResponse('UNKNOWN_ACTION', `Action "${action}" is not supported`);

  } catch (error) {
    console.error('[rentalsunited-api] Error:', error);
    return jsonResponse({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    }, 500);
  }
});
