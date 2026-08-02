import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface QualityCheckResult {
  id: string;
  name: string;
  passed: boolean;
  message?: string;
  fix?: string;
  field?: string;
  severity: 'blocker' | 'warning' | 'info';
}

interface ActivationReadinessResponse {
  passed: boolean;
  score: number;
  blockers: QualityCheckResult[];
  warnings: QualityCheckResult[];
  checks: QualityCheckResult[];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { property_id } = await req.json();

    if (!property_id) {
      return new Response(
        JSON.stringify({ error: 'property_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch property data
    const { data: property, error: propertyError } = await supabase
      .from('properties')
      .select('*')
      .eq('id', property_id)
      .single();

    if (propertyError || !property) {
      return new Response(
        JSON.stringify({ error: 'Property not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const amenities = (property.amenities || {}) as Record<string, unknown>;
    const images = Array.isArray(property.images) ? property.images : [];
    const listingIntent = property.listing_intent || 'accommodation';
    
    const checks: QualityCheckResult[] = [];

    // ============= CHECK 1: Valid Contract =============
    const contractCheck = await checkContractValid(supabase, property);
    checks.push(contractCheck);

    // ============= CHECK 2: Content Completeness =============
    const contentCheck = checkContentCompleteness(property, amenities);
    checks.push(contentCheck);

    // ============= CHECK 3: Media Requirements =============
    const mediaCheck = checkMediaRequirements(images, listingIntent);
    checks.push(mediaCheck);

    // ============= CHECK 4: Commercial Fields =============
    const commercialCheck = checkCommercialFields(amenities);
    checks.push(commercialCheck);

    // ============= CHECK 5: PMS Conflicts =============
    const pmsCheck = await checkPMSConflicts(supabase, property, amenities);
    checks.push(pmsCheck);

    // ============= CHECK 6: Location Complete =============
    const locationCheck = checkLocationComplete(property);
    checks.push(locationCheck);

    // ============= CHECK 7: Contact Information =============
    const contactCheck = checkContactInfo(amenities);
    checks.push(contactCheck);

    // ============= CHECK 8: Rooms Configured (for accommodation) =============
    if (listingIntent === 'accommodation' || listingIntent === 'hybrid') {
      const roomsCheck = checkRoomsConfigured(amenities);
      checks.push(roomsCheck);
    }

    // ============= CHECK 9: Policies Complete =============
    const policiesCheck = checkPoliciesComplete(amenities);
    checks.push(policiesCheck);

    // ============= CHECK 10: Rentals United distribution (country + currency) =============
    // Only relevant for properties distributed to RU. Validates that we can resolve a
    // valid RU LocationID (country) and a known RU CurrencyID — failure to do so causes
    // channel partners (LekkeSlaap, Booking.com, etc.) to silently reject the listing.
    if (property.rentalsunited_property_id || property.rentalsunited_building_id) {
      checks.push(checkRentalsUnitedReadiness(property, amenities));
      // Location-owns-currency check: RU stores currency on the LocationID, not the property.
      // If our cached ru_locations row for this property's resolved location has a different
      // currency than what we expect, channels will silently use the wrong one.
      try {
        const { data: mapping } = await supabase
          .from('pms_mappings')
          .select('metadata')
          .eq('property_id', property_id)
          .eq('system_type', 'rentals_united')
          .eq('mapping_type', 'field_mappings')
          .eq('external_id', '__property__')
          .maybeSingle();
        const ruLocId = Number((mapping?.metadata as any)?.ru_location_id);
        const expectedIso = String(((amenities as any)?.banking?.currency || (amenities as any)?.currency || '')).trim().toUpperCase();
        if (ruLocId && expectedIso) {
          const { data: ruLoc } = await supabase
            .from('ru_locations')
            .select('currency_iso, name')
            .eq('id', ruLocId)
            .maybeSingle();
          if (ruLoc && ruLoc.currency_iso && ruLoc.currency_iso !== expectedIso) {
            checks.push({
              id: 'rentalsunited_location_currency',
              name: 'Rentals United location currency',
              passed: false,
              message: `RU location "${ruLoc.name}" (ID ${ruLocId}) is set to ${ruLoc.currency_iso} but this property expects ${expectedIso}.`,
              fix: 'Run reconcile_ru_location_currency to flip the location currency, then re-push the property.',
              field: 'amenities.banking.currency',
              severity: 'blocker',
            });
          }
        }
      } catch (e) {
        console.warn('[check-activation-readiness] ru_locations check failed:', e instanceof Error ? e.message : e);
      }
    }

    // Calculate results
    const blockers = checks.filter(c => !c.passed && c.severity === 'blocker');
    const warnings = checks.filter(c => !c.passed && c.severity === 'warning');
    const passedChecks = checks.filter(c => c.passed);

    // Score calculation: 100 points max, deduct for failed checks
    const blockerWeight = 20;
    const warningWeight = 5;
    const score = Math.max(0, 100 - (blockers.length * blockerWeight) - (warnings.length * warningWeight));

    const response: ActivationReadinessResponse = {
      passed: blockers.length === 0,
      score,
      blockers,
      warnings,
      checks
    };

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error checking activation readiness:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// ============= PMS CODE HELPERS =============

/**
 * Native ROLOS management aliases (mirrors ROLOS_PMS_ALIASES on the frontend,
 * plus the legacy 'rol' value). These properties are managed with internal
 * inventory and never require an external property code.
 */
const NATIVE_ROLOS_SYSTEMS = new Set([
  'rol',
  'rolos',
  'roomsonline',
  'rol_os',
  'rolos_pms',
]);

function isNativeRolosSystem(externalSystem?: string | null): boolean {
  return !!externalSystem && NATIVE_ROLOS_SYSTEMS.has(externalSystem.toLowerCase().trim());
}

/**
 * Get the correct property code based on PMS type
 */
function getPMSPropertyCode(property: any, amenities: Record<string, unknown>, externalSystem: string): string | null {
  const externalIds = amenities.external_ids as Record<string, unknown> | undefined;

  if (isNativeRolosSystem(externalSystem)) {
    // Internally managed properties don't need an external ID
    return 'internal';
  }

  switch (externalSystem.toLowerCase()) {

    case 'nightsbridge':
      // NightsBridge uses BBID - check multiple locations
      return property.external_id || 
             property.bb_id || 
             externalIds?.nightsbridge_bb_id as string || 
             externalIds?.bb_id as string ||
             null;
    case 'benson':
      return property.benson_property_code || null;
    case 'checkfront':
      return property.checkfront_property_code || null;
    case 'cloudbeds':
      return property.cloudbeds_property_id || null;
    case 'littlehotelier':
      return property.littlehotelier_channel_code || null;
    case 'hotelbeds':
      return property.hotelbeds_hotel_code || null;
    case 'hostfully':
      return property.hostfully_property_uid || property.owner_pms_credential_id || null;
    case 'siteminder':
      return property.siteminder_property_code || null;
    case 'rentalsunited':
      return property.rentalsunited_property_id || null;
    default:
      return property.external_property_id || null;
  }
}

/**
 * Get human-readable PMS code label
 */
function getPMSCodeLabel(externalSystem: string): string {
  switch (externalSystem.toLowerCase()) {
    case 'nightsbridge': return 'BBID';
    case 'benson': return 'Benson Code';
    case 'checkfront': return 'Checkfront Property Code';
    case 'cloudbeds': return 'Cloudbeds Property ID';
    case 'littlehotelier': return 'Channel Code';
    case 'hotelbeds': return 'Hotel Code';
    case 'hostfully': return 'Hostfully Property UID';
    case 'siteminder': return 'SiteMinder Property Code';
    case 'rentalsunited': return 'Rentals United Property ID';
    case 'rol': return 'Internal Property';
    default: return 'External Property ID';
  }
}

/**
 * Get the field name for navigation
 */
function getPMSCodeField(externalSystem: string): string {
  switch (externalSystem.toLowerCase()) {
    case 'nightsbridge': return 'external_id';
    case 'benson': return 'benson_property_code';
    case 'checkfront': return 'checkfront_property_code';
    case 'cloudbeds': return 'cloudbeds_property_id';
    case 'littlehotelier': return 'littlehotelier_channel_code';
    case 'hotelbeds': return 'hotelbeds_hotel_code';
    case 'hostfully': return 'hostfully_property_uid';
    case 'siteminder': return 'siteminder_property_code';
    default: return 'external_property_id';
  }
}

// ============= CHECK FUNCTIONS =============

async function checkContractValid(supabase: any, property: any): Promise<QualityCheckResult> {
  const ownerEmail = property.owner_email;
  
  if (!ownerEmail) {
    return {
      id: 'contract',
      name: 'Valid Contract',
      passed: false,
      message: 'No owner email associated with property',
      fix: 'Assign an owner email to this property',
      field: 'owner_email',
      severity: 'blocker'
    };
  }

  // Check owner_contracts table first
  const { data: ownerContract } = await supabase
    .from('owner_contracts')
    .select('status, signed_at, override_at')
    .eq('owner_email', ownerEmail)
    .in('status', ['signed', 'overridden'])
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (ownerContract) {
    return {
      id: 'contract',
      name: 'Valid Contract',
      passed: true,
      message: ownerContract.status === 'signed' 
        ? `Contract signed on ${new Date(ownerContract.signed_at).toLocaleDateString()}`
        : 'Contract overridden by admin',
      severity: 'blocker'
    };
  }

  // Fallback: check legacy property_contracts
  const { data: legacyContract } = await supabase
    .from('property_contracts')
    .select('status, signed_at')
    .eq('property_id', property.id)
    .in('status', ['signed', 'overridden'])
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (legacyContract) {
    return {
      id: 'contract',
      name: 'Valid Contract',
      passed: true,
      message: 'Legacy contract found',
      severity: 'blocker'
    };
  }

  return {
    id: 'contract',
    name: 'Valid Contract',
    passed: false,
    message: 'No signed contract found for this owner',
    fix: 'Send and sign a contract before activation',
    severity: 'blocker'
  };
}

function checkContentCompleteness(property: any, amenities: Record<string, unknown>): QualityCheckResult {
  const requiredFields = [
    { key: 'name', value: property.name, label: 'Property Name' },
    { key: 'property_type', value: property.property_type, label: 'Property Type' },
    { key: 'description', value: property.description, label: 'Description' }
  ];

  const missing = requiredFields.filter(f => !f.value);
  
  if (missing.length > 0) {
    return {
      id: 'content',
      name: 'Content Complete',
      passed: false,
      message: `Missing: ${missing.map(m => m.label).join(', ')}`,
      fix: `Complete the following fields: ${missing.map(m => m.label).join(', ')}`,
      field: missing[0].key,
      severity: 'blocker'
    };
  }

  // Check description length
  if (property.description && property.description.length < 100) {
    return {
      id: 'content',
      name: 'Content Complete',
      passed: false,
      message: 'Description is too short (minimum 100 characters)',
      fix: 'Expand the property description to at least 100 characters',
      field: 'description',
      severity: 'warning'
    };
  }

  return {
    id: 'content',
    name: 'Content Complete',
    passed: true,
    message: 'All required content fields are complete',
    severity: 'blocker'
  };
}

function checkMediaRequirements(images: any[], listingIntent: string): QualityCheckResult {
  const minImages = 3;
  const imageCount = images.length;
  
  if (imageCount < minImages) {
    return {
      id: 'media',
      name: 'Media Requirements',
      passed: false,
      message: `Only ${imageCount} images uploaded (minimum ${minImages} required)`,
      fix: `Upload at least ${minImages - imageCount} more images`,
      field: 'images',
      severity: 'blocker'
    };
  }

  // Check for hero image
  const hasHero = images.some((img: any) => img.type === 'hero');
  if (!hasHero) {
    return {
      id: 'media',
      name: 'Media Requirements',
      passed: false,
      message: 'No hero image designated',
      fix: 'Mark one image as the hero/featured image',
      field: 'images',
      severity: 'warning'
    };
  }

  return {
    id: 'media',
    name: 'Media Requirements',
    passed: true,
    message: `${imageCount} images uploaded with hero image set`,
    severity: 'blocker'
  };
}

function checkCommercialFields(amenities: Record<string, unknown>): QualityCheckResult {
  const hasBankDetails = amenities.bank_name || amenities.bank_account_number || amenities.bank_confirmation_letter_url;
  
  if (!hasBankDetails) {
    return {
      id: 'commercial',
      name: 'Commercial Fields',
      passed: false,
      message: 'No bank details provided',
      fix: 'Add banking information for commission payments',
      field: 'amenities.bank_name',
      severity: 'warning'
    };
  }

  return {
    id: 'commercial',
    name: 'Commercial Fields',
    passed: true,
    message: 'Bank details configured',
    severity: 'warning'
  };
}

async function checkPMSConflicts(supabase: any, property: any, amenities: Record<string, unknown>): Promise<QualityCheckResult> {
  const externalSystem = property.external_system;
  
  if (!externalSystem || externalSystem === 'none') {
    return {
      id: 'pms',
      name: 'PMS Integration',
      passed: true,
      message: 'No PMS connected (manual management)',
      severity: 'info'
    };
  }

  // Check if PMS is in production mode
  const { data: pmsStatus } = await supabase
    .from('pms_tracker_status')
    .select('is_production, active_environment')
    .eq('system_type', externalSystem.toLowerCase())
    .maybeSingle();

  if (pmsStatus && !pmsStatus.is_production) {
    return {
      id: 'pms',
      name: 'PMS Integration',
      passed: false,
      message: `${externalSystem} is in sandbox mode`,
      fix: 'Switch PMS to production mode before activation',
      severity: 'warning'
    };
  }

  // Get PMS-specific property code
  const propertyCode = getPMSPropertyCode(property, amenities, externalSystem);
  const codeLabel = getPMSCodeLabel(externalSystem);
  const codeField = getPMSCodeField(externalSystem);
  
  // Internal ROL properties don't need external ID validation
  if (externalSystem.toLowerCase() === 'rol') {
    return {
      id: 'pms',
      name: 'PMS Integration',
      passed: true,
      message: 'ROL-managed property (internal)',
      severity: 'info'
    };
  }

  // Check if the PMS-specific property code is set
  if (!propertyCode) {
    return {
      id: 'pms',
      name: 'PMS Integration',
      passed: false,
      message: `${externalSystem} connected but no ${codeLabel} linked`,
      fix: `Enter the ${codeLabel} to link this property to ${externalSystem}`,
      field: codeField,
      severity: 'blocker'
    };
  }

  return {
    id: 'pms',
    name: 'PMS Integration',
    passed: true,
    message: `Connected to ${externalSystem} (${codeLabel}: ${propertyCode})`,
    severity: 'info'
  };
}

function checkRentalsUnitedReadiness(property: any, amenities: Record<string, unknown>): QualityCheckResult {
  const SUPPORTED_COUNTRIES = ['ZA', 'RSA', 'SOUTH AFRICA', 'NA', 'NAMIBIA', 'BW', 'BOTSWANA'];
  const KNOWN_CURRENCIES = new Set(['ZAR', 'USD', 'EUR', 'GBP', 'NAD', 'BWP', 'AUD', 'CAD', 'CHF', 'JPY', 'NZD', 'AED', 'MZN', 'ZMW']);

  const country = String(property.country || '').trim().toUpperCase();
  const hasCoords = Number.isFinite(Number(property.latitude)) && Number.isFinite(Number(property.longitude)) && Number(property.latitude) !== 0 && Number(property.longitude) !== 0;
  const banking = ((amenities as any)?.banking || {}) as Record<string, unknown>;
  const currencyIso = String(banking.currency || (amenities as any)?.currency || '').trim().toUpperCase();
  const currencyOk = KNOWN_CURRENCIES.has(currencyIso);
  const countryOk = !!country && (SUPPORTED_COUNTRIES.includes(country) || hasCoords);

  if (!countryOk) {
    return {
      id: 'rentalsunited_geo',
      name: 'Rentals United distribution',
      passed: false,
      message: 'Cannot resolve a Rentals United LocationID — set valid coordinates or a supported country (ZA / NA / BW).',
      fix: 'Open the General tab → set Country and re-pin the map marker so latitude/longitude are populated.',
      field: 'country',
      severity: 'blocker',
    };
  }
  if (!currencyOk) {
    return {
      id: 'rentalsunited_geo',
      name: 'Rentals United distribution',
      passed: false,
      message: `Currency "${currencyIso || 'unset'}" is not mapped to a Rentals United CurrencyID — channels (e.g. LekkeSlaap) will reject the listing.`,
      fix: 'Open the General tab → Banking Details and pick a supported currency (ZAR, USD, EUR, GBP, NAD, BWP).',
      field: 'amenities.banking.currency',
      severity: 'warning',
    };
  }
  return {
    id: 'rentalsunited_geo',
    name: 'Rentals United distribution',
    passed: true,
    message: `Country "${country}" + currency ${currencyIso} ready for Rentals United.`,
    severity: 'info',
  };
}

function checkLocationComplete(property: any): QualityCheckResult {
  const requiredFields = [
    { key: 'address', value: property.address, label: 'Street Address' },
    { key: 'city', value: property.city, label: 'City' },
    { key: 'country', value: property.country, label: 'Country' }
  ];

  const missing = requiredFields.filter(f => !f.value);
  
  if (missing.length > 0) {
    return {
      id: 'location',
      name: 'Location Complete',
      passed: false,
      message: `Missing: ${missing.map(m => m.label).join(', ')}`,
      fix: `Complete the following fields: ${missing.map(m => m.label).join(', ')}`,
      field: missing[0].key,
      severity: 'blocker'
    };
  }

  // Check for coordinates (nice to have)
  if (!property.latitude || !property.longitude) {
    return {
      id: 'location',
      name: 'Location Complete',
      passed: true,
      message: 'Address complete but GPS coordinates missing',
      fix: 'Add GPS coordinates for accurate map display',
      field: 'latitude',
      severity: 'info'
    };
  }

  return {
    id: 'location',
    name: 'Location Complete',
    passed: true,
    message: 'Location fully configured with coordinates',
    severity: 'blocker'
  };
}

function checkContactInfo(amenities: Record<string, unknown>): QualityCheckResult {
  const contact = amenities.contact as Record<string, unknown> | undefined;
  const hasPhone = amenities.telephone || amenities.mobile_number || contact?.telephone || contact?.phone;
  const hasEmail = amenities.contact_email || contact?.email;
  
  if (!hasPhone && !hasEmail) {
    return {
      id: 'contact',
      name: 'Contact Information',
      passed: false,
      message: 'No contact information provided',
      fix: 'Add phone number or email for guest inquiries',
      field: 'amenities.telephone',
      severity: 'blocker'
    };
  }

  if (!hasPhone) {
    return {
      id: 'contact',
      name: 'Contact Information',
      passed: true,
      message: 'Email provided but phone number missing',
      fix: 'Consider adding a phone number',
      severity: 'info'
    };
  }

  return {
    id: 'contact',
    name: 'Contact Information',
    passed: true,
    message: 'Contact information complete',
    severity: 'blocker'
  };
}

function checkRoomsConfigured(amenities: Record<string, unknown>): QualityCheckResult {
  const roomTypes = amenities.room_types as Array<{ name?: string; max_guests?: number }> | undefined;
  
  if (!roomTypes || roomTypes.length === 0) {
    return {
      id: 'rooms',
      name: 'Rooms Configured',
      passed: false,
      message: 'No room types defined',
      fix: 'Add at least one room type with pricing',
      field: 'amenities.room_types',
      severity: 'blocker'
    };
  }

  const incompleteRooms = roomTypes.filter(r => !r.name || !r.max_guests);
  if (incompleteRooms.length > 0) {
    return {
      id: 'rooms',
      name: 'Rooms Configured',
      passed: false,
      message: `${incompleteRooms.length} room(s) missing required details`,
      fix: 'Complete name and max guests for all rooms',
      field: 'amenities.room_types',
      severity: 'warning'
    };
  }

  return {
    id: 'rooms',
    name: 'Rooms Configured',
    passed: true,
    message: `${roomTypes.length} room type(s) configured`,
    severity: 'blocker'
  };
}

function checkPoliciesComplete(amenities: Record<string, unknown>): QualityCheckResult {
  const hasCheckIn = amenities.check_in_from || amenities.check_in_time;
  const hasCheckOut = amenities.check_out_until || amenities.check_out_time;
  
  if (!hasCheckIn || !hasCheckOut) {
    return {
      id: 'policies',
      name: 'Policies Complete',
      passed: false,
      message: 'Missing check-in/check-out times',
      fix: 'Set check-in and check-out times',
      field: 'amenities.check_in_time',
      severity: 'warning'
    };
  }

  return {
    id: 'policies',
    name: 'Policies Complete',
    passed: true,
    message: 'Check-in/check-out policies set',
    severity: 'warning'
  };
}
