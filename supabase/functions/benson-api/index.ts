import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Benson API Base URLs (defaults)
const BENSON_STAGING_URL = "https://staging-api.bensonsoftware.com/api/v3/integrations";
const BENSON_PRODUCTION_URL = "https://api.bensonsoftware.com/api/v3/integrations";

interface BensonCredentials {
  username: string;
  password: string;
  environment: "staging" | "production";
  baseUrl?: string; // Custom URL override
}

interface PropertyInfo {
  id: string;
  benson_property_code: string;
}

// Helper to get base64 encoded auth header (handles special characters)
const getAuthHeader = (username: string, password: string): string => {
  const credentialString = `${username}:${password}`;
  console.log(`Auth credential string length: ${credentialString.length}`);
  console.log(`Username: ${username}`);
  console.log(`Password (first 3 chars): ${password.substring(0, 3)}...`);
  
  // Use TextEncoder to properly handle special characters
  const encoder = new TextEncoder();
  const data = encoder.encode(credentialString);
  // Convert to base64 using Uint8Array
  let binary = '';
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]);
  }
  const credentials = btoa(binary);
  console.log(`Base64 auth (first 20 chars): ${credentials.substring(0, 20)}...`);
  return `Basic ${credentials}`;
};

// Helper to get the correct base URL
const getBaseUrl = (creds: BensonCredentials, propertyCode: string): string => {
  // Use custom URL if provided, otherwise use default based on environment
  const baseUrl = creds.baseUrl || (creds.environment === "production" ? BENSON_PRODUCTION_URL : BENSON_STAGING_URL);
  return `${baseUrl}/${propertyCode}`;
};

