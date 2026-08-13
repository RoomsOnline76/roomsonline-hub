// Public settlement of a modified booking.
//
// The token from the settlement email is the only credential. Two directions:
//   balance    → show what is outstanding and start a gateway payment for exactly that amount
//   settlement → show the credit due back and let the guest choose: hold it as credit, or refund now
//
// The guest's choice moves the held refund: "refund now" releases it into the approval queue,
// "hold as credit" keeps it on the booking and takes it out of the queue entirely. Either way the
// owner/accounts are told.

import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { Resend } from "npm:resend@2";
import { displayBookingReference } from "../_shared/bookingReference.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TokenSchema = z.object({
  action: z.enum([
    "get_balance",
    "initiate_balance_payment",
    "get_settlement",
    "choose_credit",
    "choose_refund",
  ]),
  token: z.string().min(10).max(128),
});

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const money = (n: number) => `R${Number(n || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2 })}`;

// deno-lint-disable-next-line no-explicit-any
type Db = any;

/** Tell the owner and accounts what the guest decided. Best effort — never blocks the guest. */
async function notifyOwner(supabase: Db, propertyId: string, subject: string, lines: string[]) {
  try {
    const key = Deno.env.get("RESEND_API_KEY");
    if (!key) return;

    const recipients = new Set<string>();
    const { data: admins } = await supabase
      .from("user_roles")
      .select("user_id")
      .in("role", ["admin", "dev", "fearless_leader"]);
    const ids = (admins ?? []).map((r: { user_id: string }) => r.user_id);
    if (ids.length) {
      const { data: profiles } = await supabase.from("profiles").select("email").in("id", ids);
      for (const p of profiles ?? []) if (p?.email?.includes("@")) recipients.add(p.email);
    }
    const { data: contacts } = await supabase
      .from("property_contact_details")
      .select("email")
      .eq("property_id", propertyId)
      .limit(5);
    for (const c of contacts ?? []) if (c?.email?.includes("@")) recipients.add(c.email);

    if (!recipients.size) return;
    const resend = new Resend(key);
    await resend.emails.send({
      from: "RoomsOnline <hello@notify.roomsonline.co.za>",
      to: Array.from(recipients),
      subject,
      html: `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1A1A2E;">
        <h2 style="font-weight:400;">${subject}</h2>
        <ul>${lines.map((l) => `<li>${l}</li>`).join("")}</ul>
      </div>`,
    });
  } catch (err) {
    console.error("[booking-balance-api] owner notice failed:", err);
  }
}

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

    const isSettlement = action.startsWith("get_settlement") || action.startsWith("choose_");
    const usedFor = isSettlement ? "settlement" : "balance";

    const { data: tokenRow } = await supabase
      .from("guest_portal_tokens")
      .select("booking_id, expires_at, used_for")
      .eq("token", token)
      .eq("used_for", usedFor)
      .maybeSingle();

    if (!tokenRow) return json({ error: "This link is invalid." }, 404);
    if (new Date(tokenRow.expires_at) < new Date()) {
      return json({ error: "This link has expired. Please contact the property." }, 410);
    }

    const { data: booking } = await supabase
      .from("bookings")
      .select(
        "id, property_id, guest_name, check_in_date, check_out_date, total_price, amount_paid, balance_due, credit_held, payment_status, rol_reference, rol_reference_legacy, external_reservation_id, properties!bookings_property_id_fkey(name)",
      )
      .eq("id", tokenRow.booking_id)
      .maybeSingle();

    if (!booking) return json({ error: "Booking not found." }, 404);

    const balance = round2(booking.balance_due ?? 0);
    const propertyName = (booking as Record<string, any>).properties?.name ?? null;
    const reference = displayBookingReference(booking);

    // ── Balance (guest owes) ────────────────────────────────────────────────
    if (action === "get_balance") {
      return json({
        success: true,
        booking: {
          reference,
          guest_name: booking.guest_name,
          property_name: propertyName,
          check_in_date: booking.check_in_date,
          check_out_date: booking.check_out_date,
          total_price: round2(booking.total_price ?? 0),
          amount_paid: round2(booking.amount_paid ?? 0),
          balance_due: balance,
        },
      });
    }

    if (action === "initiate_balance_payment") {
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
    }

    // ── Settlement (money due back to the guest) ────────────────────────────
    const { data: refund } = await supabase
      .from("rolos_refunds")
      .select("id, amount, status, guest_choice, guest_choice_at")
      .eq("booking_id", booking.id)
      .in("status", ["awaiting_guest_choice", "pending", "approved", "processed", "rejected"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const creditHeld = round2(booking.credit_held ?? 0);
    const dueBack = round2(refund?.amount ?? Math.max(0, Number(booking.amount_paid ?? 0) - Number(booking.total_price ?? 0)));

    if (action === "get_settlement") {
      return json({
        success: true,
        booking: {
          reference,
          guest_name: booking.guest_name,
          property_name: propertyName,
          check_in_date: booking.check_in_date,
          check_out_date: booking.check_out_date,
          total_price: round2(booking.total_price ?? 0),
          amount_paid: round2(booking.amount_paid ?? 0),
          due_back: dueBack,
          credit_held: creditHeld,
        },
        choice: refund?.guest_choice === "pending" ? null : refund?.guest_choice ?? null,
        refund_status: refund?.status ?? null,
      });
    }

    if (!refund) return json({ error: "There is nothing to settle on this booking." }, 400);
    if (refund.guest_choice && refund.guest_choice !== "pending") {
      return json({ success: true, already: refund.guest_choice, amount: dueBack });
    }
    if (refund.status !== "awaiting_guest_choice") {
      return json({ error: "This has already been actioned by the property." }, 409);
    }

    const nowIso = new Date().toISOString();

    if (action === "choose_credit") {
      await supabase
        .from("rolos_refunds")
        .update({
          status: "rejected",
          guest_choice: "hold_credit",
          guest_choice_at: nowIso,
          rejected_reason: "Guest chose to hold the amount as credit towards the stay.",
          updated_at: nowIso,
        })
        .eq("id", refund.id);

      await supabase
        .from("bookings")
        .update({ credit_held: round2(creditHeld + dueBack) })
        .eq("id", booking.id);

      await notifyOwner(supabase, booking.property_id, `Credit held: ${reference}`, [
        `Guest: ${booking.guest_name ?? "—"}`,
        `Amount: ${money(dueBack)}`,
        "The guest chose to keep the amount as credit towards the stay — no refund is required.",
      ]);

      return json({ success: true, choice: "hold_credit", amount: dueBack });
    }

    // choose_refund — release the held refund into the normal approval queue.
    await supabase
      .from("rolos_refunds")
      .update({
        status: "pending",
        guest_choice: "refund_now",
        guest_choice_at: nowIso,
        updated_at: nowIso,
      })
      .eq("id", refund.id);

    await notifyOwner(supabase, booking.property_id, `Refund requested by guest: ${reference}`, [
      `Guest: ${booking.guest_name ?? "—"}`,
      `Amount: ${money(dueBack)}`,
      "The guest asked to be refunded now. The refund is awaiting approval in the Refund Register.",
    ]);

    return json({ success: true, choice: "refund_now", amount: dueBack });
  } catch (err) {
    console.error("[booking-balance-api]", err);
    return json({ error: err instanceof Error ? err.message : "Request failed" }, 500);
  }
});
