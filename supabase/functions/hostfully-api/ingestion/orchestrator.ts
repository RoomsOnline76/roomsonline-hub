/**
 * HOSTFULLY INGESTION ORCHESTRATOR
 * Central orchestration logic with parallel fetching
 * 
 * Execution Model:
 * - Multi-endpoint fetch (max 8 API calls)
 * - Single orchestration context
 * - One consolidated write phase
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  IngestionContext,
  IngestionResult,
  HostfullyCredentials,
  HostfullyPropertyPayload,
} from "./types.ts";
import {
  fetchProperty,
  fetchDescriptions,
  fetchRules,
  fetchAvailableAmenities,
  fetchPhotos,
  fetchRooms,
  fetchMultiUnits,
  fetchFees,
  fetchPricingPeriods,
} from "./fetchers.ts";
import { transformFullIngestion } from "./transformers.ts";
import { writeIngestion } from "./writer.ts";

// ============================================================================
// RESPONSE HELPERS
// ============================================================================

interface AdapterResponse<T = unknown> {
  success: boolean;
  data: T | null;
  error: { code: string; message: string; details?: unknown } | null;
  source: string;
  fetched_at: string;
  action: string;
}

function createSuccessResponse<T>(data: T, action: string): AdapterResponse<T> {
  return {
    success: true,
    data,
    error: null,
    source: "hostfully",
    fetched_at: new Date().toISOString(),
    action,
  };
}

function createErrorResponse(
  code: string,
  message: string,
  action: string,
  details?: unknown
): AdapterResponse<null> {
  return {
    success: false,
    data: null,
    error: { code, message, details },
    source: "hostfully",
    fetched_at: new Date().toISOString(),
    action,
  };
}

// ============================================================================
// MULTI-UNIT DETECTION
// ============================================================================

/**
 * Detect if property is multi-unit based on property data
 */
function detectMultiUnit(property: HostfullyPropertyPayload): boolean {
  // Check for multi-unit indicators
  const type = (property.propertyType || property.type || '').toLowerCase();
  return type.includes('multi') || 
         type.includes('hotel') || 
         type.includes('hostel') ||
         type.includes('building');
}

// ============================================================================
// CREDENTIAL FETCH
// ============================================================================

async function getCredentials(
  supabase: any,
  ownerCredentialId: string
): Promise<HostfullyCredentials | null> {
  const { data, error } = await supabase
    .from("owner_pms_credentials")
    .select("api_key, environment")
    .eq("id", ownerCredentialId)
    .eq("is_active", true)
    .maybeSingle();

  if (error || !data || !data.api_key) {
    console.error("[Orchestrator] Failed to fetch credentials:", error);
    return null;
  }

  return {
    api_key: data.api_key,
    environment: (data.environment as "production" | "sandbox") || "production",
    owner_credential_id: ownerCredentialId,
  };
}

// ============================================================================
// MAIN ORCHESTRATOR
// ============================================================================

/**
 * Execute full property ingestion
 * 
 * @param propertyUid - Hostfully property UID (unit UID for rooms)
 * @param rolPropertyId - Existing ROL property ID to populate
 * @param ownerCredentialId - Owner's PMS credential ID
 * @param supabase - Supabase client
 */
