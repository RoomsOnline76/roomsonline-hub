/**
 * generate-property-invoices — ROL receivables billed to properties/portfolios.
 *
 * Actions:
 *   preview   { period_start, period_end }  → what a run would produce (no writes)
 *   generate  { period_start, period_end }  → creates/refreshes DRAFT invoices
 *   issue     { invoice_id }                → mints the reference + pay link, locks it
 *   send      { invoice_id }                → emails the invoice and its pay link
 *   mark_paid { invoice_id, payment_reference?, amount? }
 *   void      { invoice_id, reason? }
 *   adjust    { invoice_id, description, amount }   (draft only)
 *
 * Deduction awareness: a booking, charge or fee is billed here ONLY when it was
 * not recovered on a payout statement. Bookings ROL settled through its own
 * gateway are deducted on the payout, so they never appear on an invoice.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { Resend } from "npm:resend@4";
import {
  resolveBookingCommission,
  resolveCommissionType,
  pickGlobals,
  type CommissionConfigLike,
  type CommissionGlobalsLike,
} from "../_shared/commissionResolver.ts";
import {
  buildRecurringComponents,
  pickRecurringGlobals,
  type RecurringConfigLike,
  type RecurringGlobalsLike,
} from "../_shared/recurringBilling.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Json = Record<string, unknown>;
const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

const SETTLED_TX_STATUSES = ["paid", "completed", "succeeded", "success"];
const EARNED_BOOKING_STATUSES = ["confirmed", "checked_in", "checked_out", "completed", "paid", "settled"];
const EARNED_PAYMENT_STATUSES = ["paid", "paid_externally", "settled", "completed", "partially_paid", "deposit_paid"];
const EXCLUDED_BOOKING_STATUSES = ["cancelled", "canceled", "refunded", "no_show", "failed", "pending", "draft"];

const BOOKING_FIELDS =
  "id, property_id, guest_name, check_in_date, check_out_date, total_price, status, payment_status, integration_type, booking_channel, source_url, calculated_commission, commission_rate_applied, commission_type, rol_reference, created_at";

function json(body: Json, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function groupCode(name: string, fallback?: string | null): string {
  const source = (fallback || name || "GEN").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return (source.slice(0, 4) || "GEN").padEnd(3, "X");
}

function periodKey(periodStart: string): string {
  const d = new Date(periodStart);
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

interface BuiltLine {
  property_id: string | null;
  property_name: string | null;
  line_kind: "commission" | "recurring" | "charge" | "adjustment";
  line_date: string | null;
  description: string;
  booking_id: string | null;
  rol_reference: string | null;
  guest_name: string | null;
  check_in_date: string | null;
  check_out_date: string | null;
  settlement_route: string | null;
  commission_type: string | null;
  gross_amount: number;
  rate: number;
  amount: number;
  quantity: number;
  source_kind: string | null;
  source_id: string | null;
}

interface BookingEntry {
  booking: Record<string, unknown>;
  propertyId: string;
  propertyName: string;
  gross: number;
  route: "byo" | "reservation";
  date: string;
}

interface Bucket {
  kind: "portfolio" | "property";
  portfolioId: string | null;
  propertyId: string | null;
  name: string;
  code: string | null;
  billToEmail: string | null;
  entries: BookingEntry[];
  propertyIds: Set<string>;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ success: false, error: "Missing authorization header" }, 401);
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (authError || !user) return json({ success: false, error: "Invalid token" }, 401);

    const { data: roleRows } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
    const roles = (roleRows || []).map((r: { role: string }) => r.role);
    if (!roles.some((r) => ["admin", "dev", "fearless_leader"].includes(r))) {
      return json({ success: false, error: "Requires admin, dev or fearless_leader role" }, 403);
    }

    const body = (await req.json().catch(() => ({}))) as Json;
    const action = String(body.action || "preview");
    console.log(`[property-invoices] ${action} by ${user.email}`);

    if (action === "issue") return await issue(supabase, body, user.id);
    if (action === "send") return await sendInvoice(supabase, body);
    if (action === "mark_paid") return await markPaid(supabase, body, user.id);
    if (action === "void") return await voidInvoice(supabase, body);
    if (action === "adjust") return await addAdjustment(supabase, body);

    const periodStart = String(body.period_start || "");
    const periodEnd = String(body.period_end || "");
    if (!periodStart || !periodEnd) {
      return json({ success: false, error: "period_start and period_end are required" }, 400);
    }
    const fromIso = new Date(`${periodStart}T00:00:00Z`).toISOString();
    const toIso = new Date(new Date(`${periodEnd}T00:00:00Z`).getTime() + 86400000).toISOString();

    /* ---------------- 1. candidate bookings in the period -------------- */
    const { data: bookingRows, error: bookErr } = await supabase
      .from("bookings")
      .select(
        `${BOOKING_FIELDS},
         properties!bookings_property_id_fkey!inner(id, name, owner_email, ref_code, allow_custom_payment_provider, payment_mode)`,
      )
      .gte("created_at", fromIso)
      .lt("created_at", toIso);
    if (bookErr) throw bookErr;

    const bookingIds = (bookingRows || []).map((b: Record<string, any>) => b.id);

    const { data: txRows } = bookingIds.length
      ? await supabase
        .from("payment_transactions")
        .select("id, booking_id, amount, status, credential_source")
        .in("booking_id", bookingIds)
      : { data: [] as Record<string, any>[] };

    const txByBooking = new Map<string, Record<string, any>[]>();
    (txRows || []).forEach((t: Record<string, any>) => {
      const list = txByBooking.get(t.booking_id) || [];
      list.push(t);
      txByBooking.set(t.booking_id, list);
    });

    /* ---------------- 2. what payouts / earlier invoices already claim -- */
    const [{ data: payoutClaims }, { data: invoiceClaims }] = await Promise.all([
      supabase
        .from("property_payout_statement_lines")
        .select("booking_id, source_id, line_kind, property_payout_statements!inner(status)"),
      supabase
        .from("rol_property_invoice_lines")
        .select("booking_id, source_id, line_kind, rol_property_invoices!inner(status, period_start)"),
    ]);

    const claimedBookings = new Set<string>();
    const claimedSources = new Set<string>();
    (payoutClaims || []).forEach((l: Record<string, any>) => {
      if (l.property_payout_statements?.status === "void") return;
      if (l.booking_id) claimedBookings.add(l.booking_id);
      if (l.source_id) claimedSources.add(String(l.source_id));
    });
    (invoiceClaims || []).forEach((l: Record<string, any>) => {
      const inv = l.rol_property_invoices;
      if (!inv || inv.status === "void") return;
      // Drafts for THIS period are about to be rebuilt, so their claims don't count.
      if (inv.status === "draft" && inv.period_start === periodStart) return;
      if (l.booking_id) claimedBookings.add(l.booking_id);
      if (l.source_id) claimedSources.add(String(l.source_id));
    });

    /* ---------------- 3. classify each booking ------------------------- */
    const entries: BookingEntry[] = [];
    (bookingRows || []).forEach((b: Record<string, any>) => {
      const property = b.properties;
      if (!property) return;
      if (claimedBookings.has(b.id)) return;

      const status = String(b.status || "").toLowerCase();
      const payStatus = String(b.payment_status || "").toLowerCase();
      if (EXCLUDED_BOOKING_STATUSES.includes(status)) return;

      const txs = txByBooking.get(b.id) || [];
      const settled = txs.filter((t) => SETTLED_TX_STATUSES.includes(String(t.status || "").toLowerCase()));
      const rolSettled = settled.filter((t) => String(t.credential_source || "").toLowerCase() !== "byo");
      // ROL held this money → the payout statement recovers the commission.
      if (rolSettled.length > 0) return;

      const byoSettled = settled.filter((t) => String(t.credential_source || "").toLowerCase() === "byo");
      const paymentMode = String(property.payment_mode || "").toLowerCase();
      const earned = EARNED_BOOKING_STATUSES.includes(status) || EARNED_PAYMENT_STATUSES.includes(payStatus);

      let route: "byo" | "reservation" | null = null;
      let gross = 0;
      if (byoSettled.length > 0) {
        route = "byo";
        gross = byoSettled.reduce((s, t) => s + num(t.amount), 0);
      } else if (earned && paymentMode === "reservation_only") {
        route = "reservation";
        gross = num(b.total_price);
      } else if (earned && property.allow_custom_payment_provider) {
        route = "byo";
        gross = num(b.total_price);
      }
      if (!route || gross <= 0) return;

      entries.push({
        booking: b,
        propertyId: property.id,
        propertyName: property.name,
        gross,
        route,
        date: String(b.created_at || periodEnd).slice(0, 10),
      });
    });

    /* ---------------- 4. reference data ------------------------------- */
    const { data: allProps } = await supabase
      .from("properties")
      .select("id, name, owner_email, ref_code, allow_custom_payment_provider, payment_mode, is_active");
    const propertyById = new Map<string, Record<string, any>>();
    (allProps || []).forEach((p: Record<string, any>) => propertyById.set(p.id, p));

    const [membersRes, portfoliosRes, propBillingRes, pfBillingRes, termsRes, globalsRes, chargesRes, subInvRes] =
      await Promise.all([
        supabase.from("property_portfolio_members").select("property_id, portfolio_id"),
        supabase.from("property_portfolios").select("id, name, owner_email"),
        supabase.from("property_billing_configs").select("*"),
        supabase.from("portfolio_billing_configs").select("*"),
        supabase
          .from("property_commercial_terms")
          .select("property_id, commission_type, revenue_share_percent, effective_from, contract_status")
          .eq("contract_status", "active")
          .order("effective_from", { ascending: false }),
        supabase.from("billing_global_defaults").select("*"),
        supabase.from("subscription_charge_items").select("*").eq("status", "pending"),
        supabase
          .from("subscription_invoices")
          .select("property_id, portfolio_id, period_start, period_end, status")
          .in("status", ["pending", "paid"]),
      ]);

    const portfolioByProperty = new Map<string, string>();
    (membersRes.data || []).forEach((m: Record<string, any>) =>
      portfolioByProperty.set(m.property_id, m.portfolio_id),
    );
    const propertiesByPortfolio = new Map<string, string[]>();
    portfolioByProperty.forEach((pfId, propId) => {
      propertiesByPortfolio.set(pfId, [...(propertiesByPortfolio.get(pfId) || []), propId]);
    });
    const portfolioById = new Map<string, Record<string, any>>();
    (portfoliosRes.data || []).forEach((p: Record<string, any>) => portfolioById.set(p.id, p));

    const propBillingById = new Map<string, Record<string, any>>();
    (propBillingRes.data || []).forEach((c: Record<string, any>) => propBillingById.set(c.property_id, c));
    const pfBillingById = new Map<string, Record<string, any>>();
    (pfBillingRes.data || []).forEach((c: Record<string, any>) => pfBillingById.set(c.portfolio_id, c));

    const termByKey = new Map<string, number>();
    (termsRes.data || []).forEach((t: Record<string, any>) => {
      const key = `${t.property_id}:${t.commission_type || "listing"}`;
      if (!termByKey.has(key) && t.revenue_share_percent != null) termByKey.set(key, num(t.revenue_share_percent));
    });

    const globalRows = (globalsRes.data || []) as Record<string, any>[];
    const vatRow = globalRows.find((r) => r.vat_enabled) || globalRows[0] || {};
    const vatEnabled = !!vatRow?.vat_enabled;
    const vatRate = vatEnabled ? num(vatRow?.vat_rate) : 0;
    const dueDays = Math.max(0, num(vatRow?.invoice_due_days) || 14);
    const vatSnapshot = {
      vat_enabled: vatEnabled,
      vat_rate: vatRate,
      vat_number: vatRow?.vat_number ?? null,
      company_legal_name: vatRow?.company_legal_name ?? "Rooms Online",
      company_address: vatRow?.company_address ?? null,
      footer_note: vatRow?.invoice_footer_note ?? null,
    };

    const billingFor = (pid: string): Record<string, any> | null => {
      const pfId = portfolioByProperty.get(pid);
      return (pfId ? pfBillingById.get(pfId) : null) || propBillingById.get(pid) || null;
    };

    /* ---------------- 5. unit counts for tiered / per-unit fees -------- */
    const { data: roomRows } = await supabase.from("rolos_rooms").select("property_id");
    const { data: unitTypeRows } = await supabase
      .from("hostfully_room_types")
      .select("property_id, total_units");
    const unitsByProperty = new Map<string, number>();
    (roomRows || []).forEach((r: Record<string, any>) =>
      unitsByProperty.set(r.property_id, (unitsByProperty.get(r.property_id) || 0) + 1),
    );
    (unitTypeRows || []).forEach((r: Record<string, any>) => {
      if (unitsByProperty.has(r.property_id)) return;
      unitsByProperty.set(r.property_id, (unitsByProperty.get(r.property_id) || 0) + num(r.total_units));
    });

    /* ---------------- 6. bucket into billing groups -------------------- */
    const buckets = new Map<string, Bucket>();
    const ensureBucket = (propertyId: string): Bucket => {
      const pfId = portfolioByProperty.get(propertyId) || null;
      const portfolio = pfId ? portfolioById.get(pfId) : null;
      const property = propertyById.get(propertyId);
      const key = pfId ? `pf:${pfId}` : `prop:${propertyId}`;
      if (!buckets.has(key)) {
        buckets.set(key, {
          kind: pfId ? "portfolio" : "property",
          portfolioId: pfId,
          propertyId: pfId ? null : propertyId,
          name: portfolio?.name || property?.name || "Property",
          code: pfId ? null : property?.ref_code || null,
          billToEmail: portfolio?.owner_email || property?.owner_email || null,
          entries: [],
          propertyIds: new Set<string>(),
        });
      }
      const bucket = buckets.get(key)!;
      if (pfId) (propertiesByPortfolio.get(pfId) || []).forEach((id) => bucket.propertyIds.add(id));
      bucket.propertyIds.add(propertyId);
      return bucket;
    };

    entries.forEach((e) => ensureBucket(e.propertyId).entries.push(e));

    // Properties with no billable booking can still owe recurring fees.
    (allProps || []).forEach((p: Record<string, any>) => {
      if (!p.is_active) return;
      const config = billingFor(p.id);
      if (!config || config.billing_enabled === false) return;
      ensureBucket(p.id);
    });

    /* ---------------- 7. build invoices ------------------------------- */
    const subInvRows = (subInvRes.data || []) as Record<string, any>[];
    const hasSubscriptionInvoice = (bucket: Bucket): boolean =>
      subInvRows.some((s) => {
        const overlaps = String(s.period_start || "") <= periodEnd && String(s.period_end || "") >= periodStart;
        if (!overlaps) return false;
        if (bucket.portfolioId) return s.portfolio_id === bucket.portfolioId;
        return s.property_id === bucket.propertyId;
      });

    const built: { key: string; invoice: Record<string, unknown>; lines: BuiltLine[] }[] = [];

    for (const [key, bucket] of buckets) {
      const lines: BuiltLine[] = [];
      let commissionTotal = 0;
      let recurringTotal = 0;
      let chargeTotal = 0;
      const billedBookings = new Set<string>();

      /* --- commission on bookings ROL never settled --- */
      for (const e of bucket.entries) {
        const config = billingFor(e.propertyId);
        const globals = pickGlobals(globalRows as CommissionGlobalsLike[], config?.billing_strategy);
        const type = resolveCommissionType(e.booking as never);
        const termKey = `${e.propertyId}:${type === "pms" ? "pms" : "listing"}`;
        const commission = resolveBookingCommission(
          e.booking as never,
          e.gross,
          config as CommissionConfigLike,
          globals,
          termByKey.get(termKey) ?? null,
        );
        if (commission.amount <= 0) continue;

        commissionTotal += commission.amount;
        billedBookings.add(String(e.booking.id));
        lines.push({
          property_id: e.propertyId,
          property_name: e.propertyName,
          line_kind: "commission",
          line_date: e.date,
          description: `${e.booking.guest_name || "Guest"} · ${e.propertyName}`,
          booking_id: String(e.booking.id),
          rol_reference: (e.booking.rol_reference as string) || null,
          guest_name: (e.booking.guest_name as string) || null,
          check_in_date: (e.booking.check_in_date as string) || null,
          check_out_date: (e.booking.check_out_date as string) || null,
          settlement_route: e.route,
          commission_type: commission.type,
          gross_amount: round2(e.gross),
          rate: round2(commission.rate),
          amount: round2(commission.amount),
          quantity: 1,
          source_kind: e.route === "reservation" ? "reservation_commission" : "byo_commission",
          source_id: String(e.booking.id),
        });
      }

      /* --- recurring platform fees --- */
      if (!hasSubscriptionInvoice(bucket)) {
        const anchorId = bucket.propertyId || Array.from(bucket.propertyIds)[0] || null;
        const config = (bucket.portfolioId
          ? pfBillingById.get(bucket.portfolioId)
          : anchorId
            ? propBillingById.get(anchorId)
            : null) as RecurringConfigLike | null;
        const globals = pickRecurringGlobals(
          globalRows as RecurringGlobalsLike[],
          (config as Record<string, any> | null)?.billing_strategy,
        );
        const units = Array.from(bucket.propertyIds).reduce((s, id) => s + (unitsByProperty.get(id) || 0), 0);
        buildRecurringComponents(config, globals, units, { isPortfolio: !!bucket.portfolioId }).forEach((c) => {
          recurringTotal += c.amount;
          lines.push({
            property_id: bucket.propertyId,
            property_name: bucket.propertyId ? bucket.name : null,
            line_kind: "recurring",
            line_date: periodEnd,
            description: c.description,
            booking_id: null,
            rol_reference: null,
            guest_name: null,
            check_in_date: null,
            check_out_date: null,
            settlement_route: null,
            commission_type: null,
            gross_amount: 0,
            rate: c.rate,
            amount: c.amount,
            quantity: c.quantity,
            source_kind: `recurring:${c.key}`,
            source_id: `${key}:${c.key}:${periodStart}`,
          });
        });
      }

      /* --- pending one-off charges not recovered by a payout --- */
      (chargesRes.data || []).forEach((c: Record<string, any>) => {
        if (claimedSources.has(String(c.id))) return;
        const belongs = bucket.portfolioId
          ? c.portfolio_id === bucket.portfolioId
          : !!c.property_id && bucket.propertyIds.has(c.property_id);
        if (!belongs) return;
        const amount = round2(num(c.amount));
        if (amount === 0) return;
        chargeTotal += amount;
        lines.push({
          property_id: c.property_id || null,
          property_name: c.property_id ? propertyById.get(c.property_id)?.name || null : null,
          line_kind: "charge",
          line_date: String(c.created_at || periodEnd).slice(0, 10),
          description: c.description || String(c.kind || "Platform charge"),
          booking_id: null,
          rol_reference: null,
          guest_name: null,
          check_in_date: null,
          check_out_date: null,
          settlement_route: null,
          commission_type: null,
          gross_amount: 0,
          rate: 0,
          amount,
          quantity: 1,
          source_kind: `charge:${c.kind || "other"}`,
          source_id: c.id,
        });
      });

      if (lines.length === 0) continue;

      const subtotal = round2(commissionTotal + recurringTotal + chargeTotal);
      const vatAmount = vatEnabled ? round2(subtotal * (vatRate / 100)) : 0;
      const anchorProperty = bucket.propertyId ? propertyById.get(bucket.propertyId) : null;

      built.push({
        key,
        lines,
        invoice: {
          group_kind: bucket.kind,
          portfolio_id: bucket.portfolioId,
          property_id: bucket.propertyId,
          group_name: bucket.name,
          group_code: groupCode(bucket.name, bucket.code),
          bill_to_email: bucket.billToEmail,
          bill_to_name: anchorProperty?.name || bucket.name,
          period_start: periodStart,
          period_end: periodEnd,
          currency: "ZAR",
          subtotal,
          vat_rate: vatRate,
          vat_amount: vatAmount,
          total: round2(subtotal + vatAmount),
          amount_paid: 0,
          commission_total: round2(commissionTotal),
          recurring_total: round2(recurringTotal),
          charge_total: round2(chargeTotal),
          adjustment_total: 0,
          booking_count: billedBookings.size,
          vat_snapshot: vatSnapshot,
          status: "draft",
          created_by: user.id,
        },
      });
    }

    if (action === "preview") {
      return json({
        success: true,
        data: { invoices: built.map((b) => ({ ...b.invoice, line_count: b.lines.length })) },
      });
    }

    /* ---------------- 8. persist drafts ------------------------------- */
    const created: Record<string, unknown>[] = [];
    for (const b of built) {
      const inv = b.invoice as Record<string, any>;
      const existingQuery = supabase
        .from("rol_property_invoices")
        .select("id, status")
        .eq("period_start", periodStart)
        .eq("period_end", periodEnd)
        .neq("status", "void");
      const { data: existing } = inv.portfolio_id
        ? await existingQuery.eq("portfolio_id", inv.portfolio_id)
        : await existingQuery.eq("property_id", inv.property_id);

      const locked = (existing || []).find((e: Record<string, any>) => e.status !== "draft");
      if (locked) {
        created.push({ ...inv, skipped: true, reason: "already issued" });
        continue;
      }
      const draft = (existing || []).find((e: Record<string, any>) => e.status === "draft");
      if (draft) {
        await supabase.from("rol_property_invoice_lines").delete().eq("invoice_id", draft.id);
        await supabase.from("rol_property_invoices").delete().eq("id", draft.id);
      }

      const { data: inserted, error: insErr } = await supabase
        .from("rol_property_invoices")
        .insert({ ...inv, due_date: addDays(periodEnd, dueDays) })
        .select()
        .single();
      if (insErr) throw insErr;

      const lineRows = b.lines.map((l) => ({ ...l, invoice_id: inserted.id }));
      const { error: lineErr } = await supabase.from("rol_property_invoice_lines").insert(lineRows);
      if (lineErr) throw lineErr;
      created.push(inserted);
    }

    return json({ success: true, data: { invoices: created } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[property-invoices] failed:", message);
    return json({ success: false, error: message }, 500);
  }
});

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------ */
/* Lifecycle                                                           */
/* ------------------------------------------------------------------ */

