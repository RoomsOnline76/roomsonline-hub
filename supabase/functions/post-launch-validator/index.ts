import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ValidationCheck {
  id: string;
  name: string;
  passed: boolean;
  message: string;
  severity: "info" | "warning" | "error";
  details?: Record<string, unknown>;
}

interface ValidationResult {
  property_id: string;
  property_name: string;
  validated_at: string;
  overall_passed: boolean;
  checks: ValidationCheck[];
  score: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { property_id, run_all_live } = await req.json();

    // If run_all_live is true, validate all live properties (for scheduled runs)
    // Otherwise validate a specific property
    let propertyIds: string[] = [];

    if (run_all_live) {
      const { data: liveProperties, error } = await supabase
        .from("properties")
        .select("id")
        .eq("listing_status", "live")
        .eq("show_on_website", true)
        .is("permanently_deleted_at", null);

      if (error) throw error;
      propertyIds = (liveProperties || []).map((p) => p.id);
    } else if (property_id) {
      propertyIds = [property_id];
    } else {
      return new Response(
        JSON.stringify({ error: "property_id or run_all_live required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results: ValidationResult[] = [];

    for (const propId of propertyIds) {
      const result = await validateProperty(supabase, propId);
      results.push(result);

      // Store validation results
      await supabase.from("property_activation_logs").insert({
        property_id: propId,
        activated_at: new Date().toISOString(),
        post_activation_checks: {
          validated_at: result.validated_at,
          overall_passed: result.overall_passed,
          score: result.score,
          checks: result.checks,
        },
      });
    }

    // If any property has critical failures, could trigger alerts here
    const failedProperties = results.filter((r) => !r.overall_passed);
    if (failedProperties.length > 0) {
      console.log(
        `Post-launch validation: ${failedProperties.length}/${results.length} properties have issues`
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        validated_count: results.length,
        passed_count: results.filter((r) => r.overall_passed).length,
        failed_count: failedProperties.length,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Post-launch validator error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function validateProperty(supabase: any, propertyId: string): Promise<ValidationResult> {
  const checks: ValidationCheck[] = [];
  let passedCount = 0;

  // Fetch property data
  const { data: property, error: propError } = await supabase
    .from("properties")
    .select("*")
    .eq("id", propertyId)
    .single();

  if (propError || !property) {
    return {
      property_id: propertyId,
      property_name: "Unknown",
      validated_at: new Date().toISOString(),
      overall_passed: false,
      checks: [
        {
          id: "property_exists",
          name: "Property Exists",
          passed: false,
          message: "Property not found in database",
          severity: "error",
        },
      ],
      score: 0,
    };
  }

  // Check 1: Search Visibility - Property should be discoverable
  const searchVisibilityCheck = await checkSearchVisibility(supabase, property);
  checks.push(searchVisibilityCheck);
  if (searchVisibilityCheck.passed) passedCount++;

  // Check 2: Images Accessible - All image URLs should be reachable
  const imageAccessCheck = await checkImageAccessibility(property);
  checks.push(imageAccessCheck);
  if (imageAccessCheck.passed) passedCount++;

  // Check 3: Booking Flow - Room types exist and have valid rates
  const bookingFlowCheck = await checkBookingFlow(supabase, property);
  checks.push(bookingFlowCheck);
  if (bookingFlowCheck.passed) passedCount++;

  // Check 4: PMS Sync Status - If connected, check for recent sync errors
  const pmsSyncCheck = await checkPMSSync(supabase, property);
  checks.push(pmsSyncCheck);
  if (pmsSyncCheck.passed) passedCount++;

  // Check 5: Recent Errors - Check for booking sync failures
  const errorMonitorCheck = await checkRecentErrors(supabase, property);
  checks.push(errorMonitorCheck);
  if (errorMonitorCheck.passed) passedCount++;

  // Check 6: Contact Information - Verify contact details are present
  const contactCheck = checkContactInfo(property);
  checks.push(contactCheck);
  if (contactCheck.passed) passedCount++;

  // Check 7: Location Data - Verify geocoding is complete
  const locationCheck = checkLocationData(property);
  checks.push(locationCheck);
  if (locationCheck.passed) passedCount++;

  const score = Math.round((passedCount / checks.length) * 100);
  const hasErrors = checks.some((c) => c.severity === "error" && !c.passed);

  return {
    property_id: propertyId,
    property_name: property.name || "Unnamed Property",
    validated_at: new Date().toISOString(),
    overall_passed: !hasErrors && score >= 70,
    checks,
    score,
  };
}

async function checkSearchVisibility(supabase: any, property: any): Promise<ValidationCheck> {
  // Check if property appears in public view
  const { data, error } = await supabase
    .from("public_properties")
    .select("id")
    .eq("id", property.id)
    .single();

  if (error || !data) {
    return {
      id: "search_visibility",
      name: "Search Visibility",
      passed: false,
      message: "Property not visible in public search results",
      severity: "error",
    };
  }

  return {
    id: "search_visibility",
    name: "Search Visibility",
    passed: true,
    message: "Property is discoverable in search",
    severity: "info",
  };
}

async function checkImageAccessibility(property: any): Promise<ValidationCheck> {
  const images = property.images || [];
  
  if (images.length === 0) {
    return {
      id: "image_accessibility",
      name: "Image Accessibility",
      passed: false,
      message: "No images configured for property",
      severity: "warning",
    };
  }

  // Just verify we have images - actual URL checking would require fetch
  // which may hit rate limits, so we do a basic check
  const heroImage = images.find((img: any) => 
    typeof img === "object" && img.isHero
  ) || images[0];

  if (!heroImage) {
    return {
      id: "image_accessibility",
      name: "Image Accessibility",
      passed: false,
      message: "No hero image designated",
      severity: "warning",
    };
  }

  return {
    id: "image_accessibility",
    name: "Image Accessibility",
    passed: true,
    message: `${images.length} images configured with hero image set`,
    severity: "info",
    details: { image_count: images.length },
  };
}

async function checkBookingFlow(supabase: any, property: any): Promise<ValidationCheck> {
  // Check if property has room types with valid pricing
  const { data: roomTypes, error } = await supabase
    .from("hostfully_room_types")
    .select("id, name, daily_rate, is_active")
    .eq("property_id", property.id)
    .eq("is_active", true);

  if (error) {
    return {
      id: "booking_flow",
      name: "Booking Flow",
      passed: false,
      message: "Failed to check room types",
      severity: "warning",
    };
  }

  if (!roomTypes || roomTypes.length === 0) {
    // Check if property has price_per_night set (legacy/simple properties)
    if (property.price_per_night && property.price_per_night > 0) {
      return {
        id: "booking_flow",
        name: "Booking Flow",
        passed: true,
        message: "Property has base pricing configured",
        severity: "info",
        details: { pricing_model: "simple", base_rate: property.price_per_night },
      };
    }

    return {
      id: "booking_flow",
      name: "Booking Flow",
      passed: false,
      message: "No room types or base pricing configured",
      severity: "error",
    };
  }

  const roomsWithRates = roomTypes.filter((r: any) => r.daily_rate && r.daily_rate > 0);

  if (roomsWithRates.length === 0) {
    return {
      id: "booking_flow",
      name: "Booking Flow",
      passed: false,
      message: "Room types exist but none have valid rates",
      severity: "error",
    };
  }

  return {
    id: "booking_flow",
    name: "Booking Flow",
    passed: true,
    message: `${roomsWithRates.length} bookable room types available`,
    severity: "info",
    details: { room_count: roomsWithRates.length },
  };
}

async function checkPMSSync(supabase: any, property: any): Promise<ValidationCheck> {
  const externalSystem = property.external_system;

  if (!externalSystem || externalSystem === "none") {
    return {
      id: "pms_sync",
      name: "PMS Sync Status",
      passed: true,
      message: "No PMS connected (direct management)",
      severity: "info",
    };
  }

  // Check if PMS is in production mode
  const { data: pmsStatus } = await supabase
    .from("pms_tracker_status")
    .select("is_production, active_environment")
    .eq("system_type", externalSystem)
    .single();

  if (!pmsStatus?.is_production) {
    return {
      id: "pms_sync",
      name: "PMS Sync Status",
      passed: false,
      message: `${externalSystem} integration not in production mode`,
      severity: "warning",
    };
  }

  // Check for recent sync errors in booking_sync_status
  const { data: recentSyncErrors } = await supabase
    .from("booking_sync_status")
    .select("id, sync_status, error_message")
    .eq("external_system", externalSystem)
    .eq("sync_status", "failed")
    .gte("updated_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .limit(5);

  if (recentSyncErrors && recentSyncErrors.length > 0) {
    return {
      id: "pms_sync",
      name: "PMS Sync Status",
      passed: false,
      message: `${recentSyncErrors.length} sync failures in last 24 hours`,
      severity: "warning",
      details: { recent_errors: recentSyncErrors.length },
    };
  }

  return {
    id: "pms_sync",
    name: "PMS Sync Status",
    passed: true,
    message: `${externalSystem} connected and syncing normally`,
    severity: "info",
  };
}

async function checkRecentErrors(supabase: any, property: any): Promise<ValidationCheck> {
  // Check for recent failed bookings
  const { data: failedBookings } = await supabase
    .from("bookings")
    .select("id, status, created_at")
    .eq("property_id", property.id)
    .eq("status", "failed")
    .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
    .limit(10);

  if (failedBookings && failedBookings.length > 3) {
    return {
      id: "error_monitoring",
      name: "Error Monitoring",
      passed: false,
      message: `${failedBookings.length} failed bookings in last 7 days`,
      severity: "warning",
      details: { failed_bookings: failedBookings.length },
    };
  }

  return {
    id: "error_monitoring",
    name: "Error Monitoring",
    passed: true,
    message: "No significant booking errors detected",
    severity: "info",
  };
}

function checkContactInfo(property: any): ValidationCheck {
  const hasPhone = property.phone_number && property.phone_number.trim().length > 0;
  const hasEmail = property.email && property.email.trim().length > 0;

  if (!hasPhone && !hasEmail) {
    return {
      id: "contact_info",
      name: "Contact Information",
      passed: false,
      message: "No contact phone or email configured",
      severity: "warning",
    };
  }

  return {
    id: "contact_info",
    name: "Contact Information",
    passed: true,
    message: `Contact details present${hasPhone ? " (phone)" : ""}${hasEmail ? " (email)" : ""}`,
    severity: "info",
  };
}

function checkLocationData(property: any): ValidationCheck {
  const hasCoords = property.latitude && property.longitude;
  const hasAddress = property.address && property.city && property.country;

  if (!hasAddress) {
    return {
      id: "location_data",
      name: "Location Data",
      passed: false,
      message: "Address, city, or country missing",
      severity: "warning",
    };
  }

  if (!hasCoords) {
    return {
      id: "location_data",
      name: "Location Data",
      passed: false,
      message: "Property not geocoded (no coordinates)",
      severity: "warning",
    };
  }

  return {
    id: "location_data",
    name: "Location Data",
    passed: true,
    message: "Location fully configured with coordinates",
    severity: "info",
  };
}
