import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const bodySchema = z.object({
  booking_id: z.string().uuid(),
});

// Fields the public confirmation screen needs. Deliberately narrow — no internal
// pricing breakdown, commission, notes or channel credentials.
const SELECT = `
  id, rol_reference, external_reservation_id, status, payment_status, payment_reference,
  check_in_date, check_out_date, adults, children, teens, infants, rooms,
  guest_name, guest_email, total_price, currency, origin_property_id, origin_portfolio_id,
  properties!bookings_property_id_fkey (name, city, country, slug, brand_override_enabled, brand_logo_url)
`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "Invalid booking id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data, error } = await supabase
      .from("bookings")
      .select(SELECT)
      .eq("id", parsed.data.booking_id)
      .maybeSingle();

    if (error) {
      console.error("booking-confirmation-lookup error", error.message);
      return new Response(JSON.stringify({ error: "Lookup failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!data) {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ booking: data }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("booking-confirmation-lookup exception", e);
    return new Response(JSON.stringify({ error: "Unexpected error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