// deno-lint-ignore no-explicit-any
async function recalc(supabase: any, invoiceId: string): Promise<Record<string, any>> {
  const { data: invoice } = await supabase
    .from("rol_property_invoices")
    .select("*")
    .eq("id", invoiceId)
    .single();
  const { data: lines } = await supabase
    .from("rol_property_invoice_lines")
    .select("line_kind, amount, is_waived, booking_id")
    .eq("invoice_id", invoiceId);

  const live = (lines || []).filter((l: Record<string, any>) => !l.is_waived);
  const sumOf = (kind: string) =>
    round2(live.filter((l: Record<string, any>) => l.line_kind === kind).reduce((s: number, l: Record<string, any>) => s + num(l.amount), 0));

  const commission = sumOf("commission");
  const recurring = sumOf("recurring");
  const charge = sumOf("charge");
  const adjustment = sumOf("adjustment");
  const subtotal = round2(commission + recurring + charge + adjustment);
  const vatRate = num(invoice?.vat_rate);
  const vatAmount = vatRate > 0 ? round2(subtotal * (vatRate / 100)) : 0;

  const { data: updated } = await supabase
    .from("rol_property_invoices")
    .update({
      commission_total: commission,
      recurring_total: recurring,
      charge_total: charge,
      adjustment_total: adjustment,
      subtotal,
      vat_amount: vatAmount,
      total: round2(subtotal + vatAmount),
      booking_count: new Set(live.map((l: Record<string, any>) => l.booking_id).filter(Boolean)).size,
    })
    .eq("id", invoiceId)
    .select()
    .single();
  return updated;
}