// Fetch availability from Benson
async function fetchAvailability(
  creds: BensonCredentials,
  propertyCode: string,
  startDate: string,
  endDate: string,
  roomTypeIds?: number[],
  rateTypeIds?: number[]
): Promise<any> {
  const baseUrl = getBaseUrl(creds, propertyCode);
  let url = `${baseUrl}/availability?startdate=${startDate}&enddate=${endDate}`;
  
  if (roomTypeIds?.length) {
    roomTypeIds.forEach(id => url += `&roomtypeid=${id}`);
  }
  if (rateTypeIds?.length) {
    rateTypeIds.forEach(id => url += `&ratetypeid=${id}`);
  }

  console.log(`Fetching availability from: ${url}`);
  
  const response = await fetch(url, {
    headers: {
      "Authorization": getAuthHeader(creds.username, creds.password),
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Benson API error: ${response.status} - ${errorText}`);
    throw new Error(`Benson API error: ${response.status} - ${errorText}`);
  }

  return response.json();
}

// Create reservation in Benson
async function createReservation(
  creds: BensonCredentials,
  propertyCode: string,
  reservationData: {
    arrivalDate: string;
    departureDate: string;
    rateTypeId: number;
    contactName: string;
    contactNumber: string;
    contactEmail: string;
    voucher?: string;
    note?: string;
    rooms: Array<{
      roomTypeId: number;
      numberOfAdults: number;
      numberOfTeens: number;
      numberOfChildren: number;
      numberOfInfants: number;
    }>;
  }
): Promise<any> {
  const baseUrl = getBaseUrl(creds, propertyCode);
  const url = `${baseUrl}/reservations`;

  console.log(`Creating reservation at: ${url}`);
  console.log(`Reservation data:`, JSON.stringify(reservationData, null, 2));

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": getAuthHeader(creds.username, creds.password),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(reservationData),
  });

  const data = await response.json();
  
  if (!response.ok) {
    console.error(`Benson API error: ${response.status}`, data);
    throw new Error(`Benson API error: ${response.status} - ${JSON.stringify(data)}`);
  }

  return data;
}

// Get reservations from Benson
async function getReservations(
  creds: BensonCredentials,
  propertyCode: string,
  startDate: string,
  endDate: string,
  statuses: string[]
): Promise<any> {
  const baseUrl = getBaseUrl(creds, propertyCode);
  let url = `${baseUrl}/reservations?startDate=${startDate}&endDate=${endDate}`;
  
  statuses.forEach(status => url += `&status=${status}`);

  console.log(`Fetching reservations from: ${url}`);

  const response = await fetch(url, {
    headers: {
      "Authorization": getAuthHeader(creds.username, creds.password),
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Benson API error: ${response.status} - ${errorText}`);
    throw new Error(`Benson API error: ${response.status} - ${errorText}`);
  }

  return response.json();
}

// Get charge types from Benson
async function getChargeTypes(creds: BensonCredentials, propertyCode: string): Promise<any> {
  const baseUrl = getBaseUrl(creds, propertyCode);
  const url = `${baseUrl}/chargetypes`;

  console.log(`Fetching charge types from: ${url}`);

  const response = await fetch(url, {
    headers: {
      "Authorization": getAuthHeader(creds.username, creds.password),
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Benson API error: ${response.status} - ${errorText}`);
    throw new Error(`Benson API error: ${response.status} - ${errorText}`);
  }

  return response.json();
}

// Get payment types from Benson
async function getPaymentTypes(creds: BensonCredentials, propertyCode: string): Promise<any> {
  const baseUrl = getBaseUrl(creds, propertyCode);
  const url = `${baseUrl}/paymenttypes`;

  console.log(`Fetching payment types from: ${url}`);

  const response = await fetch(url, {
    headers: {
      "Authorization": getAuthHeader(creds.username, creds.password),
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Benson API error: ${response.status} - ${errorText}`);
    throw new Error(`Benson API error: ${response.status} - ${errorText}`);
  }

  return response.json();
}

// Get current rooms from Benson
async function getCurrentRooms(creds: BensonCredentials, propertyCode: string): Promise<any> {
  const baseUrl = getBaseUrl(creds, propertyCode);
  const url = `${baseUrl}/currentrooms`;

  console.log(`Fetching current rooms from: ${url}`);

  const response = await fetch(url, {
    headers: {
      "Authorization": getAuthHeader(creds.username, creds.password),
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Benson API error: ${response.status} - ${errorText}`);
    throw new Error(`Benson API error: ${response.status} - ${errorText}`);
  }

  return response.json();
}

// Get client default invoices from Benson
async function getClientDefaultInvoices(creds: BensonCredentials, propertyCode: string): Promise<any> {
  const baseUrl = getBaseUrl(creds, propertyCode);
  const url = `${baseUrl}/clientdefaultinvoices`;

  console.log(`Fetching client default invoices from: ${url}`);

  const response = await fetch(url, {
    headers: {
      "Authorization": getAuthHeader(creds.username, creds.password),
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Benson API error: ${response.status} - ${errorText}`);
    throw new Error(`Benson API error: ${response.status} - ${errorText}`);
  }

  return response.json();
}

// Post bill to Benson
async function postBill(
  creds: BensonCredentials,
  propertyCode: string,
  billData: {
    roomId?: number;
    reservationId?: number;
    clientId?: number;
    sourceReference: string;
    charges?: Array<{ chargeTypeId: number; amount: number }>;
    payments?: Array<{ paymentTypeId: number; amount: number }>;
  }
): Promise<any> {
  const baseUrl = getBaseUrl(creds, propertyCode);
  const url = `${baseUrl}/bill`;

  console.log(`Posting bill to: ${url}`);
  console.log(`Bill data:`, JSON.stringify(billData, null, 2));

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": getAuthHeader(creds.username, creds.password),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(billData),
  });

  const data = await response.json();
  
  if (!response.ok) {
    console.error(`Benson API error: ${response.status}`, data);
    throw new Error(`Benson API error: ${response.status} - ${JSON.stringify(data)}`);
  }

  return data;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { action, property_id, ...params } = body;

    console.log(`Benson API action: ${action}, property_id: ${property_id}`);

    // Get active environment setting
    const { data: envSetting } = await supabase
      .from("api_keys")
      .select("key_value")
      .eq("key_name", "BENSON_ACTIVE_ENVIRONMENT")
      .maybeSingle();

    const activeEnvironment = envSetting?.key_value || "staging";
    console.log(`Using Benson ${activeEnvironment} environment`);

    // Get Benson credentials for the active environment
    const { data: credentials, error: credError } = await supabase
      .from("pms_credentials")
      .select("*")
      .eq("system_type", "benson")
      .eq("environment", activeEnvironment)
      .maybeSingle();

    if (credError || !credentials) {
      console.error("Benson credentials not found:", credError);
      return new Response(
        JSON.stringify({ error: `Benson ${activeEnvironment} credentials not configured` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!credentials.username || !credentials.password) {
      return new Response(
        JSON.stringify({ error: `Benson ${activeEnvironment} username/password not configured` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const creds: BensonCredentials = {
      username: credentials.username,
      password: credentials.password,
      environment: credentials.environment as "staging" | "production",
      baseUrl: credentials.base_url || undefined,
    };

    // Get property info
    const { data: property, error: propError } = await supabase
      .from("properties")
      .select("id, benson_property_code")
      .eq("id", property_id)
      .single();

    if (propError || !property) {
      console.error("Property not found:", propError);
      return new Response(
        JSON.stringify({ error: "Property not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!property.benson_property_code) {
      return new Response(
        JSON.stringify({ error: "Benson property code not configured for this property" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const propertyCode = property.benson_property_code;
    let result: any;

    switch (action) {
      case "test_connection": {
        // Simple test to verify credentials work
        const baseUrl = creds.baseUrl || (creds.environment === "production" ? BENSON_PRODUCTION_URL : BENSON_STAGING_URL);
        const testUrl = `${baseUrl}/${propertyCode}/roomtypes`;
        
        console.log(`Testing connection to: ${testUrl}`);
        console.log(`Username: ${creds.username}`);
        console.log(`Password length: ${creds.password.length}`);
        console.log(`Environment: ${creds.environment}`);
        
        // Log the auth header (masked)
        const authHeader = getAuthHeader(creds.username, creds.password);
        console.log(`Auth header prefix: ${authHeader.substring(0, 15)}...`);
        
        const testResponse = await fetch(testUrl, {
          headers: {
            "Authorization": authHeader,
            "Content-Type": "application/json",
          },
        });
        
        console.log(`Test response status: ${testResponse.status}`);
        
        if (!testResponse.ok) {
          const errorText = await testResponse.text();
          console.error(`Test failed: ${testResponse.status} - ${errorText}`);
          return new Response(
            JSON.stringify({ 
              success: false, 
              status: testResponse.status,
              error: errorText || "Authentication failed",
              url: testUrl,
              username: creds.username,
              environment: creds.environment
            }),
            { status: testResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        const testData = await testResponse.json();
        result = { 
          success: true, 
          message: "Connection successful",
          roomTypesCount: Array.isArray(testData) ? testData.length : 0,
          data: testData
        };
        break;
      }

      case "fetch_availability":
        result = await fetchAvailability(
          creds,
          propertyCode,
          params.start_date,
          params.end_date,
          params.room_type_ids,
          params.rate_type_ids
        );
        
        // Cache the availability data
        if (result.roomTypes) {
          for (const roomType of result.roomTypes) {
            if (roomType.roomsAvailablePerNight) {
              for (const availability of roomType.roomsAvailablePerNight) {
                await supabase.from("pms_availability_cache").upsert({
                  property_id: property_id,
                  system_type: "benson",
                  external_room_type_id: roomType.roomTypeId.toString(),
                  date: availability.date,
                  available_units: availability.numberOfRoomsAvailable,
                  restrictions: availability.blockedRooms || [],
                  raw_data: availability,
                  fetched_at: new Date().toISOString(),
                }, {
                  onConflict: "property_id,system_type,external_room_type_id,date"
                });
              }
            }
            
            // Cache rate data
            if (roomType.rateTypes) {
              for (const rateType of roomType.rateTypes) {
                if (rateType.rates) {
                  for (const rate of rateType.rates) {
                    await supabase.from("pms_availability_cache").upsert({
                      property_id: property_id,
                      system_type: "benson",
                      external_room_type_id: roomType.roomTypeId.toString(),
                      date: rate.date,
                      rates: {
                        rate_type_id: rateType.rateTypeId,
                        rate_type_name: rateType.name,
                        price_type: rateType.priceType,
                        room_amount: rate.roomAmount,
                        adult_amounts: Object.entries(rate)
                          .filter(([k]) => k.startsWith("adultAmount"))
                          .reduce((acc, [k, v]) => ({ ...acc, [k]: v }), {}),
                        teen_amount: rate.teenAmount,
                        child_amount: rate.childAmount,
                        infant_amount: rate.infantAmount,
                      },
                      fetched_at: new Date().toISOString(),
                    }, {
                      onConflict: "property_id,system_type,external_room_type_id,date"
                    });
                  }
                }
              }
            }
          }
        }
        break;

      case "create_reservation":
        result = await createReservation(creds, propertyCode, params.reservation);
        
        // Store the reservation in our database
        if (result.id) {
          await supabase.from("pms_reservations").upsert({
            property_id: property_id,
            system_type: "benson",
            external_reservation_id: result.id.toString(),
            status: result.status,
            arrival_date: result.arrivalDate,
            departure_date: result.departureDate,
            contact_name: result.contactName,
            contact_email: result.contactEmail,
            contact_phone: result.contactNumber,
            rate_type_name: result.rateTypeName,
            rooms: result.reservationRooms || [],
            guests: result.guests || [],
            charges: result.charges || [],
            payments: result.payments || [],
            raw_data: result,
            synced_at: new Date().toISOString(),
          }, {
            onConflict: "property_id,system_type,external_reservation_id"
          });
        }
        break;

      case "get_reservations":
        result = await getReservations(
          creds,
          propertyCode,
          params.start_date,
          params.end_date,
          params.statuses || ["PROVISIONAL", "CONFIRMED", "GUARANTEED", "CHECKED-IN"]
        );
        
        // Sync reservations to our database
        if (Array.isArray(result)) {
          for (const res of result) {
            await supabase.from("pms_reservations").upsert({
              property_id: property_id,
              system_type: "benson",
              external_reservation_id: res.id.toString(),
              status: res.status,
              arrival_date: res.arrivalDate,
              departure_date: res.departureDate,
              contact_name: res.contactName,
              contact_email: res.contactEmail,
              contact_phone: res.contactNumber,
              rate_type_name: res.rateTypeName,
              rooms: res.reservationRooms || [],
              guests: res.guests || [],
              charges: res.charges || [],
              payments: res.payments || [],
              raw_data: res,
              synced_at: new Date().toISOString(),
            }, {
              onConflict: "property_id,system_type,external_reservation_id"
            });
          }
        }
        break;

      case "fetch_types":
        // Fetch all types in parallel
        const [chargeTypes, paymentTypes] = await Promise.all([
          getChargeTypes(creds, propertyCode),
          getPaymentTypes(creds, propertyCode),
        ]);
        
        // Also fetch availability to get room types and rate types
        const today = new Date();
        const thirtyDaysLater = new Date(today);
        thirtyDaysLater.setDate(today.getDate() + 30);
        
        const availabilityData = await fetchAvailability(
          creds,
          propertyCode,
          today.toISOString().split("T")[0],
          thirtyDaysLater.toISOString().split("T")[0]
        );
        
        const roomTypes: { id: number; name: string }[] = [];
        const rateTypes: { id: number; name: string }[] = [];
        
        if (availabilityData.roomTypes) {
          for (const rt of availabilityData.roomTypes) {
            roomTypes.push({ id: rt.roomTypeId, name: rt.name });
            if (rt.rateTypes) {
              for (const rate of rt.rateTypes) {
                if (!rateTypes.find(r => r.id === rate.rateTypeId)) {
                  rateTypes.push({ id: rate.rateTypeId, name: rate.name });
                }
              }
            }
          }
        }
        
        result = {
          chargeTypes,
          paymentTypes,
          roomTypes,
          rateTypes,
        };
        break;

      case "get_current_rooms":
        result = await getCurrentRooms(creds, propertyCode);
        break;

      case "get_client_invoices":
        result = await getClientDefaultInvoices(creds, propertyCode);
        break;

      case "post_bill":
        result = await postBill(creds, propertyCode, params.bill);
        break;

      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    // Log the sync operation
    await supabase.from("sync_logs").insert({
      property_id: property_id,
      external_system: "benson",
      sync_type: action,
      status: "success",
      message: `Successfully executed ${action}`,
      request_data: body,
      response_data: typeof result === "object" ? result : { result },
    });

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Benson API error:", error);
    
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      
      await supabase.from("sync_logs").insert({
        external_system: "benson",
        sync_type: "error",
        status: "error",
        message: error.message,
      });
    } catch (logError) {
      console.error("Failed to log error:", logError);
    }

    // Parse error message for user-friendly response
    const errorMsg = error.message || "";
    let userMessage = "An error occurred processing your request";
    let statusCode = 500;

    if (errorMsg.includes("401")) {
      userMessage = "Authentication failed. Please verify your Benson username and password in API Keys settings.";
      statusCode = 401;
    } else if (errorMsg.includes("404")) {
      userMessage = "Benson API endpoint not found. Please verify the property code and API URL are correct.";
      statusCode = 404;
    } else if (errorMsg.includes("403")) {
      userMessage = "Access denied. Your Benson account may not have API access enabled.";
      statusCode = 403;
    }

    return new Response(
      JSON.stringify({ error: userMessage }),
      { status: statusCode, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});