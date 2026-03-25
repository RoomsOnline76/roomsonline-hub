/**
 * HOSTFULLY API FETCHERS
 * Typed wrappers for each Hostfully endpoint
 * Zero business logic - pure API communication
 * 
 * REQUIRED CALLS (MAX 8 TOTAL):
 * 1. GET /properties/{uid}
 * 2. GET /property-descriptions?propertyUid={uid}
 * 3. GET /property-rules?propertyUid={uid}
 * 4. GET /available-amenities
 * 5. GET /photos?propertyUid={uid}
 * 6. GET /rooms?propertyUid={uid} OR /multi-units/unit-types?hotelUid={uid}
 * 7. GET /fees?propertyUid={uid}
 * 8. GET /pricing-periods?propertyUid={uid}
 */

import {
  HostfullyCredentials,
  HostfullyPropertyPayload,
  HostfullyDescriptionPayload,
  HostfullyRulePayload,
  HostfullyAmenityPayload,
  HostfullyPhotoPayload,
  HostfullyRoomPayload,
  HostfullyFeePayload,
  HostfullyPricingPeriodPayload,
} from "./types.ts";

// ============================================================================
// CONSTANTS
// ============================================================================

const HOSTFULLY_URLS: Record<string, string> = {
  sandbox: "https://sandbox.hostfully.com/api/v3",
  staging: "https://sandbox.hostfully.com/api/v3",
  production: "https://api.hostfully.com/api/v3",
};

// ============================================================================
// BASE REQUEST HELPER
// ============================================================================