// deno-lint-ignore no-explicit-any
async function issue(supabase: any, body: Json, userId: string): Promise<Response> {
  const id = String(body.invoice_id || "");
  if (!id) return json({ success: false, error: "invoice_id is required" }, 400);

  const invoice = await recalc(supabase, id);
  if (!invoice) return json({ success: false, error: "Invoice not found" }, 404);
  if (invoice.status !== "draft") {
    return json({ success: false, error: `Invoice is already ${invoice.status}` }, 400);
  }
  if (num(invoice.total) <= 0) {
    return json({ success: false, error: "Nothing to invoice — total is zero" }, 400);
  }

  const { data: reference, error: refErr } = await supabase.rpc("next_payout_reference", {
    _kind: "invoice",
    _group_code: invoice.group_code || "GEN",
    _period: periodKey(invoice.period_start),
  });
  if (refErr) throw refErr;

  const { data: updated, error } = await supabase
    .from("rol_property_invoices")
    .update({
      status: "issued",
      invoice_reference: reference,
      pay_token: crypto.randomUUID().replace(/-/g, ""),
      issued_at: new Date().toISOString(),
      issued_by: userId,
    })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;

  // Charges recovered on this invoice must never be deducted on a payout too.
  const { data: chargeLines } = await supabase
    .from("rol_property_invoice_lines")
    .select("source_id")
    .eq("invoice_id", id)
    .eq("line_kind", "charge");
  const chargeIds = (chargeLines || []).map((l: Record<string, any>) => l.source_id).filter(Boolean);
  if (chargeIds.length > 0) {
    await supabase
      .from("subscription_charge_items")
      .update({ status: "invoiced", invoiced_at: new Date().toISOString() })
      .in("id", chargeIds);
  }

  return json({ success: true, data: { invoice: updated } });
}