export async function executeFullIngestion(
  propertyUid: string,
  rolPropertyId: string,
  ownerCredentialId: string,
  supabase: any
): Promise<AdapterResponse<IngestionResult | null>> {
  const ACTION = "full_ingest_property";
  
  console.log(`[Orchestrator] Starting ingestion for property ${propertyUid} -> ROL ${rolPropertyId}`);
  
  // 1. Get credentials
  const creds = await getCredentials(supabase, ownerCredentialId);
  if (!creds) {
    return createErrorResponse(
      "AUTH_FAILED",
      "Failed to retrieve owner credentials",
      ACTION
    );
  }
  
  // 2. Initialize context
  const ctx: IngestionContext = {
    propertyUid,
    rolPropertyId,
    ownerCredentialId,
    property: null,
    descriptions: null,
    rules: null,
    amenities: null,
    photos: null,
    rooms: null,
    fees: null,
    pricingPeriods: null,
    isMultiUnit: false,
    errors: [],
    warnings: [],
    phasesCompleted: [],
  };
  
  try {
    // 3. Phase 1: Fetch property core (required to detect multi-unit)
    console.log("[Orchestrator] Phase 1: Fetching property core...");
    const propertyResult = await fetchProperty(propertyUid, creds);
    
    if (!propertyResult.success || !propertyResult.data) {
      return createErrorResponse(
        "NOT_FOUND",
        `Property ${propertyUid} not found: ${propertyResult.error}`,
        ACTION
      );
    }
    
    ctx.property = propertyResult.data;
    ctx.isMultiUnit = detectMultiUnit(propertyResult.data);
    ctx.phasesCompleted.push("core");
    
    console.log(`[Orchestrator] Property fetched. Multi-unit: ${ctx.isMultiUnit}`);
    
    // 4. Phase 2: Parallel fetch (descriptions, rules, amenities, photos)
    console.log("[Orchestrator] Phase 2: Parallel fetch (4 calls)...");
    
    const [descriptionsResult, rulesResult, amenitiesResult, photosResult] = await Promise.all([
      fetchDescriptions(propertyUid, creds),
      fetchRules(propertyUid, creds),
      fetchAvailableAmenities(creds),
      fetchPhotos(propertyUid, creds),
    ]);
    
    if (descriptionsResult.success) {
      ctx.descriptions = descriptionsResult.data;
      ctx.phasesCompleted.push("descriptions");
    } else {
      ctx.warnings.push(`Descriptions: ${descriptionsResult.error}`);
    }
    
    if (rulesResult.success) {
      ctx.rules = rulesResult.data;
      ctx.phasesCompleted.push("rules");
    } else {
      ctx.warnings.push(`Rules: ${rulesResult.error}`);
    }
    
    if (amenitiesResult.success) {
      ctx.amenities = amenitiesResult.data;
      ctx.phasesCompleted.push("amenities");
    } else {
      ctx.warnings.push(`Amenities: ${amenitiesResult.error}`);
    }
    
    if (photosResult.success) {
      ctx.photos = photosResult.data;
      ctx.phasesCompleted.push("media");
    } else {
      ctx.warnings.push(`Photos: ${photosResult.error}`);
    }
    
    // 5. Phase 3: Fetch rooms (based on multi-unit detection)
    console.log(`[Orchestrator] Phase 3: Fetching rooms (multi-unit: ${ctx.isMultiUnit})...`);
    
    const roomsResult = ctx.isMultiUnit
      ? await fetchMultiUnits(propertyUid, creds)
      : await fetchRooms(propertyUid, creds);
    
    if (roomsResult.success) {
      ctx.rooms = roomsResult.data;
      ctx.phasesCompleted.push("rooms");
    } else {
      ctx.warnings.push(`Rooms: ${roomsResult.error}`);
    }
    
    // Phase 3.5: Create synthetic room for standalone properties without rooms
    if (!ctx.isMultiUnit && (!ctx.rooms || ctx.rooms.length === 0)) {
      console.log("[Orchestrator] Standalone property - creating synthetic room from property data");
      
      if (ctx.property) {
        const prop = ctx.property;
        ctx.rooms = [{
          uid: ctx.propertyUid,
          name: prop.name || "Full Property",
          description: ctx.descriptions?.description || (prop as any).description || undefined,
          maxGuests: (prop as any).availability?.maxGuests || (prop as any).maxGuests,
          bedrooms: prop.bedrooms,
          bathrooms: prop.bathrooms,
          beds: prop.beds,
        }];
        ctx.phasesCompleted.push("synthetic-room");
      }
    }
    
    // 6. Phase 4: Parallel fetch (fees, pricing periods)
    console.log("[Orchestrator] Phase 4: Parallel fetch (fees, seasons)...");
    
    const [feesResult, pricingResult] = await Promise.all([
      fetchFees(propertyUid, creds),
      fetchPricingPeriods(propertyUid, creds),
    ]);
    
    if (feesResult.success) {
      ctx.fees = feesResult.data;
      ctx.phasesCompleted.push("fees");
    } else {
      ctx.warnings.push(`Fees: ${feesResult.error}`);
    }
    
    if (pricingResult.success) {
      ctx.pricingPeriods = pricingResult.data;
      ctx.phasesCompleted.push("seasons");
    } else {
      ctx.warnings.push(`Pricing periods: ${pricingResult.error}`);
    }
    
    // 7. Transform all 68 fields
    console.log("[Orchestrator] Transforming data (68 fields)...");
    const transformed = transformFullIngestion(ctx);
    
    // 8. Single atomic write
    console.log("[Orchestrator] Writing to database...");
    const writeResult = await writeIngestion(
      transformed,
      rolPropertyId,
      ownerCredentialId,
      supabase
    );
    
    if (!writeResult.success) {
      return createErrorResponse(
        "INTERNAL_ADAPTER_ERROR",
        writeResult.error || "Database write failed",
        ACTION
      );
    }
    
    // 9. Return success
    const result: IngestionResult = {
      property_id: rolPropertyId,
      fields_written: transformed.lockedFieldNames.length + 
                      (transformed.rooms.length * transformed.roomLockedFields.length),
      rooms_processed: transformed.rooms.length,
      locked_fields: true,
      phases_completed: ctx.phasesCompleted,
      warnings: ctx.warnings.length > 0 ? ctx.warnings : undefined,
    };
    
    console.log(`[Orchestrator] Ingestion complete:`, result);
    
    return createSuccessResponse(result, ACTION);
    
  } catch (err) {
    console.error("[Orchestrator] Unhandled error:", err);
    return createErrorResponse(
      "INTERNAL_ADAPTER_ERROR",
      err instanceof Error ? err.message : String(err),
      ACTION,
      err
    );
  }
}
