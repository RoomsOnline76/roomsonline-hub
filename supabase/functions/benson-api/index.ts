import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Input validation schemas
const baseRequestSchema = z.object({
  action: z.enum([
    "test_connection",
    "fetch_availability",
    "create_reservation",
    "get_reservations",
    "fetch_types",
    "fetch_property_data",
    "get_current_rooms",
    "get_client_invoices",
    "post_bill"
  ]),
  property_id: z.string().uuid({ message: "Invalid property ID format" }),
});

const fetchAvailabilitySchema = baseRequestSchema.extend({
  action: z.literal("fetch_availability"),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Start date must be YYYY-MM-DD format" }),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: "End date must be YYYY-MM-DD format" }),
  room_type_ids: z.array(z.number()).optional(),
  rate_type_ids: z.array(z.number()).optional(),
});

const getReservationsSchema = baseRequestSchema.extend({
  action: z.literal("get_reservations"),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Start date must be YYYY-MM-DD format" }),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: "End date must be YYYY-MM-DD format" }),
  statuses: z.array(z.string()).optional(),
});

const createReservationSchema = baseRequestSchema.extend({
  action: z.literal("create_reservation"),
  reservation_data: z.object({
    arrivalDate: z.string(),
    departureDate: z.string(),
    rateTypeId: z.number(),
    contactName: z.string().min(1),
    contactNumber: z.string(),
    contactEmail: z.string().email(),
    voucher: z.string().optional(),
    note: z.string().optional(),
    rooms: z.array(z.object({
      roomTypeId: z.number(),
      numberOfAdults: z.number().min(0),
      numberOfTeens: z.number().min(0),
      numberOfChildren: z.number().min(0),
      numberOfInfants: z.number().min(0),
    })),
  }),
});

