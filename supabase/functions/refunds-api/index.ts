// ============================================================================
// REFUNDS API
// Refund register + approval workflow + gateway execution.
//
// Lifecycle:  pending -> approved -> processed
//                     \-> rejected
//                          approved -> failed (gateway rejected; stays actionable)
//
// Approval authority:
//   * Money sits in the ROL merchant account (credential source "rol")
//     -> admin / dev / fearless_leader approve.
//   * Property settles on its own gateway (credential source "byo")
//     -> the property owner/manager may approve their own refunds.
// ============================================================================

import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.23.8";
import { Resend } from "npm:resend@2.0.0";
import { resolveRefundEntitlement } from "../_shared/refundEntitlement.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const REASON_CATEGORIES = [
  "guest_request",
  "date_change",
  "no_payment",
  "property_operator",
  "channel_cancelled",
  "no_show",
  "overpayment",
  "goodwill",
  "other",
] as const;

const RequestSchema = z.object({
  action: z.literal("request_refund"),
  booking_id: z.string().uuid(),
  amount: z.number().positive(),
  reason: z.string().min(3).max(500),
  reason_category: z.enum(REASON_CATEGORIES),
  internal_notes: z.string().max(2000).optional(),
  /** Record the refund but keep it out of the approval queue until the guest chooses. */
  hold_for_guest_choice: z.boolean().optional(),
});

const DecisionSchema = z.object({
  action: z.enum(["approve_refund", "reject_refund", "execute_refund"]),
  refund_id: z.string().uuid(),
  note: z.string().max(2000).optional(),
});

const ListSchema = z.object({
  action: z.literal("list_refunds"),
  property_id: z.string().uuid().nullish(),
  status: z.string().max(20).nullish(),
});