async function hostfullyFetch<T>(
  endpoint: string,
  creds: HostfullyCredentials,
  method: string = "GET"
): Promise<{ success: boolean; data: T | null; error: string | null }> {
  const baseUrl = HOSTFULLY_URLS[creds.environment] || HOSTFULLY_URLS.production;
  const url = `${baseUrl}${endpoint}`;
  
  console.log(`[Hostfully Fetcher] ${method} ${url}`);
  
  try {
    const response = await fetch(url, {
      method,
      headers: {
        "X-HOSTFULLY-APIKEY": creds.api_key,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Hostfully Fetcher] Error ${response.status}: ${errorText}`);
      return { 
        success: false, 
        data: null, 
        error: `HTTP ${response.status}: ${errorText}` 
      };
    }
    
    const data = await response.json();
    return { success: true, data: data as T, error: null };
  } catch (err) {
    console.error(`[Hostfully Fetcher] Exception:`, err);
    return { 
      success: false, 
      data: null, 
      error: err instanceof Error ? err.message : String(err) 
    };
  }
}

// ============================================================================
// ENDPOINT FETCHERS
// ============================================================================

/**
 * 1. Fetch core property data
 * GET /properties/{propertyUid}
 */
export async function fetchProperty(
  propertyUid: string,
  creds: HostfullyCredentials
): Promise<{ success: boolean; data: HostfullyPropertyPayload | null; error: string | null }> {
  return hostfullyFetch<HostfullyPropertyPayload>(
    `/properties/${propertyUid}`,
    creds
  );
}

/**
 * 2. Fetch property descriptions
 * GET /property-descriptions?propertyUid={propertyUid}
 */
export async function fetchDescriptions(
  propertyUid: string,
  creds: HostfullyCredentials
): Promise<{ success: boolean; data: HostfullyDescriptionPayload | null; error: string | null }> {
  const result = await hostfullyFetch<HostfullyDescriptionPayload | HostfullyDescriptionPayload[]>(
    `/property-descriptions?propertyUid=${propertyUid}`,
    creds
  );
  
  // API might return array or single object
  if (result.success && result.data) {
    const data = Array.isArray(result.data) ? result.data[0] : result.data;
    return { success: true, data, error: null };
  }
  
  return { success: result.success, data: null, error: result.error };
}

/**
 * 3. Fetch property rules
 * GET /property-rules?propertyUid={propertyUid}
 */
export async function fetchRules(
  propertyUid: string,
  creds: HostfullyCredentials
): Promise<{ success: boolean; data: HostfullyRulePayload[] | null; error: string | null }> {
  const result = await hostfullyFetch<{ rules?: HostfullyRulePayload[] } | HostfullyRulePayload[]>(
    `/property-rules?propertyUid=${propertyUid}`,
    creds
  );
  
  if (result.success && result.data) {
    const rules = Array.isArray(result.data) 
      ? result.data 
      : (result.data as { rules?: HostfullyRulePayload[] }).rules || [];
    return { success: true, data: rules, error: null };
  }
  
  return { success: result.success, data: [], error: result.error };
}

/**
 * 4. Fetch property-specific amenities
 * GET /properties/{propertyUid}/amenities
 * Falls back to master list if property-specific endpoint fails
 */
export async function fetchPropertyAmenities(
  propertyUid: string,
  creds: HostfullyCredentials
): Promise<{ success: boolean; data: HostfullyAmenityPayload[] | null; error: string | null }> {
  // Try property-specific amenities first
  const result = await hostfullyFetch<{ amenities?: HostfullyAmenityPayload[] } | HostfullyAmenityPayload[]>(
    `/properties/${propertyUid}/amenities`,
    creds
  );
  
  if (result.success && result.data) {
    const amenities = Array.isArray(result.data) 
      ? result.data 
      : (result.data as { amenities?: HostfullyAmenityPayload[] }).amenities || [];
    if (amenities.length > 0) {
      return { success: true, data: amenities, error: null };
    }
  }
  
  // Fallback: master amenity list
  console.log(`[Hostfully Fetcher] Property amenities empty, falling back to master list`);
  const fallback = await hostfullyFetch<{ amenities?: HostfullyAmenityPayload[] } | HostfullyAmenityPayload[]>(
    `/available-amenities`,
    creds
  );
  
  if (fallback.success && fallback.data) {
    const amenities = Array.isArray(fallback.data) 
      ? fallback.data 
      : (fallback.data as { amenities?: HostfullyAmenityPayload[] }).amenities || [];
    return { success: true, data: amenities, error: null };
  }
  
  return { success: fallback.success, data: [], error: fallback.error };
}

/**
 * 5. Fetch property photos
 * GET /photos?propertyUid={propertyUid}
 */
export async function fetchPhotos(
  propertyUid: string,
  creds: HostfullyCredentials
): Promise<{ success: boolean; data: HostfullyPhotoPayload[] | null; error: string | null }> {
  const result = await hostfullyFetch<{ photos?: HostfullyPhotoPayload[] } | HostfullyPhotoPayload[]>(
    `/photos?propertyUid=${propertyUid}`,
    creds
  );
  
  if (result.success && result.data) {
    const photos = Array.isArray(result.data) 
      ? result.data 
      : (result.data as { photos?: HostfullyPhotoPayload[] }).photos || [];
    return { success: true, data: photos, error: null };
  }
  
  return { success: result.success, data: [], error: result.error };
}

/**
 * 6a. Fetch rooms (single-unit properties)
 * GET /rooms?propertyUid={propertyUid}
 */
export async function fetchRooms(
  propertyUid: string,
  creds: HostfullyCredentials
): Promise<{ success: boolean; data: HostfullyRoomPayload[] | null; error: string | null }> {
  const result = await hostfullyFetch<{ rooms?: HostfullyRoomPayload[] } | HostfullyRoomPayload[]>(
    `/rooms?propertyUid=${propertyUid}`,
    creds
  );
  
  if (result.success && result.data) {
    const rooms = Array.isArray(result.data) 
      ? result.data 
      : (result.data as { rooms?: HostfullyRoomPayload[] }).rooms || [];
    return { success: true, data: rooms, error: null };
  }
  
  return { success: result.success, data: [], error: result.error };
}

/**
 * 6b. Fetch multi-unit types (multi-unit properties)
 * GET /multi-units/unit-types?hotelUid={propertyUid}
 */
export async function fetchMultiUnits(
  propertyUid: string,
  creds: HostfullyCredentials
): Promise<{ success: boolean; data: HostfullyRoomPayload[] | null; error: string | null }> {
  const result = await hostfullyFetch<{ unitTypes?: HostfullyRoomPayload[] } | HostfullyRoomPayload[]>(
    `/multi-units/unit-types?hotelUid=${propertyUid}`,
    creds
  );
  
  if (result.success && result.data) {
    const units = Array.isArray(result.data) 
      ? result.data 
      : (result.data as { unitTypes?: HostfullyRoomPayload[] }).unitTypes || [];
    return { success: true, data: units, error: null };
  }
  
  return { success: result.success, data: [], error: result.error };
}

/**
 * 7. Fetch property fees
 * GET /fees?propertyUid={propertyUid}
 */
export async function fetchFees(
  propertyUid: string,
  creds: HostfullyCredentials
): Promise<{ success: boolean; data: HostfullyFeePayload[] | null; error: string | null }> {
  const result = await hostfullyFetch<{ fees?: HostfullyFeePayload[] } | HostfullyFeePayload[]>(
    `/fees?propertyUid=${propertyUid}`,
    creds
  );
  
  if (result.success && result.data) {
    const fees = Array.isArray(result.data) 
      ? result.data 
      : (result.data as { fees?: HostfullyFeePayload[] }).fees || [];
    return { success: true, data: fees, error: null };
  }
  
  return { success: result.success, data: [], error: result.error };
}

/**
 * 8. Fetch pricing periods (seasons)
 * GET /pricing-periods?propertyUid={propertyUid}&from={today}&to={today+365}
 */
export async function fetchPricingPeriods(
  propertyUid: string,
  creds: HostfullyCredentials
): Promise<{ success: boolean; data: HostfullyPricingPeriodPayload[] | null; error: string | null }> {
  const today = new Date().toISOString().split('T')[0];
  const nextYear = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  
  const result = await hostfullyFetch<{ pricingPeriods?: HostfullyPricingPeriodPayload[] } | HostfullyPricingPeriodPayload[]>(
    `/pricing-periods?propertyUid=${propertyUid}&from=${today}&to=${nextYear}`,
    creds
  );
  
  if (result.success && result.data) {
    const periods = Array.isArray(result.data) 
      ? result.data 
      : (result.data as { pricingPeriods?: HostfullyPricingPeriodPayload[] }).pricingPeriods || [];
    return { success: true, data: periods, error: null };
  }
  
  return { success: result.success, data: [], error: result.error };
}