// deno-lint-ignore no-explicit-any
async function sendInvoice(supabase: any, body: Json): Promise<Response> {
  const id = String(body.invoice_id || "");
  if (!id) return json({ success: false, error: "invoice_id is required" }, 400);

  const { data: invoice } = await supabase.from("rol_property_invoices").select("*").eq("id", id).single();
  if (!invoice) return json({ success: false, error: "Invoice not found" }, 404);
  if (invoice.status === "draft") {
    return json({ success: false, error: "Issue the invoice before emailing it" }, 400);
  }
  const to = String(body.email || invoice.bill_to_email || "").trim();
  if (!to) return json({ success: false, error: "No billing email on file for this account" }, 400);

  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) return json({ success: false, error: "Email service not configured" }, 500);

  const { data: lines } = await supabase
    .from("rol_property_invoice_lines")
    .select("line_kind, description, property_name, amount, is_waived")
    .eq("invoice_id", id);

  const siteUrl = Deno.env.get("SITE_URL") || "https://sleepinafrica.roomsonline.co.za";
  const payUrl = `${siteUrl}/billing/pay/${invoice.pay_token}`;
  const money = (n: number) =>
    `R${Number(n || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const snapshot = (invoice.vat_snapshot || {}) as Record<string, any>;

  const sections: [string, string][] = [
    ["commission", "Booking commission"],
    ["recurring", "Platform subscription & services"],
    ["charge", "One-off charges"],
    ["adjustment", "Adjustments"],
  ];
  const rows = sections
    .map(([kind, label]) => {
      const items = (lines || []).filter((l: Record<string, any>) => l.line_kind === kind && !l.is_waived);
      if (items.length === 0) return "";
      const total = items.reduce((s: number, l: Record<string, any>) => s + num(l.amount), 0);
      return `<tr><td style="padding:8px 0;border-bottom:1px solid #eee">${label}<div style="color:#777;font-size:12px">${items.length} line${items.length === 1 ? "" : "s"}</div></td><td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right">${money(total)}</td></tr>`;
    })
    .join("");

  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#1a1a2e">
    <p style="color:#e91e8c;font-weight:bold;letter-spacing:1px;margin-bottom:4px">${(snapshot.company_legal_name || "ROOMS ONLINE").toString().toUpperCase()}</p>
    <h1 style="font-size:22px;margin:0 0 4px">${snapshot.vat_enabled ? "Tax Invoice" : "Invoice"} ${invoice.invoice_reference || ""}</h1>
    <p style="color:#666;margin:0 0 18px">${invoice.group_name} · ${invoice.period_start} to ${invoice.period_end}</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px">${rows}
      <tr><td style="padding:10px 0">Subtotal</td><td style="padding:10px 0;text-align:right">${money(invoice.subtotal)}</td></tr>
      ${num(invoice.vat_amount) > 0 ? `<tr><td style="padding:2px 0">VAT @ ${invoice.vat_rate}%</td><td style="padding:2px 0;text-align:right">${money(invoice.vat_amount)}</td></tr>` : ""}
      <tr><td style="padding:10px 0;font-weight:bold;border-top:2px solid #1a1a2e">Total due</td><td style="padding:10px 0;text-align:right;font-weight:bold;border-top:2px solid #1a1a2e">${money(invoice.total)}</td></tr>
    </table>
    <p style="margin:18px 0 6px">Due by <strong>${invoice.due_date || "—"}</strong></p>
    <p style="margin:18px 0"><a href="${payUrl}" style="background:#e91e8c;color:#fff;text-decoration:none;padding:12px 22px;border-radius:6px;display:inline-block">Pay this invoice</a></p>
    <p style="color:#777;font-size:12px">${snapshot.footer_note || "Thank you for partnering with Rooms Online."}</p>
    <p style="color:#999;font-size:11px">${[snapshot.company_legal_name, snapshot.vat_enabled && snapshot.vat_number ? `VAT ${snapshot.vat_number}` : null, snapshot.company_address].filter(Boolean).join(" · ")}</p>
  </div>`;

  const resend = new Resend(resendKey);
  const { error: mailError } = await resend.emails.send({
    from: "Rooms Online Billing <billing@roomsonline.co.za>",
    to: [to],
    subject: `${snapshot.vat_enabled ? "Tax invoice" : "Invoice"} ${invoice.invoice_reference || ""} — ${invoice.group_name}`,
    html,
  });
  if (mailError) return json({ success: false, error: String(mailError) }, 502);

  const { data: updated } = await supabase
    .from("rol_property_invoices")
    .update({ emailed_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  return json({ success: true, data: { invoice: updated, sent_to: to } });
}

// deno-lint-ignore no-explicit-any
async function markPaid(supabase: any, body: Json, userId: string): Promise<Response> {
  const id = String(body.invoice_id || "");
  if (!id) return json({ success: false, error: "invoice_id is required" }, 400);
  const { data: invoice } = await supabase.from("rol_property_invoices").select("*").eq("id", id).single();
  if (!invoice) return json({ success: false, error: "Invoice not found" }, 404);
  if (invoice.status === "void") return json({ success: false, error: "Invoice is void" }, 400);

  const amount = body.amount != null ? round2(num(body.amount)) : round2(num(invoice.total));
  const { data: updated, error } = await supabase
    .from("rol_property_invoices")
    .update({
      status: "paid",
      amount_paid: amount,
      paid_at: new Date().toISOString(),
      paid_by: userId,
      payment_reference: body.payment_reference ? String(body.payment_reference) : invoice.payment_reference,
    })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return json({ success: true, data: { invoice: updated } });
}

// deno-lint-ignore no-explicit-any
async function voidInvoice(supabase: any, body: Json): Promise<Response> {
  const id = String(body.invoice_id || "");
  if (!id) return json({ success: false, error: "invoice_id is required" }, 400);
  const { data: updated, error } = await supabase
    .from("rol_property_invoices")
    .update({
      status: "void",
      voided_at: new Date().toISOString(),
      void_reason: body.reason ? String(body.reason) : null,
    })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return json({ success: true, data: { invoice: updated } });
}

// deno-lint-ignore no-explicit-any
async function addAdjustment(supabase: any, body: Json): Promise<Response> {
  const id = String(body.invoice_id || "");
  const description = String(body.description || "").trim();
  const amount = round2(num(body.amount));
  if (!id || !description || !Number.isFinite(amount) || amount === 0) {
    return json({ success: false, error: "invoice_id, description and a non-zero amount are required" }, 400);
  }
  const { data: invoice } = await supabase
    .from("rol_property_invoices")
    .select("id, status, property_id, group_name, period_end")
    .eq("id", id)
    .single();
  if (!invoice) return json({ success: false, error: "Invoice not found" }, 404);
  if (invoice.status !== "draft") {
    return json({ success: false, error: "Adjustments can only be added to a draft invoice" }, 400);
  }

  const { error } = await supabase.from("rol_property_invoice_lines").insert({
    invoice_id: id,
    property_id: invoice.property_id,
    property_name: invoice.property_id ? invoice.group_name : null,
    line_kind: "adjustment",
    line_date: invoice.period_end,
    description,
    amount,
    quantity: 1,
    gross_amount: 0,
    rate: 0,
    source_kind: "manual_adjustment",
  });
  if (error) throw error;

  const updated = await recalc(supabase, id);
  return json({ success: true, data: { invoice: updated } });
}