const CapabilitySchema = z.object({
  action: z.literal("refund_capability"),
  property_id: z.string().uuid().nullish(),
  booking_id: z.string().uuid().nullish(),
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Best PayFast handle for a booking's settled payment, if one exists. */
async function findGatewayHandle(supabase: any, bookingId: string) {
  const { data } = await supabase
    .from("payment_transactions")
    .select("id, amount, status, payment_provider, pf_payment_id, transaction_ref, credential_source, created_at")
    .eq("booking_id", bookingId)
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as any[];
  const settled = rows.filter((r) =>
    ["complete", "completed", "paid", "success"].includes(String(r.status || "").toLowerCase()),
  );
  const pick = settled[0] ?? rows[0] ?? null;
  if (!pick) return { transactionId: null, pfPaymentId: null, provider: null, paidAmount: 0 };

  const fromColumn = typeof pick.pf_payment_id === "string" ? pick.pf_payment_id : null;
  const fromRef =
    typeof pick.transaction_ref === "string" && /^\d{4,}$/.test(pick.transaction_ref.trim())
      ? pick.transaction_ref.trim()
      : null;

  return {
    transactionId: pick.id as string,
    pfPaymentId: fromColumn ?? fromRef,
    provider: (pick.payment_provider as string | null) ?? null,
    paidAmount: settled.reduce((s, r) => s + Number(r.amount || 0), 0),
  };
}

async function notify(
  supabase: any,
  subject: string,
  lines: string[],
  extraRecipients: string[] = [],
) {
  try {
    const key = Deno.env.get("RESEND_API_KEY");
    if (!key) return;
    const { data: admins } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .in("role", ["admin", "dev", "fearless_leader"]);
    const ids = (admins ?? []).map((r: any) => r.user_id);
    const { data: profiles } = ids.length
      ? await supabase.from("profiles").select("email").in("id", ids)
      : { data: [] };
    const recipients = Array.from(
      new Set(
        [...(profiles ?? []).map((p: any) => p.email), ...extraRecipients].filter(
          (e: unknown): e is string => typeof e === "string" && e.includes("@"),
        ),
      ),
    );
    if (recipients.length === 0) return;
    const resend = new Resend(key);
    await resend.emails.send({
      from: "Rooms Online <noreply@roomsonline.co.za>",
      to: recipients,
      subject,
      html: `<div style="font-family:Helvetica,Arial,sans-serif;color:#1A1A2E">
        <h2 style="font-weight:400">${subject}</h2>
        ${lines.map((l) => `<p style="margin:4px 0">${l}</p>`).join("")}
      </div>`,
    });
  } catch (e) {
    console.error("[refunds-api] notification failed:", e);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) return json({ error: "Missing authorization" }, 401);

    const isServiceCall = token === serviceKey;
    let userId: string | null = null;
    if (!isServiceCall) {
      const { data: auth, error } = await supabase.auth.getUser(token);
      if (error || !auth?.user) return json({ error: "Unauthorized" }, 401);
      userId = auth.user.id;
    }

    const hasElevatedRole = async (): Promise<boolean> => {
      if (isServiceCall) return true;
      for (const role of ["admin", "dev", "fearless_leader"]) {
        const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: role });
        if (data === true) return true;
      }
      return false;
    };

    const canAccessProperty = async (propertyId: string | null): Promise<boolean> => {
      if (isServiceCall) return true;
      if (!propertyId) return await hasElevatedRole();
      const { data } = await supabase.rpc("can_access_property", {
        _property_id: propertyId,
        _user_id: userId,
      });
      return data === true;
    };

    const body = await req.json();
    const action = body?.action;

    // ── LIST ───────────────────────────────────────────────────────────────
    if (action === "list_refunds") {
      const parsed = ListSchema.safeParse(body);
      if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);
      const { property_id, status } = parsed.data;

      if (property_id && !(await canAccessProperty(property_id))) {
        return json({ error: "Forbidden" }, 403);
      }
      if (!property_id && !(await hasElevatedRole())) {
        return json({ error: "Forbidden" }, 403);
      }

      let query = supabase
        .from("rolos_refunds")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (property_id) query = query.eq("property_id", property_id);
      if (status) query = query.eq("status", status);

      const { data, error } = await query;
      if (error) throw error;

      const bookingIds = Array.from(
        new Set((data ?? []).map((r: any) => r.booking_id).filter(Boolean)),
      );
      const { data: bookings } = bookingIds.length
        ? await supabase
            .from("bookings")
            .select("id, rol_reference, rol_reference_legacy, external_reservation_id, guest_name, check_in_date, check_out_date, total_price, booking_channel, property_id")
            .in("id", bookingIds)
        : { data: [] };
      const byId = new Map((bookings ?? []).map((b: any) => [b.id, b]));

      return json({
        success: true,
        refunds: (data ?? []).map((r: any) => ({ ...r, booking: byId.get(r.booking_id) ?? null })),
      });
    }

    // ── CAPABILITY ─────────────────────────────────────────────────────────
    if (action === "refund_capability") {
      const parsed = CapabilitySchema.safeParse(body);
      if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);
      const propertyId = parsed.data.property_id ?? null;
      if (propertyId && !(await canAccessProperty(propertyId))) return json({ error: "Forbidden" }, 403);

      let pfPaymentId: string | null = null;
      if (parsed.data.booking_id) {
        const handle = await findGatewayHandle(supabase, parsed.data.booking_id);
        pfPaymentId = handle.pfPaymentId;
      }

      const { data, error } = await supabase.functions.invoke("payfast-api", {
        body: { action: "refund_capability_check", property_id: propertyId, pf_payment_id: pfPaymentId },
      });
      if (error) throw error;
      return json({ success: true, ...(data as Record<string, unknown>) });
    }

    // ── REQUEST ────────────────────────────────────────────────────────────
    if (action === "request_refund") {
      const parsed = RequestSchema.safeParse(body);
      if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);
      const { booking_id, amount, reason, reason_category, internal_notes } = parsed.data;
      const holdForGuestChoice = parsed.data.hold_for_guest_choice === true;

      const { data: booking, error: bErr } = await supabase
        .from("bookings")
        .select("id, property_id, rol_reference, rol_reference_legacy, guest_name, guest_email, check_in_date, total_price, payment_status, status, booking_channel")
        .eq("id", booking_id)
        .maybeSingle();
      if (bErr) throw bErr;
      if (!booking) return json({ error: "Booking not found" }, 404);
      if (!(await canAccessProperty(booking.property_id))) return json({ error: "Forbidden" }, 403);

      const handle = await findGatewayHandle(supabase, booking_id);
      const amountPaid = handle.paidAmount > 0 ? handle.paidAmount : Number(booking.total_price || 0);

      const entitlement = await resolveRefundEntitlement(supabase, {
        property_id: booking.property_id,
        check_in: booking.check_in_date,
        amount_paid: amountPaid,
      });

      // Never refund more than the guest actually paid.
      if (amount > amountPaid + 0.01) {
        return json(
          { error: `Requested amount exceeds the ${amountPaid.toFixed(2)} received for this booking` },
          400,
        );
      }

      const { data: property } = await supabase
        .from("properties")
        .select("refund_auto_approve_enabled, refund_auto_approve_cap")
        .eq("id", booking.property_id)
        .maybeSingle();

      const withinEntitlement =
        entitlement.entitled_amount !== null && amount <= entitlement.entitled_amount + 0.01;
      const autoApprove =
        !holdForGuestChoice &&
        property?.refund_auto_approve_enabled === true &&
        withinEntitlement &&
        amount <= Number(property?.refund_auto_approve_cap || 0);

      const { data: refund, error: insErr } = await supabase
        .from("rolos_refunds")
        .insert({
          booking_id,
          property_id: booking.property_id,
          payment_id: null,
          payment_transaction_id: handle.transactionId,
          pf_payment_id: handle.pfPaymentId,
          gateway: handle.provider,
          amount,
          requested_amount: amount,
          entitled_amount: entitlement.entitled_amount,
          reason,
          reason_category,
          internal_notes: internal_notes ?? null,
          requested_by: userId,
          status: holdForGuestChoice ? "awaiting_guest_choice" : autoApprove ? "approved" : "pending",
          guest_choice: holdForGuestChoice ? "pending" : null,
          approved_by: autoApprove ? userId : null,
          approved_at: autoApprove ? new Date().toISOString() : null,
        })
        .select()
        .single();
      if (insErr) throw insErr;

      await notify(
        supabase,
        `Refund ${holdForGuestChoice ? "awaiting guest choice" : autoApprove ? "auto-approved" : "requested"}: ${booking.rol_reference ?? booking_id}`,
        [
          `Guest: ${booking.guest_name ?? "—"}`,
          `Amount: R${amount.toFixed(2)}`,
          `Policy entitlement: ${entitlement.entitled_amount === null ? "no policy resolved" : `R${entitlement.entitled_amount.toFixed(2)}`}`,
          `Reason: ${reason} (${reason_category})`,
          holdForGuestChoice
            ? "The guest has been asked whether to hold this as credit for the stay or be refunded now. Held until they answer."
            : autoApprove
            ? "Auto-approved under the property's refund threshold — awaiting execution."
            : "Awaiting approval.",
        ],
      );

      return json({ success: true, refund, entitlement, auto_approved: autoApprove });
    }

    // ── APPROVE / REJECT / EXECUTE ─────────────────────────────────────────
    if (["approve_refund", "reject_refund", "execute_refund"].includes(action)) {
      const parsed = DecisionSchema.safeParse(body);
      if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);
      const { refund_id, note } = parsed.data;

      const { data: refund, error: rErr } = await supabase
        .from("rolos_refunds")
        .select("*")
        .eq("id", refund_id)
        .maybeSingle();
      if (rErr) throw rErr;
      if (!refund) return json({ error: "Refund not found" }, 404);

      // Approval authority depends on whose merchant account holds the money.
      const { data: creds } = await supabase.functions.invoke("payfast-api", {
        body: { action: "resolve_credentials", property_id: refund.property_id },
      });
      const isByo = (creds as any)?.credential_source === "byo";
      const elevated = await hasElevatedRole();
      const propertyAccess = await canAccessProperty(refund.property_id);
      const mayDecide = elevated || (isByo && propertyAccess);
      if (!mayDecide) {
        return json(
          { error: "Refunds against the Rooms Online merchant account require admin approval" },
          403,
        );
      }

      if (action === "reject_refund") {
        if (!note || note.trim().length < 3) {
          return json({ error: "A rejection note is required" }, 400);
        }
        if (refund.status === "processed") return json({ error: "Already processed" }, 400);
        const { data: updated, error } = await supabase
          .from("rolos_refunds")
          .update({
            status: "rejected",
            rejected_reason: note.trim(),
            rejected_by: userId,
          })
          .eq("id", refund_id)
          .select()
          .single();
        if (error) throw error;
        await notify(supabase, `Refund rejected: R${Number(refund.amount).toFixed(2)}`, [
          `Reason: ${note.trim()}`,
        ]);
        return json({ success: true, refund: updated });
      }

      if (action === "approve_refund") {
        if (refund.status !== "pending" && refund.status !== "failed") {
          return json({ error: `Cannot approve a refund in state "${refund.status}"` }, 400);
        }
        const { data: updated, error } = await supabase
          .from("rolos_refunds")
          .update({
            status: "approved",
            approved_by: userId,
            approved_at: new Date().toISOString(),
            gateway_error: null,
            internal_notes: note ? `${refund.internal_notes ? refund.internal_notes + "\n" : ""}${note}` : refund.internal_notes,
          })
          .eq("id", refund_id)
          .select()
          .single();
        if (error) throw error;
        await notify(supabase, `Refund approved: R${Number(refund.amount).toFixed(2)}`, [
          "Approved — execution against the payment gateway will follow.",
        ]);
        return json({ success: true, refund: updated });
      }

      // ── EXECUTE ──────────────────────────────────────────────────────────
      if (refund.status !== "approved" && refund.status !== "failed") {
        return json({ error: `Only approved refunds can be executed (state "${refund.status}")` }, 400);
      }

      const amount = Number(refund.amount);
      const provider = String(refund.gateway || "").toLowerCase();
      const canUseGateway = !!refund.pf_payment_id && (provider === "payfast" || provider === "");

      let gatewayRefundId: string | null = null;
      let gatewayError: string | null = null;
      let manual = false;

      if (canUseGateway) {
        const { data: res, error } = await supabase.functions.invoke("payfast-api", {
          body: {
            action: "refund",
            pf_payment_id: refund.pf_payment_id,
            amount,
            reason: String(refund.reason || "Guest refund").slice(0, 255),
            property_id: refund.property_id,
            merchant_reference: refund.id,
          },
        });
        if (error) {
          gatewayError = error.message ?? "Gateway call failed";
        } else if ((res as any)?.success) {
          gatewayRefundId = (res as any)?.gateway_refund_id ?? null;
        } else {
          gatewayError = (res as any)?.error ?? "Gateway refund failed";
          manual = (res as any)?.manual_settlement_required === true;
        }
      } else {
        // Channel-collected, EFT, or non-PayFast gateway — settle by hand.
        manual = true;
      }

      if (gatewayError && !manual) {
        const { data: failed } = await supabase
          .from("rolos_refunds")
          .update({ status: "failed", gateway_error: gatewayError })
          .eq("id", refund_id)
          .select()
          .single();
        await notify(supabase, `Refund FAILED at the gateway: R${amount.toFixed(2)}`, [
          `Error: ${gatewayError}`,
          "The refund stays in the queue and can be retried or settled manually.",
        ]);
        return json({ success: false, refund: failed, error: gatewayError }, 200);
      }

      const { data: processed, error: upErr } = await supabase
        .from("rolos_refunds")
        .update({
          status: "processed",
          processed_at: new Date().toISOString(),
          gateway_refund_id: gatewayRefundId,
          gateway_error: manual ? gatewayError : null,
          manual_settlement: manual,
        })
        .eq("id", refund_id)
        .select()
        .single();
      if (upErr) throw upErr;

      // Reflect the refund on the booking and its folio.
      const { data: booking } = await supabase
        .from("bookings")
        .select("id, total_price, payment_status, rol_reference, guest_email")
        .eq("id", refund.booking_id)
        .maybeSingle();

      if (booking) {
        const { data: priorRefunds } = await supabase
          .from("rolos_refunds")
          .select("amount")
          .eq("booking_id", booking.id)
          .eq("status", "processed");
        const refundedTotal = (priorRefunds ?? []).reduce(
          (s: number, r: any) => s + Number(r.amount || 0),
          0,
        );
        const fullyRefunded = refundedTotal >= Number(booking.total_price || 0) - 0.01;
        await supabase
          .from("bookings")
          .update({ payment_status: fullyRefunded ? "refunded" : "partially_refunded" })
          .eq("id", booking.id);
      }

      const { data: folio } = await supabase
        .from("rolos_folios")
        .select("id")
        .eq("booking_id", refund.booking_id)
        .maybeSingle();
      if (folio?.id) {
        await supabase.from("rolos_folio_transactions").insert({
          folio_id: folio.id,
          transaction_type: "refund",
          description: `Refund${gatewayRefundId ? ` (gateway ${gatewayRefundId})` : manual ? " (manual settlement)" : ""}: ${refund.reason}`,
          amount: Math.abs(amount),
          created_by: userId,
        });
      }

      if (refund.payment_id) {
        await supabase.from("rolos_payments").update({ status: "refunded" }).eq("id", refund.payment_id);
      }

      await notify(
        supabase,
        `Refund processed: R${amount.toFixed(2)}${manual ? " (manual settlement required)" : ""}`,
        [
          `Booking: ${booking?.rol_reference ?? refund.booking_id ?? "—"}`,
          manual
            ? `Gateway refund unavailable — settle manually.${gatewayError ? ` (${gatewayError})` : ""}`
            : `Gateway reference: ${gatewayRefundId ?? "—"}`,
        ],
        booking?.guest_email ? [] : [],
      );

      return json({
        success: true,
        refund: processed,
        manual_settlement_required: manual,
        gateway_error: gatewayError,
      });
    }

    return json({ error: "Unknown action" }, 404);
  } catch (e) {
    console.error("[refunds-api] error:", e);
    return json({ error: e instanceof Error ? e.message : "Internal server error" }, 500);
  }
});
