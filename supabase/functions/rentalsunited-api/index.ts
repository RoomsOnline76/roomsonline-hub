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
 * - push_prices: Push_PutPrices_RQ
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
  can_sleep_max: number;
  standard_guests: number;
  number_of_beds?: number;
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
  changeover?: number; // 1=CheckInOnly, 2=CheckOutOnly, 3=Both, 4=NoActivity
}

interface RUPriceEntry {
  date_from: string;
  date_to: string;
  price: number;
  extra_guest_price?: number;
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
    .replace(/<SecretKey>.*?<\/SecretKey>/gi, '<SecretKey>[REDACTED]</SecretKey>');
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
  const envApiKey = Deno.env.get('RENTALS_UNITED_API_KEY');
  const envApiSecret = Deno.env.get('RENTALS_UNITED_API_SECRET');

  if (envApiKey && envApiSecret) {
    return {
      api_key: envApiKey,
      api_secret: envApiSecret,
      endpoint: Deno.env.get('RENTALS_UNITED_ENDPOINT') || 'https://rm.rentalsunited.com/api/Handler.ashx',
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

    return {
      api_key: data.api_key || '',
      api_secret: data.api_secret || '',
      endpoint: data.base_url || 'https://rm.rentalsunited.com/api/Handler.ashx',
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

function buildListPropertiesXml(creds: RUCredentials): string {
  return `<Pull_ListOwnerProp_RQ>${buildAuthXml(creds)}</Pull_ListOwnerProp_RQ>`;
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

function buildListReservationsXml(creds: RUCredentials, dateFrom: string, dateTo: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<Pull_ListReservations_RQ>
  ${buildAuthXml(creds)}
  <DateFrom>${dateFrom}</DateFrom>
  <DateTo>${dateTo}</DateTo>
</Pull_ListReservations_RQ>`;
}

function buildGetLeadsXml(creds: RUCredentials, dateFrom: string, dateTo: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<Pull_GetLeads_RQ>
  ${buildAuthXml(creds)}
  <DateFrom>${dateFrom}</DateFrom>
  <DateTo>${dateTo}</DateTo>
</Pull_GetLeads_RQ>`;
}

// ── Push XML Builders ────────────────────────────────────────

function buildPushPropertyXml(creds: RUCredentials, propertyId: number, prop: RUPropertyPayload): string {
  const buildOptionalNode = (tag: string, value?: string | null) => {
    const normalized = value?.trim();
    return normalized ? `<${tag}>${escapeXml(normalized)}</${tag}>` : `<${tag} />`;
  };

  // Build rooms/composition rooms XML with bed amenities
  const roomsXml = prop.rooms && prop.rooms.length > 0
    ? `<CompositionRoomsAmenities>
      ${prop.rooms.map(r => `<CompositionRoomAmenities RoomID="${r.room_id}">
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

  const imagesXml = prop.images
    .map((img, index) => {
      const imageTypeId = index === 0 ? 1 : (img.type_id && img.type_id !== 1 ? img.type_id : 3);
      return `<Image ImageTypeID="${imageTypeId}" ImageReferenceID="${index + 1}">${escapeXml(img.url)}</Image>`;
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

  // SecurityDeposit with required DepositTypeID attribute
  const securityDepositXml = prop.security_deposit != null
    ? `\n    <SecurityDeposit DepositTypeID="${prop.security_deposit > 0 ? 5 : 0}">${Number(prop.security_deposit).toFixed(2)}</SecurityDeposit>` : '';

  // Strict XSD element order per RU documentation
  return `<Push_PutProperty_RQ>
  ${buildAuthXml(creds)}
  <Property>
    <ID>${propertyId}</ID>
    <Name>${escapeXml(prop.name)}</Name>
    <OwnerID>${prop.owner_id || 1}</OwnerID>
    <DetailedLocationID TypeID="4">${prop.detailed_location_id}</DetailedLocationID>
    <IsActive>true</IsActive>
    <IsArchived>false</IsArchived>
    ${cleaningPriceXml}
    <Space>${prop.space}</Space>
    <StandardGuests>${Math.min(prop.standard_guests, prop.can_sleep_max)}</StandardGuests>
    <CanSleepMax>${prop.can_sleep_max}</CanSleepMax>
    <PropertyTypeID>${prop.property_type_id}</PropertyTypeID>
    <NumberOfBeds>${prop.number_of_beds || Math.max(1, prop.can_sleep_max)}</NumberOfBeds>
    <NoOfUnits>${prop.no_of_units || 1}</NoOfUnits>
    <Floor>${prop.floor}</Floor>${prop.building_id ? `\n    <BuildingID>${prop.building_id}</BuildingID>` : ''}
    <Street>${escapeXml(prop.street)}</Street>
    <ZipCode>${escapeXml(prop.zip_code)}</ZipCode>
    <Longitude>${prop.longitude}</Longitude>
    <Latitude>${prop.latitude}</Latitude>
    ${arrivalInstructionsXml}
    <Amenities>
      ${amenitiesXml}
    </Amenities>
    <Images>
      ${imagesXml}
    </Images>
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
    </Descriptions>${securityDepositXml}${roomsXml ? `\n    ${roomsXml}` : ''}
  </Property>
</Push_PutProperty_RQ>`;
}

function buildPushAvailabilityXml(creds: RUCredentials, propertyId: number, availability: RUAvailabilityEntry[]): string {
  const daysXml = availability
    .map(a => {
      let attrs = `DateFrom="${a.date_from}" DateTo="${a.date_to}" Units="${a.units}"`;
      if (a.min_stay != null) attrs += ` MinStay="${a.min_stay}"`;
      if (a.changeover != null) attrs += ` Changeover="${a.changeover}"`;
      return `<AvailabilityDay ${attrs} />`;
    })
    .join('\n    ');

  return `<?xml version="1.0" encoding="utf-8"?>
<Push_PutAvbUnits_RQ>
  ${buildAuthXml(creds)}
  <PropertyID>${propertyId}</PropertyID>
  <Availability>
    ${daysXml}
  </Availability>
</Push_PutAvbUnits_RQ>`;
}

function buildPushPricesXml(creds: RUCredentials, propertyId: number, prices: RUPriceEntry[]): string {
  const pricesXml = prices
    .map(p => {
      let inner = `<DateFrom>${p.date_from}</DateFrom>
      <DateTo>${p.date_to}</DateTo>
      <Price>${p.price}</Price>`;
      if (p.extra_guest_price != null) {
        inner += `\n      <ExtraGuestPrice>${p.extra_guest_price}</ExtraGuestPrice>`;
      }
      return `<Season>\n      ${inner}\n    </Season>`;
    })
    .join('\n    ');

  return `<?xml version="1.0" encoding="utf-8"?>
<Push_PutPrices_RQ>
  ${buildAuthXml(creds)}
  <PropertyID>${propertyId}</PropertyID>
  <Prices>
    ${pricesXml}
  </Prices>
</Push_PutPrices_RQ>`;
}

function buildSubscribeNotificationsXml(creds: RUCredentials, handlerUrl: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<LNM_PutHandlerUrl_RQ>
  ${buildAuthXml(creds)}
  <HandlerUrl>${escapeXml(handlerUrl)}</HandlerUrl>
</LNM_PutHandlerUrl_RQ>`;
}

function buildPushLongStayDiscountsXml(creds: RUCredentials, propertyId: number, discounts: RUDiscountEntry[]): string {
  const discountsXml = discounts
    .map(d => `<Discount DateFrom="${d.date_from}" DateTo="${d.date_to}" NightsFrom="${d.nights_from}"${d.nights_to != null ? ` NightsTo="${d.nights_to}"` : ''} Percentage="${d.discount_percentage}" />`)
    .join('\n    ');

  return `<?xml version="1.0" encoding="utf-8"?>
<Push_PutLongStayDiscounts_RQ>
  ${buildAuthXml(creds)}
  <PropertyID>${propertyId}</PropertyID>
  <LongStayDiscounts>
    ${discountsXml}
  </LongStayDiscounts>
</Push_PutLongStayDiscounts_RQ>`;
}

function buildPushLastMinuteDiscountsXml(creds: RUCredentials, propertyId: number, discounts: RUDiscountEntry[]): string {
  const discountsXml = discounts
    .map(d => `<Discount DateFrom="${d.date_from}" DateTo="${d.date_to}" DaysToArrivalFrom="${d.nights_from}"${d.nights_to != null ? ` DaysToArrivalTo="${d.nights_to}"` : ''} Percentage="${d.discount_percentage}" />`)
    .join('\n    ');

  return `<?xml version="1.0" encoding="utf-8"?>
<Push_PutLastMinuteDiscounts_RQ>
  ${buildAuthXml(creds)}
  <PropertyID>${propertyId}</PropertyID>
  <LastMinuteDiscounts>
    ${discountsXml}
  </LastMinuteDiscounts>
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

function buildPushBuildingXml(creds: RUCredentials, buildingId: number, buildingName: string, unitTypes?: RUBuildingUnitType[]): string {
  const truncatedName = buildingName.substring(0, 20);
  const buildingIdXml = buildingId > 0 ? `<BuildingID>${buildingId}</BuildingID>` : '';
  const compositionXml = buildBuildingCompositionXml(unitTypes);
  return `<Push_PutBuilding_RQ>${buildAuthXml(creds)}<BuildingName>${escapeXml(truncatedName)}</BuildingName>${buildingIdXml}${compositionXml}</Push_PutBuilding_RQ>`;
}

function buildListBuildingsXml(creds: RUCredentials): string {
  return `<Pull_ListBuildings_RQ>${buildAuthXml(creds)}</Pull_ListBuildings_RQ>`;
}

function extractBuildingId(xml: string): string | null {
  const match = xml.match(/<BuildingID>(\d+)<\/BuildingID>/);
  return match?.[1] || null;
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

function buildCreateUserXml(creds: RUCredentials, user: { first_name: string; last_name: string; email: string; password: string }): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<Push_CreateUser_RQ>
  ${buildAuthXml(creds)}
  <User>
    <FirstName>${escapeXml(user.first_name)}</FirstName>
    <LastName>${escapeXml(user.last_name)}</LastName>
    <Email>${escapeXml(user.email)}</Email>
    <Password>${escapeXml(user.password)}</Password>
  </User>
</Push_CreateUser_RQ>`;
}

function buildListUsersXml(creds: RUCredentials): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<Pull_ListMyUsers_RQ>
  ${buildAuthXml(creds)}
</Pull_ListMyUsers_RQ>`;
}

function buildFillCompanyDetailsXml(creds: RUCredentials, userId: number, company: { name: string; address?: string; city?: string; country?: string; phone?: string; email?: string; vat_number?: string }): string {
  const optNode = (tag: string, val?: string) => val ? `<${tag}>${escapeXml(val)}</${tag}>` : '';
  return `<?xml version="1.0" encoding="utf-8"?>
<Push_FillCompanyDetails_RQ>
  ${buildAuthXml(creds)}
  <UserAccountId>${userId}</UserAccountId>
  <CompanyDetails>
    <CompanyName>${escapeXml(company.name)}</CompanyName>
    ${optNode('Address', company.address)}
    ${optNode('City', company.city)}
    ${optNode('Country', company.country)}
    ${optNode('Phone', company.phone)}
    ${optNode('Email', company.email)}
    ${optNode('VATNumber', company.vat_number)}
  </CompanyDetails>
</Push_FillCompanyDetails_RQ>`;
}

function extractUserAccountId(xml: string): string | null {
  const match = xml.match(/<UserAccountId>(\d+)<\/UserAccountId>/);
  return match?.[1] || null;
}

function extractUsers(xml: string): { user_account_id: string; email: string; first_name: string; last_name: string; owner_id: string }[] {
  const regex = /<User>[\s\S]*?<UserAccountId>(\d+)<\/UserAccountId>[\s\S]*?<FirstName>(.*?)<\/FirstName>[\s\S]*?<LastName>(.*?)<\/LastName>[\s\S]*?<Email>(.*?)<\/Email>[\s\S]*?(?:<OwnerID>(\d+)<\/OwnerID>)?[\s\S]*?<\/User>/g;
  const results: { user_account_id: string; email: string; first_name: string; last_name: string; owner_id: string }[] = [];
  let match;
  while ((match = regex.exec(xml)) !== null) {
    results.push({
      user_account_id: match[1],
      first_name: match[2]?.trim() || '',
      last_name: match[3]?.trim() || '',
      email: match[4]?.trim() || '',
      owner_id: match[5] || '',
    });
  }
  return results;
}

// ── Action Handlers ──────────────────────────────────────────

function handleRUStatus(response: string): { ok: boolean; status: { id: string; message: string } } {
  const status = extractStatusId(response);
  return { ok: status.id === '0', status };
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
        const xml = buildListPropertiesXml(creds);
        const response = await callRentalsUnited(creds, xml);
        const { ok, status } = handleRUStatus(response);

        return jsonResponse({
          healthy: ok,
          status: ok ? 'ok' : 'error',
          message: ok
            ? 'Rentals United API connected successfully'
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
          metadata: { ...metadata, checked_at: new Date().toISOString() },
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

    // ── list_properties ──
    if (action === 'list_properties') {
      const xml = buildListPropertiesXml(creds);
      const response = await callRentalsUnited(creds, xml);
      const { ok, status } = handleRUStatus(response);
      if (!ok) return ruErrorResponse(status);

      const properties = extractPropertyIds(response);
      return jsonResponse({ success: true, properties, count: properties.length });
    }

    // ── get_property ──
    if (action === 'get_property') {
      if (!ru_property_id) return errorResponse('MISSING_PARAM', 'ru_property_id is required');
      const xml = buildGetPropertyXml(creds, ru_property_id);
      const response = await callRentalsUnited(creds, xml);
      const { ok, status } = handleRUStatus(response);
      if (!ok) return ruErrorResponse(status);
      return jsonResponse({ success: true, raw_xml: response });
    }

    // ── get_availability ──
    if (action === 'get_availability') {
      if (!ru_property_id || !date_from || !date_to) return errorResponse('MISSING_PARAM', 'ru_property_id, date_from, date_to are required');
      const xml = buildGetAvailabilityXml(creds, ru_property_id, date_from, date_to);
      const response = await callRentalsUnited(creds, xml);
      const { ok, status } = handleRUStatus(response);
      if (!ok) return ruErrorResponse(status);
      return jsonResponse({ success: true, raw_xml: response });
    }

    // ── get_prices ──
    if (action === 'get_prices') {
      if (!ru_property_id || !date_from || !date_to) return errorResponse('MISSING_PARAM', 'ru_property_id, date_from, date_to are required');
      const xml = buildGetPricesXml(creds, ru_property_id, date_from, date_to);
      const response = await callRentalsUnited(creds, xml);
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

      const xml = buildPushPropertyXml(creds, ru_property_id, p);
      const compactRequestXml = compactXml(xml);
      console.log(`[rentalsunited-api] Push XML length: ${compactRequestXml.length}, ru_property_id: ${ru_property_id}`);
      console.log(`[rentalsunited-api] XML first 300 chars: ${previewXml(sanitizeXmlForLogs(compactRequestXml), 300)}`);
      const response = await callRentalsUnited(creds, xml);
      console.log(`[rentalsunited-api] RU push response: ${response.substring(0, 500)}`);
      const { ok, status } = handleRUStatus(response);
      if (!ok) {
        const diag = buildDiagnostics(compactRequestXml, status, 'push_property', response);
        console.error(`[rentalsunited-api] RU error ${status.id}: ${status.message}`);
        console.error(`[rentalsunited-api] XML context around error: ${diag.xml_context}`);
        return ruErrorResponse(status, diag);
      }
      return jsonResponse({
        success: true,
        message: 'Property pushed successfully',
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
      const xml = buildPushAvailabilityXml(creds, ru_property_id, body.availability);
      const response = await callRentalsUnited(creds, xml);
      const { ok, status } = handleRUStatus(response);
      if (!ok) return ruErrorResponse(status);
      return jsonResponse({ success: true, message: 'Availability pushed successfully', raw_xml: response });
    }

    // ── push_prices (mandatory) ──
    if (action === 'push_prices') {
      if (!ru_property_id) return errorResponse('MISSING_PARAM', 'ru_property_id is required');
      if (!body.prices || body.prices.length === 0) return errorResponse('MISSING_PARAM', 'prices array is required');
      const xml = buildPushPricesXml(creds, ru_property_id, body.prices);
      const response = await callRentalsUnited(creds, xml);
      const { ok, status } = handleRUStatus(response);
      if (!ok) return ruErrorResponse(status);
      return jsonResponse({ success: true, message: 'Prices pushed successfully', raw_xml: response });
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

    // ── push_long_stay_discounts (optional) ──
    if (action === 'push_long_stay_discounts') {
      if (!ru_property_id) return errorResponse('MISSING_PARAM', 'ru_property_id is required');
      if (!body.discounts || body.discounts.length === 0) return errorResponse('MISSING_PARAM', 'discounts array is required');
      const xml = buildPushLongStayDiscountsXml(creds, ru_property_id, body.discounts);
      const response = await callRentalsUnited(creds, xml);
      const { ok, status } = handleRUStatus(response);
      if (!ok) return ruErrorResponse(status);
      return jsonResponse({ success: true, message: 'Long stay discounts pushed successfully', raw_xml: response });
    }

    // ── push_last_minute_discounts (optional) ──
    if (action === 'push_last_minute_discounts') {
      if (!ru_property_id) return errorResponse('MISSING_PARAM', 'ru_property_id is required');
      if (!body.discounts || body.discounts.length === 0) return errorResponse('MISSING_PARAM', 'discounts array is required');
      const xml = buildPushLastMinuteDiscountsXml(creds, ru_property_id, body.discounts);
      const response = await callRentalsUnited(creds, xml);
      const { ok, status } = handleRUStatus(response);
      if (!ok) return ruErrorResponse(status);
      return jsonResponse({ success: true, message: 'Last minute discounts pushed successfully', raw_xml: response });
    }

    // ── set_property_status ──
    if (action === 'set_property_status') {
      if (!ru_property_id) return errorResponse('MISSING_PARAM', 'ru_property_id is required');
      const isActive = body.metadata?.is_active !== false;
      const isArchived = body.metadata?.is_archived === true;
      const xml = buildSetPropertyStatusXml(creds, ru_property_id, isActive as boolean, isArchived as boolean);
      const response = await callRentalsUnited(creds, xml);
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
    if (action === 'push_building') {
      if (!body.building_name) return errorResponse('MISSING_PARAM', 'building_name is required');
      const bId = body.building_id || 0;
      const xml = buildPushBuildingXml(creds, bId, body.building_name, body.unit_types);
      const compactRequestXml = compactXml(xml);
      const response = await callRentalsUnited(creds, xml);
      console.log(`[rentalsunited-api] Push building response: ${response.substring(0, 500)}`);
      const { ok, status } = handleRUStatus(response);
      if (!ok) return ruErrorResponse(status, buildDiagnostics(compactRequestXml, status, 'push_building', response));
      const buildingId = extractBuildingId(response);
      return jsonResponse({
        success: true,
        building_id: buildingId ? parseInt(buildingId, 10) : null,
        message: 'Building pushed successfully',
        raw_xml: response,
        diagnostics: {
          request_preview: previewXml(sanitizeXmlForLogs(compactRequestXml), 600),
          request_xml: sanitizeXmlForLogs(compactRequestXml),
          response_preview: previewXml(response, 600),
        },
      });
    }

    // ── list_buildings ──
    if (action === 'list_buildings') {
      const xml = buildListBuildingsXml(creds);
      const response = await callRentalsUnited(creds, xml);
      const { ok, status } = handleRUStatus(response);
      if (!ok) return ruErrorResponse(status);
      const buildings = extractBuildings(response);
      return jsonResponse({ success: true, buildings, count: buildings.length, raw_xml: response });
    }

    // assign_building_properties removed — not a valid RU API method.
    // Units are assigned to buildings via <BuildingID> in each unit's property push XML.

    // ── create_user ──
    if (action === 'create_user') {
      if (!body.user) return errorResponse('MISSING_PARAM', 'user payload is required (first_name, last_name, email, password)');
      const { first_name, last_name, email, password } = body.user;
      if (!first_name || !last_name || !email || !password) return errorResponse('VALIDATION', 'user must include first_name, last_name, email, and password');
      const xml = buildCreateUserXml(creds, { first_name, last_name, email, password });
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
      if (!body.ru_property_id) return errorResponse('MISSING_PARAM', 'ru_property_id (UserAccountId) is required');
      if (!body.company) return errorResponse('MISSING_PARAM', 'company payload is required');
      if (!body.company.name) return errorResponse('VALIDATION', 'company.name is required');
      const xml = buildFillCompanyDetailsXml(creds, body.ru_property_id, body.company);
      const response = await callRentalsUnited(creds, xml);
      console.log(`[rentalsunited-api] FillCompanyDetails response: ${response.substring(0, 500)}`);
      const { ok, status } = handleRUStatus(response);
      if (!ok) return ruErrorResponse(status);
      return jsonResponse({ success: true, message: 'Company details filled successfully', raw_xml: response });
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
