// Public balance settlement for a modified booking.
//
// The token from the balance-request email is the only credential: it resolves one booking, shows
// what is outstanding, and starts a gateway payment for exactly that amount.

import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { displayBookingReference } from "../_shared/bookingReference.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TokenSchema = z.object({
  action: z.enum(["get_balance", "initiate_balance_payment"]),
  token: z.string().min(10).max(128),
});

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (payload: unknown, status = 200) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const parsed = TokenSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);
    const { action, token } = parsed.data;

    const { data: tokenRow } = await supabase
      .from("guest_portal_tokens")
      .select("booking_id, expires_at, used_for")
      .eq("token", token)
      .eq("used_for", "balance")
      .maybeSingle();

    if (!tokenRow) return json({ error: "This payment link is invalid." }, 404);
    if (new Date(tokenRow.expires_at) < new Date()) {
      return json({ error: "This payment link has expired. Please contact the property." }, 410);
    }

    const { data: booking } = await supabase
      .from("bookings")
      .select(
        "id, property_id, guest_name, check_in_date, check_out_date, total_price, amount_paid, balance_due, payment_status, rol_reference, rol_reference_legacy, external_reservation_id, properties!bookings_property_id_fkey(name)",
      )
      .eq("id", tokenRow.booking_id)
      .maybeSingle();

    if (!booking) return json({ error: "Booking not found." }, 404);

    const balance = round2(booking.balance_due ?? 0);

    if (action === "get_balance") {
      return json({
        success: true,
        booking: {
          reference: displayBookingReference(booking),
          guest_name: booking.guest_name,
          property_name: (booking as Record<string, any>).properties?.name ?? null,
          check_in_date: booking.check_in_date,
          check_out_date: booking.check_out_date,
          total_price: round2(booking.total_price ?? 0),
          amount_paid: round2(booking.amount_paid ?? 0),
          balance_due: balance,
        },
      });
    }

    if (balance <= 0.01) return json({ error: "There is nothing outstanding on this booking." }, 400);

    const { data, error } = await supabase.functions.invoke("payfast-api", {
      body: {
        action: "initiate_payment",
        booking_id: booking.id,
        purpose: "balance",
        amount_override: balance,
      },
    });
    if (error) throw error;
    if (!(data as { success?: boolean })?.success) {
      return json({ error: (data as { error?: string })?.error || "Payment could not be started." }, 502);
    }

    return json({ success: true, ...(data as Record<string, unknown>) });
  } catch (err) {
    console.error("[booking-balance-api]", err);
    return json({ error: err instanceof Error ? err.message : "Request failed" }, 500);
  }
});
