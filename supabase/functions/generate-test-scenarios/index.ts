import { AI_MODELS, AI_GATEWAY_URL, aiFetch } from "../_shared/aiModels.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FEATURE_CONTEXT: Record<string, string> = {
  booking_flow: `
    The booking flow involves:
    1. User selects property and room from PropertyShowcase/RoomShowcase
    2. User picks dates using RoomAvailabilityCalendar
    3. System checks live PMS availability (RULE #1: MUST happen before booking creation)
    4. User fills guest details on Booking page
    5. push-booking edge function creates reservation
    6. BookingConfirmation displays result
    
    Key invariants:
    - RULE #1: PMS availability MUST be verified immediately before booking creation
    - Guest PII (name, email, phone) must be encrypted by trigger
    - Booking status cannot be 'confirmed' without external_reservation_id (unless is_rol_property)
  `,
  benson_api: `
    Benson PMS adapter handles:
    - get_rates: Fetch room rates and availability
    - create_booking: Push reservation to Benson system
    - get_reservations: Retrieve existing bookings
    
    Key invariants:
    - Must verify availability before creating booking
    - Must return standardized response format per adapter-contract.ts
    - Must handle rate limiting gracefully
  `,
  hostfully_api: `
    Hostfully PMS adapter handles:
    - OAuth authentication flow
    - Building/unit property structure
    - list_properties: Discover properties from Hostfully
    - sync_listings: Deep sync property data
    - Calendar sync for availability
    
    Key invariants:
    - OAuth tokens must be refreshed before expiry
    - Building-level properties must parse units correctly
    - Environment toggle (sandbox/production) must be respected
  `,
  rls_validation: `
    Row-Level Security policies protect data access:
    - Owners can only see their own properties
    - Admins can see all properties
    - Anonymous users can only see public_properties view
    - Guest PII is encrypted and decryption restricted to admin/dev
    
    Key invariants:
    - Cross-user data access must be blocked
    - Anonymous users cannot access admin tables
    - has_role() function must be used for role checks
  `,
  contract_signing: `
    Contract workflow:
    1. Admin creates contract from template
    2. System generates unique signing token
    3. Owner receives email with signing link
    4. Owner signs using SignatureCanvas
    5. Signature stored and contract marked signed
    
    Key invariants:
    - Properties cannot be activated without signed contract
    - Signature must be valid image data
    - Contract version must be tracked
  `,
  pms_sync: `
    PMS synchronization handles:
    - Rate updates from PMS to local cache
    - Availability calendar sync
    - Property data ingestion
    
    Key invariants:
    - Cache must be invalidated on sync
    - Stale data must not be served
    - Sync failures must be logged
  `,
  guest_encryption: `
    Guest PII encryption:
    - Trigger encrypts guest_name, guest_email, guest_phone on insert/update
    - Encrypted columns: guest_name_encrypted, guest_email_encrypted, guest_phone_encrypted
    - Decryption only via bookings_decrypted view for admin/dev
    
    Key invariants:
    - Plaintext fields maintained for backward compatibility
    - Encryption uses pgcrypto with pgp_sym_encrypt
    - Decryption blocked for non-admin/dev roles
  `,
};

const INVARIANT_RULES: Record<string, string> = {
  rule_1: "RULE #1: Live PMS availability MUST be verified immediately before booking creation. Check sync_logs for availability_check before booking timestamp.",
  rls_enforcement: "RLS policies must block cross-user data access. Anonymous users cannot access admin tables. Role checks use has_role() function.",
  pii_encryption: "Guest PII (name, email, phone) must be encrypted by database trigger. Decryption restricted to admin/dev roles via bookings_decrypted view.",
  adapter_contract: "PMS adapters must return standardized response format per supabase/functions/_shared/adapter-contract.ts.",
  auth_boundaries: "Authentication boundaries must be enforced. Unauthenticated users cannot access protected routes or data.",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { featureTarget, invariants, context } = await req.json();

    if (!featureTarget) {
      return new Response(
        JSON.stringify({ error: "featureTarget is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const featureContext = FEATURE_CONTEXT[featureTarget] || `Testing feature: ${featureTarget}`;
    const invariantRules = (invariants || [])
      .map((inv: string) => INVARIANT_RULES[inv] || inv)
      .join("\n");

    const systemPrompt = `You are a QA engineer generating test scenarios for a hotel booking platform. 
Your task is to create comprehensive test scenarios that validate both happy paths and edge cases.
Each scenario must include specific assertions that can be verified programmatically.

IMPORTANT: Generate scenarios as a valid JSON array. Each scenario must have:
- id: unique identifier (e.g., "booking_happy_1")
- name: descriptive name
- category: one of "happy_path", "edge_case", "security", "invariant"
- description: what the test validates
- steps: array of test steps with action and expected_result
- expected_outcome: overall expected result
- assertions: array of specific checks with name, type, expected, and actual_check fields`;

    const userPrompt = `Generate test scenarios for: ${featureTarget}

FEATURE CONTEXT:
${featureContext}

INVARIANTS TO ENFORCE:
${invariantRules}

ADDITIONAL CONTEXT:
${context || "None provided"}

Generate 5-8 test scenarios covering:
1. Happy path (normal successful flow)
2. Edge cases (boundary conditions, empty inputs)
3. Security scenarios (unauthorized access, injection attempts)
4. Invariant enforcement (critical business rules)

Return ONLY valid JSON array of scenarios.`;

    console.log("Generating scenarios for:", featureTarget);

    const response = await aiFetch(AI_GATEWAY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: AI_MODELS.test_scenarios,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "TOBI is temporarily unavailable — credits exhausted." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ error: "TOBI generation failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiResponse = await response.json();
    const content = aiResponse.choices?.[0]?.message?.content || "";

    // Parse JSON from response (handle markdown code blocks)
    let scenarios = [];
    try {
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        scenarios = JSON.parse(jsonMatch[0]);
      }
    } catch (parseError) {
      console.error("Failed to parse AI response:", parseError);
      console.log("Raw content:", content);
      // Return fallback scenarios
      scenarios = [
        {
          id: `${featureTarget}_fallback_1`,
          name: `Basic ${featureTarget} test`,
          category: "happy_path",
          description: "Verify basic functionality works",
          steps: [{ action: "Execute basic flow", expected_result: "Success" }],
          expected_outcome: "Feature works as expected",
          assertions: [{ name: "Basic check", type: "exists", expected: true, actual_check: "result !== null" }],
        },
      ];
    }

    console.log(`Generated ${scenarios.length} scenarios for ${featureTarget}`);

    return new Response(
      JSON.stringify({ scenarios, featureTarget }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("generate-test-scenarios error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