const postBillSchema = baseRequestSchema.extend({
  action: z.literal("post_bill"),
  bill_data: z.object({
    roomId: z.number().optional(),
    reservationId: z.number().optional(),
    clientId: z.number().optional(),
    sourceReference: z.string(),
    charges: z.array(z.object({
      chargeTypeId: z.number(),
      amount: z.number(),
    })).optional(),
    payments: z.array(z.object({
      paymentTypeId: z.number(),
      amount: z.number(),
    })).optional(),
  }),
});

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
  // Use TextEncoder to properly handle special characters
  const encoder = new TextEncoder();
  const data = encoder.encode(`${username}:${password}`);
  // Convert to base64 using Uint8Array
  let binary = '';
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]);
  }
  const credentials = btoa(binary);
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

  console.log(`Availability response status: ${response.status}`);
  
  const responseText = await response.text();
  console.log(`Availability raw response (first 1000 chars): ${responseText.substring(0, 1000)}`);

  if (!response.ok) {
    console.error(`Benson API error: ${response.status} - ${responseText}`);
    throw new Error(`Benson API error: ${response.status} - ${responseText}`);
  }

  try {
    const data = JSON.parse(responseText);
    console.log(`Parsed availability data keys: ${Object.keys(data).join(', ')}`);
    return data;
  } catch (e) {
    console.error(`Failed to parse availability response as JSON:`, e);
    throw new Error(`Invalid JSON response from Benson API`);
  }
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
  // Use lowercase query params as per Benson API docs
  let url = `${baseUrl}/reservations?startdate=${startDate}&enddate=${endDate}`;
  
  // Add status filters - use lowercase 'status' param
  statuses.forEach(status => url += `&status=${status}`);

  console.log(`Fetching reservations from: ${url}`);

  const response = await fetch(url, {
    headers: {
      "Authorization": getAuthHeader(creds.username, creds.password),
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Benson API error: ${response.status} - ${errorText}`);
    throw new Error(`Benson API error: ${response.status} - ${errorText}`);
  }

  return response.json();
}

// Get room types from Benson (Room Information)
async function getRoomTypes(creds: BensonCredentials, propertyCode: string): Promise<any> {
  const baseUrl = getBaseUrl(creds, propertyCode);
  const url = `${baseUrl}/roomtypes`;

  console.log(`Fetching room types from: ${url}`);

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

// Get rate types from Benson (Rate Info dropdown)
async function getRateTypes(creds: BensonCredentials, propertyCode: string): Promise<any> {
  const baseUrl = getBaseUrl(creds, propertyCode);
  const url = `${baseUrl}/ratetypes`;

  console.log(`Fetching rate types from: ${url}`);

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

// Get rates from Benson (Rate Breakdown)
async function getRates(
  creds: BensonCredentials, 
  propertyCode: string,
  startDate: string,
  endDate: string
): Promise<any> {
  const baseUrl = getBaseUrl(creds, propertyCode);
  const url = `${baseUrl}/rates?startdate=${startDate}&enddate=${endDate}`;

  console.log(`Fetching rates from: ${url}`);

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
    
    // Validate base request structure
    const baseValidation = baseRequestSchema.safeParse(body);
    if (!baseValidation.success) {
      console.error("Validation failed:", baseValidation.error);
      return new Response(
        JSON.stringify({ error: "Invalid request parameters", details: baseValidation.error.issues }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
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
        const rawAvailability = await fetchAvailability(
          creds,
          propertyCode,
          params.start_date,
          params.end_date,
          params.room_type_ids,
          params.rate_type_ids
        );
        
        // Benson returns an array of room types directly - wrap it in expected structure
        const availabilityRoomTypes = Array.isArray(rawAvailability) ? rawAvailability : (rawAvailability?.roomTypes || []);
        result = { roomTypes: availabilityRoomTypes };
        
        console.log(`Benson availability response structure:`, JSON.stringify({
          hasRoomTypes: !!result.roomTypes,
          roomTypesCount: result.roomTypes?.length || 0,
          sampleRoomType: result.roomTypes?.[0] ? {
            roomTypeId: result.roomTypes[0].roomTypeId,
            name: result.roomTypes[0].name,
            hasRatesTypes: !!result.roomTypes[0].rateTypes,
            rateTypesCount: result.roomTypes[0].rateTypes?.length || 0,
          } : null,
        }));
        
        // Cache the availability data
        if (result.roomTypes && result.roomTypes.length > 0) {
          console.log(`Processing ${result.roomTypes.length} room types for caching`);
          for (const roomType of result.roomTypes) {
            console.log(`Room type: ${roomType.roomTypeId} - ${roomType.name}, availPerNight: ${roomType.roomsAvailablePerNight?.length || 0}`);
            if (roomType.roomsAvailablePerNight) {
              for (const availability of roomType.roomsAvailablePerNight) {
                const { error: availError } = await supabase.from("pms_availability_cache").upsert({
                  property_id: property_id,
                  system_type: "benson",
                  external_room_type_id: roomType.roomTypeId.toString(),
                  date: availability.date,
                  available_units: availability.numberOfRoomsAvailable,
                  restrictions: availability.blockedRooms || [],
                  raw_data: {
                    ...availability,
                    roomTypeName: roomType.name,
                    roomTypeId: roomType.roomTypeId,
                  },
                  fetched_at: new Date().toISOString(),
                }, {
                  onConflict: "property_id,system_type,external_room_type_id,date"
                });
                if (availError) {
                  console.error(`Error caching availability for ${roomType.roomTypeId} on ${availability.date}:`, availError);
                }
              }
            }
            
            // Cache rate data - aggregate all rate types per date into an array
            if (roomType.rateTypes) {
              // Group rates by date first
              const ratesByDate = new Map<string, any[]>();
              
              for (const rateType of roomType.rateTypes) {
                if (rateType.rates) {
                  for (const rate of rateType.rates) {
                    const dateStr = rate.date;
                    if (!ratesByDate.has(dateStr)) {
                      ratesByDate.set(dateStr, []);
                    }
                    ratesByDate.get(dateStr)!.push({
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
                    });
                  }
                }
              }
              
              // Now upsert with all rate types per date as an array
              for (const [dateStr, ratesArray] of ratesByDate.entries()) {
                const { error: rateError } = await supabase.from("pms_availability_cache").upsert({
                  property_id: property_id,
                  system_type: "benson",
                  external_room_type_id: roomType.roomTypeId.toString(),
                  date: dateStr,
                  rates: ratesArray, // Store as array instead of single object
                  raw_data: {
                    roomTypeName: roomType.name,
                    roomTypeId: roomType.roomTypeId,
                  },
                  fetched_at: new Date().toISOString(),
                }, {
                  onConflict: "property_id,system_type,external_room_type_id,date"
                });
                if (rateError) {
                  console.error(`Error caching rate for ${roomType.roomTypeId} on ${dateStr}:`, rateError);
                }
              }
            }
          }
        } else {
          console.warn(`No room types found in Benson response. Full response:`, JSON.stringify(result).substring(0, 500));
        }
        break;

      case "create_reservation":
        result = await createReservation(creds, propertyCode, params.reservation_data);
        
        // Store the reservation in our database with full fields
        if (result.id) {
          const totalAmount = result.charges?.reduce((sum: number, charge: any) => {
            return sum + (parseFloat(charge.amount) || 0);
          }, 0) || 0;

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
            total_amount: totalAmount,
            currency: "ZAR",
            rooms: result.reservationRooms || [],
            guests: result.guests || [],
            charges: result.charges || [],
            payments: result.payments || [],
            reservation_name: result.reservationName || null,
            reservation_voucher: result.reservationVoucher || null,
            consultant_name: result.consultantName || null,
            consultant_email: result.consultantEmail || null,
            consultant_contact_number: result.consultantContactNumber || null,
            originating_agent: result.originatingAgent || {},
            responsible_client: result.responsibleClient || {},
            guarantee: result.guarantee || {},
            cancellation: result.cancellation || {},
            number_of_rooms: result.numberOfRooms || null,
            number_of_guests: result.numberOfGuests || null,
            guest_nationality: result.guestNationality || null,
            create_date: result.createDate || null,
            create_user_name: result.createUserName || null,
            is_property_tax_inclusive: result.isPropertyTaxInclusive ?? true,
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
          params.statuses || ["PROVISIONAL", "CONFIRMED", "GUARANTEED", "CHECKED-IN", "CANCELLED"]
        );
        
        // Sync reservations to our database with full Benson API fields
        if (Array.isArray(result)) {
          console.log(`Syncing ${result.length} reservations from Benson`);
          for (const res of result) {
            // Calculate total amount from charges
            const totalAmount = res.charges?.reduce((sum: number, charge: any) => {
              return sum + (parseFloat(charge.amount) || 0);
            }, 0) || 0;

            const { error: upsertError } = await supabase.from("pms_reservations").upsert({
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
              total_amount: totalAmount,
              currency: "ZAR",
              rooms: res.reservationRooms || [],
              guests: res.guests || [],
              charges: res.charges || [],
              payments: res.payments || [],
              // New fields from Benson API docs
              reservation_name: res.reservationName || null,
              reservation_voucher: res.reservationVoucher || null,
              consultant_name: res.consultantName || null,
              consultant_email: res.consultantEmail || null,
              consultant_contact_number: res.consultantContactNumber || null,
              originating_agent: res.originatingAgent || {},
              responsible_client: res.responsibleClient || {},
              guarantee: res.guarantee || {},
              cancellation: res.cancellation || {},
              number_of_rooms: res.numberOfRooms || null,
              number_of_guests: res.numberOfGuests || null,
              guest_nationality: res.guestNationality || null,
              link_id: res.linkId || null,
              create_date: res.createDate || null,
              create_user_name: res.createUserName || null,
              cancellation_date: res.cancellationDate || null,
              cancellation_user_name: res.cancellationUserName || null,
              cancellation_reason: res.cancellationReason || null,
              status_at_time_of_cancellation: res.statusAtTimeOfCancellation || null,
              is_property_tax_inclusive: res.isPropertyTaxInclusive ?? true,
              raw_data: res,
              synced_at: new Date().toISOString(),
            }, {
              onConflict: "property_id,system_type,external_reservation_id"
            });
            
            if (upsertError) {
              console.error(`Error upserting reservation ${res.id}:`, upsertError);
            }
          }
          console.log(`Successfully synced ${result.length} reservations`);
        }
        break;

      case "fetch_types":
        // Fetch room types and rate types from availability endpoint
        console.log(`Fetching types via availability endpoint`);
        
        const typesStartDate = new Date();
        const typesEndDate = new Date();
        typesEndDate.setDate(typesEndDate.getDate() + 7); // Only need a few days to get types
        
        let typesAvailData: any = [];
        try {
          typesAvailData = await fetchAvailability(
            creds, 
            propertyCode, 
            typesStartDate.toISOString().split("T")[0],
            typesEndDate.toISOString().split("T")[0]
          );
        } catch (availError: any) {
          console.warn(`Could not fetch availability for types: ${availError.message}`);
        }
        
        // Extract room types and rate types from availability response
        const fetchedRoomTypes: any[] = [];
        const fetchedRateTypes: Map<number, any> = new Map();
        
        if (Array.isArray(typesAvailData)) {
          typesAvailData.forEach((roomType: any) => {
            fetchedRoomTypes.push({
              id: roomType.roomTypeId,
              name: roomType.name,
            });
            
            // Extract rate types from this room type
            if (roomType.rateTypes && Array.isArray(roomType.rateTypes)) {
              roomType.rateTypes.forEach((rateType: any) => {
                if (!fetchedRateTypes.has(rateType.rateTypeId)) {
                  fetchedRateTypes.set(rateType.rateTypeId, {
                    id: rateType.rateTypeId,
                    name: rateType.name,
                  });
                }
              });
            }
          });
        }
        
        console.log(`Fetched ${fetchedRoomTypes.length} room types, ${fetchedRateTypes.size} rate types from availability`);
        
        result = {
          roomTypes: fetchedRoomTypes,
          rateTypes: Array.from(fetchedRateTypes.values()),
          chargeTypes: [], // Not available from availability endpoint
          paymentTypes: [], // Not available from availability endpoint
        };
        break;

      case "fetch_property_data":
        // Fetch all data from availability endpoint which contains room types and rate types
        console.log(`Fetching property data for form population via availability endpoint`);
        
        // Get availability for 30 days - this returns room types with embedded rate types
        const propStartDate = new Date();
        const propEndDate = new Date();
        propEndDate.setDate(propEndDate.getDate() + 30);
        
        let availabilityData: any = [];
        try {
          availabilityData = await fetchAvailability(
            creds, 
            propertyCode, 
            propStartDate.toISOString().split("T")[0],
            propEndDate.toISOString().split("T")[0]
          );
        } catch (availError: any) {
          console.warn(`Could not fetch availability: ${availError.message}`);
        }
        
        // Extract room types from availability response
        const extractedRoomTypes: any[] = [];
        const extractedRateTypes: Map<number, any> = new Map();
        const extractedRates: any[] = [];
        
        if (Array.isArray(availabilityData)) {
          availabilityData.forEach((roomType: any) => {
            // Collect linked rate type IDs for this room type
            const linkedRateTypeIds: number[] = [];
            if (roomType.rateTypes && Array.isArray(roomType.rateTypes)) {
              roomType.rateTypes.forEach((rt: any) => {
                if (rt.rateTypeId) {
                  linkedRateTypeIds.push(rt.rateTypeId);
                }
              });
            }
            
            // Extract room type info - capture all available fields from Benson INCLUDING nested arrays
            extractedRoomTypes.push({
              id: roomType.roomTypeId,
              name: roomType.name,
              description: roomType.description,
              minGuests: roomType.minGuests,
              maxGuests: roomType.maxGuests,
              allowTeens: roomType.allowTeens,
              teenMinAge: roomType.teenMinAge,
              teenMaxAge: roomType.teenMaxAge,
              allowChildren: roomType.allowChildren,
              childMinAge: roomType.childMinAge,
              childMaxAge: roomType.childMaxAge,
              allowInfants: roomType.allowInfants,
              infantMinAge: roomType.infantMinAge,
              infantMaxAge: roomType.infantMaxAge,
              // Additional Benson fields
              minAgeCategory: roomType.minAgeCategory,
              minAdultsToOfferNonAdultRates: roomType.minAdultsToOfferNonAdultRates,
              // Linked rate types from API
              linkedRateTypeIds: linkedRateTypeIds,
              // NESTED ARRAYS - include full data for exploration in configurator
              roomsAvailablePerNight: roomType.roomsAvailablePerNight || [],
              rateTypes: roomType.rateTypes || [],
            });
            
            // Extract rate types from this room type - capture all Benson rate type fields
            if (roomType.rateTypes && Array.isArray(roomType.rateTypes)) {
              roomType.rateTypes.forEach((rateType: any) => {
                if (!extractedRateTypes.has(rateType.rateTypeId)) {
                  // Log the raw rate type data for debugging
                  console.log(`Rate type ${rateType.rateTypeId} raw data:`, JSON.stringify(rateType).substring(0, 500));
                  
                  extractedRateTypes.set(rateType.rateTypeId, {
                    id: rateType.rateTypeId,
                    name: rateType.name,
                    description: rateType.description || null,
                    priceType: rateType.priceType || null,
                    // Benson uses minAdvanceDays/maxAdvanceDays
                    minAdvanceDays: rateType.minAdvanceDays ?? null,
                    maxAdvanceDays: rateType.maxAdvanceDays ?? null,
                    // Benson uses minStayDays/maxStayDays (not minNights)
                    minStayDays: rateType.minStayDays ?? null,
                    maxStayDays: rateType.maxStayDays ?? null,
                    // Stay/Pay discount fields
                    stayPayStayNights: rateType.stayPayStayNights ?? null,
                    stayPayDiscountNights: rateType.stayPayDiscountNights ?? null,
                    stayPayDiscountPercentage: rateType.stayPayDiscountPercentage ?? null,
                  });
                }
                
                // Extract rates for this room/rate type combination
                if (rateType.rates && Array.isArray(rateType.rates)) {
                  rateType.rates.forEach((rate: any) => {
                    extractedRates.push({
                      roomTypeId: roomType.roomTypeId,
                      roomTypeName: roomType.name,
                      rateTypeId: rateType.rateTypeId,
                      rateTypeName: rateType.name,
                      date: rate.date,
                      roomAmount: rate.roomAmount,
                      adultAmount1: rate.adultAmount1,
                      adultAmount2: rate.adultAmount2,
                      teenAmount: rate.teenAmount,
                      childAmount: rate.childAmount,
                      infantAmount: rate.infantAmount,
                    });
                  });
                }
              });
            }
          });
        }
        
        console.log(`Property data - Room types: ${extractedRoomTypes.length}, Rate types: ${extractedRateTypes.size}`);
        console.log(`Property data - Rates: ${extractedRates.length}`);
        
        // Cache room types to pms_room_types_cache table
        if (extractedRoomTypes.length > 0) {
          for (const rt of extractedRoomTypes) {
            await supabase.from("pms_room_types_cache").upsert({
              property_id: property_id,
              system_type: "benson",
              external_room_type_id: String(rt.id),
              name: rt.name,
              description: rt.description || null,
              min_guests: rt.minGuests || 1,
              max_guests: rt.maxGuests || 2,
              allow_teens: rt.allowTeens ?? true,
              teen_min_age: rt.teenMinAge || null,
              teen_max_age: rt.teenMaxAge || null,
              allow_children: rt.allowChildren ?? true,
              child_min_age: rt.childMinAge || null,
              child_max_age: rt.childMaxAge || null,
              allow_infants: rt.allowInfants ?? true,
              infant_min_age: rt.infantMinAge || null,
              infant_max_age: rt.infantMaxAge || null,
              linked_rate_type_ids: rt.linkedRateTypeIds || [],
              raw_data: rt,
              fetched_at: new Date().toISOString(),
            }, { onConflict: "property_id,system_type,external_room_type_id" });
          }
          console.log(`Cached ${extractedRoomTypes.length} room types to database`);
        }
        
        // Cache rate types to pms_rate_types_cache table
        const rateTypesArray = Array.from(extractedRateTypes.values());
        if (rateTypesArray.length > 0) {
          for (const rt of rateTypesArray) {
            await supabase.from("pms_rate_types_cache").upsert({
              property_id: property_id,
              system_type: "benson",
              external_rate_type_id: String(rt.id),
              name: rt.name,
              description: rt.description || null,
              price_type: rt.priceType || null,
              min_stay_days: rt.minStayDays || null,
              max_stay_days: rt.maxStayDays || null,
              min_advance_days: rt.minAdvanceDays || null,
              max_advance_days: rt.maxAdvanceDays || null,
              raw_data: rt,
              fetched_at: new Date().toISOString(),
            }, { onConflict: "property_id,system_type,external_rate_type_id" });
          }
          console.log(`Cached ${rateTypesArray.length} rate types to database`);
        }
        
        result = {
          roomTypes: extractedRoomTypes,
          rateTypes: rateTypesArray,
          rates: extractedRates,
          warnings: availabilityData.length === 0 ? ['No availability data returned from Benson'] : [],
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