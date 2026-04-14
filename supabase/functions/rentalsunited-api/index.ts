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
 * 
 * Push (write) actions:
 * - push_property: Push_PutProperty_RQ
 * - push_availability: Push_PutAvbUnits_RQ
 * - push_prices: Push_PutPrices_RQ
 * - subscribe_notifications: LNM_PutHandlerUrl_RQ
 * - push_long_stay_discounts: Push_PutLongStayDiscounts_RQ
 * - push_last_minute_discounts: Push_PutLastMinuteDiscounts_RQ
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
  valid_from: string;
  valid_to: string;
  rules: { from_days: number; to_days: number; percentage: number }[];
}

interface RUPropertyPayload {
  name: string;
  property_type_id: number;
  can_sleep_max: number;
  standard_guests: number;
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
  cancellation_policies: RUCancellationPolicy[];
  owner_id?: number;
  no_of_units?: number;
  security_deposit?: number;
  check_in_from?: string;
  check_in_to?: string;
  check_out_until?: string;
}

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

// ── API Call Helper ──────────────────────────────────────────

async function callRentalsUnited(creds: RUCredentials, xmlBody: string): Promise<string> {
  // Strip XML declaration — RU's .NET handler identifies the method from the root element
  // and chokes when <?xml?> is present. Then compact to single line.
  const stripped = xmlBody.replace(/<\?xml[^?]*\?>\s*/gi, '');
  const compactXml = stripped.replace(/>\s+</g, '><').trim();

  console.log(`[rentalsunited-api] Compact XML first 500: "${compactXml.substring(0, 500)}"`);

  const response = await fetch(creds.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml; charset=utf-8' },
    body: compactXml,
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
  const amenitiesXml = prop.amenities
    .map(a => `<Amenity Count="${a.count || 1}">${a.id}</Amenity>`)
    .join('\n      ');

  const roomsXml = prop.rooms
    .map(r => {
      const roomAmenities = r.amenities
        .map(a => `<Amenity Count="${a.count || 1}">${a.id}</Amenity>`)
        .join('\n          ');
      return `<CompositionRoomAmenities CompositionRoomID="${r.room_id}">
        <Amenities>
          ${roomAmenities}
        </Amenities>
      </CompositionRoomAmenities>`;
    })
    .join('\n      ');

  const descriptionsXml = prop.descriptions
    .map(d => `<Description LanguageID="${d.language_id}"><Text>${escapeXml(d.text)}</Text></Description>`)
    .join('\n      ');

  const imagesXml = prop.images
    .map(img => `<Image ImageTypeID="${img.type_id || 1}"${img.is_main ? ' IsMainImage="true"' : ''}><URL>${escapeXml(img.url)}</URL></Image>`)
    .join('\n      ');

  const paymentMethodsXml = prop.payment_methods
    .map(pm => `<PaymentMethod>${pm}</PaymentMethod>`)
    .join('\n      ');

  const cancellationPoliciesXml = prop.cancellation_policies
    .map(cp => {
      const rulesXml = cp.rules
        .map(r => `<CancellationPolicyRule DateFrom="${r.from_days}" DateTo="${r.to_days}" PercentPrice="${r.percentage}" />`)
        .join('\n          ');
      return `<CancellationPolicy ValidFrom="${cp.valid_from}" ValidTo="${cp.valid_to}">
        ${rulesXml}
      </CancellationPolicy>`;
    })
    .join('\n      ');

  // Build CheckInOut block
  const checkInOutXml = `<CheckInOut>
      <CheckInFrom>${prop.check_in_from || '14:00'}</CheckInFrom>
      <CheckInTo>${prop.check_in_to || '22:00'}</CheckInTo>
      <CheckOutUntil>${prop.check_out_until || '10:00'}</CheckOutUntil>
      <Place>apartment</Place>
    </CheckInOut>`;

  // SecurityDeposit with required DepositTypeID attribute
  const securityDepositXml = prop.security_deposit != null
    ? `\n    <SecurityDeposit DepositTypeID="5">${prop.security_deposit}</SecurityDeposit>` : '';

  // Only include CompositionRoomsAmenities if we have actual room data
  const compositionXml = roomsXml
    ? `\n    <CompositionRoomsAmenities>\n      ${roomsXml}\n    </CompositionRoomsAmenities>` : '';

  // Strict XSD element order per RU documentation
  return `<Push_PutProperty_RQ>
  ${buildAuthXml(creds)}
  <Property>
    <ID>${propertyId}</ID>
    <Name><Text>${escapeXml(prop.name)}</Text></Name>
    <OwnerID>${prop.owner_id || 1}</OwnerID>
    <DetailedLocationID TypeID="4">${prop.detailed_location_id}</DetailedLocationID>
    <IsActive>true</IsActive>
    <IsArchived>false</IsArchived>
    <Space>${prop.space}</Space>
    <StandardGuests>${Math.min(prop.standard_guests, prop.can_sleep_max)}</StandardGuests>
    <CanSleepMax>${prop.can_sleep_max}</CanSleepMax>
    <PropertyTypeID>${prop.property_type_id}</PropertyTypeID>
    <NoOfUnits>${prop.no_of_units || 1}</NoOfUnits>
    <Floor>${prop.floor}</Floor>
    <Street>${escapeXml(prop.street)}</Street>
    <ZipCode>${escapeXml(prop.zip_code)}</ZipCode>
    <Coordinates>
      <Latitude>${prop.latitude}</Latitude>
      <Longitude>${prop.longitude}</Longitude>
    </Coordinates>
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
    <CancellationPolicies>
      ${cancellationPoliciesXml}
    </CancellationPolicies>
    <Descriptions>
      ${descriptionsXml}
    </Descriptions>${securityDepositXml}${compositionXml}
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

// ── Action Handlers ──────────────────────────────────────────

function handleRUStatus(response: string): { ok: boolean; status: { id: string; message: string } } {
  const status = extractStatusId(response);
  return { ok: status.id === '0', status };
}

function ruErrorResponse(status: { id: string; message: string }): Response {
  return jsonResponse({ success: false, error: { code: 'RU_ERROR', message: status.message, ru_status_id: status.id } });
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
      if (!p.name || !p.object_type_id || !p.can_sleep_max || p.floor == null || !p.space) {
        return errorResponse('VALIDATION', 'Property must include name, object_type_id, can_sleep_max, floor, and space');
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
      console.log(`[rentalsunited-api] XML first 100 chars: ${JSON.stringify(xml.substring(0, 100))}`);
      console.log(`[rentalsunited-api] Push XML length: ${xml.length}, ru_property_id: ${ru_property_id}`);
      const response = await callRentalsUnited(creds, xml);
      console.log(`[rentalsunited-api] RU push response: ${response.substring(0, 500)}`);
      const { ok, status } = handleRUStatus(response);
      if (!ok) return ruErrorResponse(status);
      return jsonResponse({ success: true, message: 'Property pushed successfully', raw_xml: response });
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
