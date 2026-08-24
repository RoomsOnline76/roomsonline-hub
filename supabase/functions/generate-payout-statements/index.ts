/**
 * generate-payout-statements — the property payout statement run.
 *
 * Actions:
 *   preview   { period_start, period_end }  → what a run would produce (no writes)
 *   generate  { period_start, period_end }  → creates/refreshes DRAFT statements
 *   finalise  { statement_id }              → locks it, mints references, builds payments
 *   mark_paid { statement_id, bank_payment_reference? }
 *   void      { statement_id }
 *
 * Draft statements are fully rebuildable. Finalised statements are immutable:
 * their lines and amounts are snapshots, and any later change to a booking is
 * picked up by the next period as an adjustment/opening balance.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  getEffectiveBillingRate,
  loadGatewaySchedule,
  loadPeriodVolume,
  isBillableScheduleSource,
} from "../_shared/gatewayBillingRate.ts";
import {
  resolveBookingCommission,
  resolveCommissionType,
  pickGlobals,
  type CommissionConfigLike,
  type CommissionGlobalsLike,
} from "../_shared/commissionResolver.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SETTLED_TX_STATUSES = ["paid", "completed", "succeeded", "success"];
const PAID_BOOKING_STATUSES = [
  "paid",
  "paid_externally",
  "settled",
  "completed",
  "partially_paid",
  "deposit_paid",
];
const EXCLUDED_BOOKING_STATUSES = ["cancelled", "canceled", "refunded", "no_show", "failed"];

const BOOKING_FIELDS =
  "id, property_id, guest_name, check_in_date, check_out_date, total_price, status, payment_status, integration_type, booking_channel, source_url, calculated_commission, commission_rate_applied, commission_type, rol_reference, created_at";

type Json = Record<string, unknown>;
const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

function json(body: Json, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function groupCode(name: string): string {
  const cleaned = (name || "GEN").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return (cleaned.slice(0, 4) || "GEN").padEnd(3, "X");
}

function periodKey(periodStart: string): string {
  const d = new Date(periodStart);
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

interface BookingEntry {
  booking: Record<string, unknown>;
  propertyId: string;
  propertyName: string;
  gross: number;
  txId: string | null;
  settlement: "rol" | "byo";
  txDate: string;
  /** Actual fee the gateway charged us on this transaction, when reported. */
  gatewayFee: number | null;
}


interface GroupBucket {
  kind: "portfolio" | "property";
  portfolioId: string | null;
  propertyId: string | null;
  name: string;
  ownerEmail: string | null;
  payoutMode: "consolidated" | "split";
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
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) return json({ success: false, error: "Invalid token" }, 401);

    const { data: roleRows } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
    const roles = (roleRows || []).map((r: { role: string }) => r.role);
    if (!roles.some((r) => ["admin", "dev", "fearless_leader"].includes(r))) {
      return json({ success: false, error: "Requires admin, dev or fearless_leader role" }, 403);
    }

    const body = (await req.json().catch(() => ({}))) as Json;
    const action = String(body.action || "preview");
    console.log(`[payout-statements] ${action} by ${user.email}`);

    /* ----------------------------------------------------------------- */
    if (action === "finalise") return await finalise(supabase, body, user.id);
    if (action === "mark_paid") return await markPaid(supabase, body, user.id);
    if (action === "void") return await voidStatement(supabase, body);

    const periodStart = String(body.period_start || "");
    const periodEnd = String(body.period_end || "");
    if (!periodStart || !periodEnd) {
      return json({ success: false, error: "period_start and period_end are required" }, 400);
    }
    const fromIso = new Date(`${periodStart}T00:00:00Z`).toISOString();
    const toIso = new Date(new Date(`${periodEnd}T00:00:00Z`).getTime() + 86400000).toISOString();

    /* ---------------- 1. collect money in the period ------------------ */
    const { data: txRows, error: txError } = await supabase
      .from("payment_transactions")
      .select(
        `id, amount, status, created_at, credential_source, gateway_response,
         bookings!inner(${BOOKING_FIELDS}, properties!bookings_property_id_fkey!inner(id, name, owner_email))`,
      )
      .in("status", SETTLED_TX_STATUSES)
      .gte("created_at", fromIso)
      .lt("created_at", toIso);
    if (txError) throw txError;

    const entries: BookingEntry[] = [];
    const seenBookings = new Set<string>();

    // PayFast (and most gateways) report the fee they charged on the ITN payload.
    const reportedFee = (raw: unknown): number | null => {
      if (!raw || typeof raw !== "object") return null;
      const r = raw as Record<string, unknown>;
      const candidate = r.amount_fee ?? r.fee ?? r.fee_amount;
      if (candidate == null || candidate === "") return null;
      const value = Math.abs(num(candidate));
      return value > 0 ? round2(value) : 0;
    };

    (txRows || []).forEach((tx: Record<string, any>) => {
      const booking = tx.bookings;
      const property = booking?.properties;
      if (!property) return;
      if (EXCLUDED_BOOKING_STATUSES.includes(String(booking.status || "").toLowerCase())) return;
      entries.push({
        booking,
        propertyId: property.id,
        propertyName: property.name,
        gross: num(tx.amount),
        txId: tx.id,
        settlement: String(tx.credential_source ?? "").toLowerCase() === "byo" ? "byo" : "rol",
        txDate: tx.created_at,
        gatewayFee: reportedFee(tx.gateway_response),
      });
      seenBookings.add(booking.id);
    });


    // Bookings flagged paid on the record with no gateway transaction
    const { data: paidBookings } = await supabase
      .from("bookings")
      .select(`${BOOKING_FIELDS}, properties!bookings_property_id_fkey!inner(id, name, owner_email)`)
      .in("payment_status", PAID_BOOKING_STATUSES)
      .gte("created_at", fromIso)
      .lt("created_at", toIso);

    (paidBookings || []).forEach((b: Record<string, any>) => {
      if (seenBookings.has(b.id)) return;
      const property = b.properties;
      if (!property) return;
      if (EXCLUDED_BOOKING_STATUSES.includes(String(b.status || "").toLowerCase())) return;
      const gross = num(b.total_price);
      if (gross <= 0) return;
      entries.push({
        booking: b,
        propertyId: property.id,
        propertyName: property.name,
        gross,
        txId: null,
        settlement: "rol",
        txDate: b.created_at,
        gatewayFee: null,

      });
      seenBookings.add(b.id);
    });

    /* -------- 2. drop anything already claimed by a live statement ---- */
    const { data: claimed } = await supabase
      .from("property_payout_statement_lines")
      .select("booking_id, payment_transaction_id, statement_id, property_payout_statements!inner(status, period_start)")
      .in("line_kind", ["booking"]);

    const claimedTx = new Set<string>();
    const claimedBooking = new Set<string>();
    (claimed || []).forEach((l: Record<string, any>) => {
      const st = l.property_payout_statements;
      if (!st || st.status === "void") return;
      // Drafts for THIS period are about to be rebuilt, so their claims don't count.
      if (st.status === "draft" && st.period_start === periodStart) return;
      if (l.payment_transaction_id) claimedTx.add(l.payment_transaction_id);
      if (l.booking_id) claimedBooking.add(l.booking_id);
    });

    // Gateway settlement lag: guest money only lands in the ROL bank account roughly
    // 48 hours after payment, so anything younger than that cannot be paid out yet.
    const CLEARANCE_HOURS = 48;
    const clearanceCutoff = Date.now() - CLEARANCE_HOURS * 3600 * 1000;
    const isCleared = (e: BookingEntry): boolean => {
      const t = e.txDate ? new Date(String(e.txDate)).getTime() : NaN;
      if (!Number.isFinite(t)) return true;
      return t <= clearanceCutoff;
    };

    // Own-gateway (BYO) money never reached ROL — it is invoiced separately, not settled here.
    const eligible = entries.filter(
      (e) =>
        e.settlement === "rol" &&
        !(e.txId && claimedTx.has(e.txId)) &&
        !claimedBooking.has(String(e.booking.id)),
    );
    const pendingClearance = eligible.filter((e) => !isCleared(e));
    const usable = eligible.filter(isCleared);



    const propertyIds = Array.from(new Set(usable.map((e) => e.propertyId)));

    /* ---------------- 3. reference data ------------------------------- */
    // Subscriptions, platform and one-off charges are billed on the separate ROL
    // property invoice / subscription plan — they are deliberately NOT recovered here.
    const [membersRes, portfoliosRes, propsRes, billingRes, termsRes, globalsRes, bankRes] =
      await Promise.all([
        supabase.from("property_portfolio_members").select("property_id, portfolio_id").in("property_id", propertyIds),
        supabase.from("property_portfolios").select("id, name, owner_email, payout_mode"),
        supabase
          .from("properties")
          .select("id, name, owner_email, allow_custom_payment_provider, ref_code")
          .in("id", propertyIds.length ? propertyIds : ["00000000-0000-0000-0000-000000000000"]),
        supabase.from("property_billing_configs").select("*").in("property_id", propertyIds),
        supabase
          .from("property_commercial_terms")
          .select("property_id, commission_type, revenue_share_percent, effective_from, contract_status")
          .in("property_id", propertyIds)
          .eq("contract_status", "active")
          .order("effective_from", { ascending: false }),
        supabase.from("billing_global_defaults").select("*"),
        supabase.from("property_bank_details").select("*").in("property_id", propertyIds),
      ]);


    const portfolioById = new Map<string, Record<string, any>>();
    (portfoliosRes.data || []).forEach((p: Record<string, any>) => portfolioById.set(p.id, p));

    const portfolioByProperty = new Map<string, string>();
    (membersRes.data || []).forEach((m: Record<string, any>) =>
      portfolioByProperty.set(m.property_id, m.portfolio_id),
    );

    const propertyById = new Map<string, Record<string, any>>();
    (propsRes.data || []).forEach((p: Record<string, any>) => propertyById.set(p.id, p));

    // Portfolio billing configs override property configs for member properties.
    const portfolioIds = Array.from(new Set(portfolioByProperty.values()));
    const { data: pfBilling } = portfolioIds.length
      ? await supabase.from("portfolio_billing_configs").select("*").in("portfolio_id", portfolioIds)
      : { data: [] as Record<string, any>[] };
    const pfBillingById = new Map<string, Record<string, any>>();
    (pfBilling || []).forEach((c: Record<string, any>) => pfBillingById.set(c.portfolio_id, c));

    const propBillingById = new Map<string, Record<string, any>>();
    (billingRes.data || []).forEach((c: Record<string, any>) => propBillingById.set(c.property_id, c));

    const termByKey = new Map<string, number>();
    (termsRes.data || []).forEach((t: Record<string, any>) => {
      const key = `${t.property_id}:${t.commission_type || "listing"}`;
      if (!termByKey.has(key) && t.revenue_share_percent != null) {
        termByKey.set(key, num(t.revenue_share_percent));
      }
    });

    const bankByProperty = new Map<string, Record<string, any>>();
    (bankRes.data || []).forEach((b: Record<string, any>) => bankByProperty.set(b.property_id, b));

    const globalRows = (globalsRes.data || []) as Record<string, any>[];
    const vatRow = globalRows.find((r) => r.vat_enabled) || globalRows[0] || {};
    const vatEnabled = !!vatRow?.vat_enabled;
    const vatRate = vatEnabled ? num(vatRow?.vat_rate) : 0;
    const globalTxFee = num(globalRows.find((r) => r.default_transaction_fee != null)?.default_transaction_fee);

    const billingFor = (pid: string): { config: Record<string, any> | null } => {
      const pfId = portfolioByProperty.get(pid);
      const pfConfig = pfId ? pfBillingById.get(pfId) : null;
      return { config: pfConfig || propBillingById.get(pid) || null };
    };

    /* ---------------- 4. bucket into settlement groups ---------------- */
    const buckets = new Map<string, GroupBucket>();
    usable.forEach((e) => {
      const pfId = portfolioByProperty.get(e.propertyId) || null;
      const portfolio = pfId ? portfolioById.get(pfId) : null;
      const key = pfId ? `pf:${pfId}` : `prop:${e.propertyId}`;
      if (!buckets.has(key)) {
        buckets.set(key, {
          kind: pfId ? "portfolio" : "property",
          portfolioId: pfId,
          propertyId: pfId ? null : e.propertyId,
          name: portfolio?.name || e.propertyName,
          ownerEmail: portfolio?.owner_email || propertyById.get(e.propertyId)?.owner_email || null,
          payoutMode: (portfolio?.payout_mode as "consolidated" | "split") || "consolidated",
          entries: [],
          propertyIds: new Set<string>(),
        });
      }
      const bucket = buckets.get(key)!;
      bucket.entries.push(e);
      bucket.propertyIds.add(e.propertyId);
    });

    /* ---------------- 5. build statements ----------------------------- */
    interface BuiltLine {
      property_id: string | null;
      property_name: string | null;
      line_kind: string;
      line_date: string | null;
      booking_id: string | null;
      payment_transaction_id: string | null;
      rol_reference: string | null;
      description: string | null;
      guest_name: string | null;
      check_in_date: string | null;
      check_out_date: string | null;
      settlement_route: string | null;
      commission_type: string | null;
      gross_amount: number;
      commission_rate: number;
      commission_amount: number;
      fee_amount: number;
      net_amount: number;
      is_recoverable: boolean;
      source_kind: string | null;
      source_id: string | null;
    }

    const built: { statement: Record<string, unknown>; lines: BuiltLine[]; key: string }[] = [];

    // Gateway schedule + trailing volume, resolved once per property.
    const scheduleCache = new Map<
      string,
      { schedule: Awaited<ReturnType<typeof loadGatewaySchedule>>; volume: number }
    >();
    const gatewayScheduleFor = async (propertyId: string) => {
      const cached = scheduleCache.get(propertyId);
      if (cached) return cached;
      const schedule = await loadGatewaySchedule(supabase, propertyId);
      const usingSchedule = isBillableScheduleSource(schedule.source);
      const volume = usingSchedule ? await loadPeriodVolume(supabase, propertyId) : 0;
      const entry = { schedule, volume };
      scheduleCache.set(propertyId, entry);
      return entry;
    };


    for (const [key, bucket] of buckets) {
      const lines: BuiltLine[] = [];
      let grossAmount = 0;
      let rolGross = 0;
      let byoGross = 0;
      let rolCommission = 0;
      let byoCommission = 0;
      let otaCommission = 0;
      let txFees = 0;
      const bookingIds = new Set<string>();

      for (const e of bucket.entries) {
        const { config } = billingFor(e.propertyId);
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

        // Pass-through processing cost: prefer what the gateway actually charged us,
        // then the property's assigned gateway schedule, then the configured percentage.
        // Never commissionable.
        const pfEnabled = !!config?.payment_facilitator_enabled;
        let fee = 0;
        if (e.settlement === "rol" && pfEnabled) {
          if (e.gatewayFee != null) {
            fee = round2(e.gatewayFee);
          } else {
            const { schedule, volume } = await gatewayScheduleFor(e.propertyId);
            if (isBillableScheduleSource(schedule.source)) {
              fee = getEffectiveBillingRate(schedule.config, e.gross, volume, schedule.overrides).amount_charged;
            } else {
              const pfRate = num(config?.transaction_fee_percentage ?? globalTxFee);
              fee = round2(e.gross * (pfRate / 100));
            }
          }
        }



        grossAmount += e.gross;
        if (e.settlement === "byo") {
          byoGross += e.gross;
          byoCommission += commission.amount;
        } else {
          rolGross += e.gross;
          rolCommission += commission.amount;
          txFees += fee;
        }
        if (type === "external") otaCommission += commission.amount;
        bookingIds.add(String(e.booking.id));

        lines.push({
          property_id: e.propertyId,
          property_name: e.propertyName,
          line_kind: "booking",
          line_date: e.txDate ? String(e.txDate).slice(0, 10) : null,
          booking_id: String(e.booking.id),
          payment_transaction_id: e.txId,
          rol_reference: (e.booking.rol_reference as string) || null,
          description: `${e.booking.guest_name || "Guest"} · ${e.propertyName}`,
          guest_name: (e.booking.guest_name as string) || null,
          check_in_date: (e.booking.check_in_date as string) || null,
          check_out_date: (e.booking.check_out_date as string) || null,
          settlement_route: e.settlement,
          commission_type: commission.type,
          gross_amount: round2(e.gross),
          commission_rate: round2(commission.rate),
          commission_amount: round2(commission.amount),
          fee_amount: fee,
          net_amount: round2(
            e.settlement === "byo" ? 0 : e.gross - commission.amount - fee,
          ),
          is_recoverable: e.settlement === "byo",
          source_kind: e.txId ? "gateway" : "booking",
          source_id: e.txId ?? String(e.booking.id),
        });
      }

      /* Recoveries are deliberately NOT on this statement any more:
         - commission on own-gateway bookings, and
         - subscriptions / platform / one-off charges
         are billed on the separate ROL property invoice and subscription plans.
         The statement only settles money ROL actually holds. */

      const recurringFees = 0;
      const openingBalance = 0;

      // ROL receives the full guest payment; commission and the processing fee are
      // recovered on the ROL charges invoice below, not netted off up front.
      const amountHeld = round2(rolGross);
      const invoiceSubtotalRaw = round2(rolCommission + txFees);
      const invoiceSubtotal = vatEnabled
        ? round2(invoiceSubtotalRaw / (1 + vatRate / 100))
        : invoiceSubtotalRaw;
      const invoiceVat = vatEnabled ? round2(invoiceSubtotalRaw - invoiceSubtotal) : 0;
      const invoiceTotal = invoiceSubtotalRaw;

      // Net payable = gross received less the ROL charges invoice.
      const netPayable = Math.max(0, round2(amountHeld - invoiceTotal - openingBalance));
      const carryForward = 0;


      built.push({
        key,
        lines,
        statement: {
          group_kind: bucket.kind,
          portfolio_id: bucket.portfolioId,
          property_id: bucket.propertyId,
          group_name: bucket.name,
          owner_email: bucket.ownerEmail,
          period_start: periodStart,
          period_end: periodEnd,
          payout_mode: bucket.payoutMode,
          currency: "ZAR",
          gross_amount: round2(grossAmount),
          rol_gross: round2(rolGross),
          byo_gross: round2(byoGross),
          rol_commission: round2(rolCommission),
          byo_commission: round2(byoCommission),
          ota_commission: round2(otaCommission),
          transaction_fees: round2(txFees),
          recurring_fees: round2(recurringFees),
          other_recoveries: 0,
          adjustments: 0,
          invoice_subtotal: invoiceSubtotal,
          invoice_vat: invoiceVat,
          invoice_total: invoiceTotal,
          vat_rate: vatRate,
          opening_balance: openingBalance,
          amount_held: amountHeld,
          net_payable: netPayable,
          carry_forward: carryForward,
          booking_count: bookingIds.size,
          status: "draft",
          created_by: user.id,
        },
      });
    }

    if (action === "preview") {
      return json({
        success: true,
        data: {
          statements: built.map((b) => ({ ...b.statement, line_count: b.lines.length })),
          skipped_claimed: entries.length - usable.length,
          pending_clearance_count: pendingClearance.length,
          pending_clearance_amount: round2(
            pendingClearance.reduce((sum, e) => sum + num(e.gross), 0),
          ),
          clearance_hours: CLEARANCE_HOURS,

        },
      });
    }

    /* ---------------- 6. persist drafts ------------------------------- */
    const created: Record<string, unknown>[] = [];
    for (const b of built) {
      const st = b.statement as Record<string, any>;
      // Rebuild only drafts — finalised statements are immutable.
      const existingQuery = supabase
        .from("property_payout_statements")
        .select("id, status")
        .eq("period_start", periodStart)
        .eq("period_end", periodEnd)
        .neq("status", "void");
      const { data: existing } = st.portfolio_id
        ? await existingQuery.eq("portfolio_id", st.portfolio_id)
        : await existingQuery.eq("property_id", st.property_id);

      const locked = (existing || []).find((e: Record<string, any>) => e.status !== "draft");
      if (locked) {
        created.push({ ...st, skipped: true, reason: "already finalised" });
        continue;
      }
      const draft = (existing || []).find((e: Record<string, any>) => e.status === "draft");
      if (draft) {
        await supabase.from("property_payout_statement_lines").delete().eq("statement_id", draft.id);
        await supabase.from("property_payout_statements").delete().eq("id", draft.id);
      }

      const { data: inserted, error: insErr } = await supabase
        .from("property_payout_statements")
        .insert(st)
        .select()
        .single();
      if (insErr) throw insErr;

      const lineRows = b.lines.map((l) => ({ ...l, statement_id: inserted.id }));
      if (lineRows.length > 0) {
        const { error: lineErr } = await supabase
          .from("property_payout_statement_lines")
          .insert(lineRows);
        if (lineErr) throw lineErr;
      }
      created.push(inserted);
    }

    return json({
      success: true,
      data: {
        statements: created,
        pending_clearance_count: pendingClearance.length,
        pending_clearance_amount: round2(
          pendingClearance.reduce((sum, e) => sum + num(e.gross), 0),
        ),
        clearance_hours: CLEARANCE_HOURS,
      },
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[payout-statements] failed:", message);
    return json({ success: false, error: message }, 500);
  }
});

/* ------------------------------------------------------------------ */
/* Finalise / mark paid / void                                        */
/* ------------------------------------------------------------------ */

// deno-lint-ignore no-explicit-any
async function finalise(supabase: any, body: Json, userId: string): Promise<Response> {
  const id = String(body.statement_id || "");
  if (!id) return json({ success: false, error: "statement_id is required" }, 400);

  const { data: statement, error } = await supabase
    .from("property_payout_statements")
    .select("*")
    .eq("id", id)
    .single();
  if (error || !statement) return json({ success: false, error: "Statement not found" }, 404);
  if (statement.status !== "draft") {
    return json({ success: false, error: `Statement is already ${statement.status}` }, 400);
  }

  const code = groupCode(statement.group_name);
  const period = periodKey(statement.period_start);
  const mint = async (kind: string) => {
    const { data, error: refErr } = await supabase.rpc("next_payout_reference", {
      _kind: kind,
      _group_code: code,
      _period: period,
    });
    if (refErr) throw refErr;
    return data as string;
  };

  const statementReference = await mint("statement");
  const invoiceReference = await mint("invoice");

  // Build the bank payment lines from the property-level net on the statement.
  const { data: lines } = await supabase
    .from("property_payout_statement_lines")
    .select("property_id, property_name, net_amount, line_kind")
    .eq("statement_id", id);

  const netByProperty = new Map<string, { name: string; net: number }>();
  (lines || []).forEach((l: Record<string, any>) => {
    if (l.line_kind !== "booking" || !l.property_id) return;
    const cur = netByProperty.get(l.property_id) ?? { name: l.property_name || "Property", net: 0 };
    cur.net += num(l.net_amount);
    netByProperty.set(l.property_id, cur);
  });

  const propertyIds = Array.from(netByProperty.keys());
  const { data: banks } = propertyIds.length
    ? await supabase.from("property_bank_details").select("*").in("property_id", propertyIds)
    : { data: [] };
  const bankByProperty = new Map<string, Record<string, any>>();
  (banks || []).forEach((b: Record<string, any>) => bankByProperty.set(b.property_id, b));

  const payments: Record<string, unknown>[] = [];
  let primaryReference: string | null = null;

  if (statement.payout_mode === "split" && propertyIds.length > 0) {
    // Deductions come off the largest property first so the totals still reconcile.
    const totalNetLines = round2(
      Array.from(netByProperty.values()).reduce((sum, p) => sum + num(p.net), 0),
    );
    const deduction = Math.max(0, round2(totalNetLines - num(statement.net_payable)));
    const ordered = propertyIds
      .map((pid) => ({ pid, ...netByProperty.get(pid)! }))
      .sort((a, b) => b.net - a.net);
    let remaining = deduction;
    for (const p of ordered) {
      const take = Math.min(Math.max(0, remaining), p.net);
      remaining = round2(remaining - take);
      const amount = round2(p.net - take);
      if (amount <= 0) continue;
      const ref = await mint("payment");
      if (!primaryReference) primaryReference = ref;
      const bank = bankByProperty.get(p.pid);
      payments.push({
        statement_id: id,
        property_id: p.pid,
        beneficiary_name: bank?.account_holder || p.name,
        bank_name: bank?.bank_name || null,
        branch_code: bank?.branch_code || null,
        account_number_masked: bank?.account_number_masked || null,
        account_type: bank?.account_type || null,
        amount,
        currency: statement.currency,
        payment_reference: ref,
        status: "pending",
      });
    }
  } else if (statement.net_payable > 0) {
    const ref = await mint("payment");
    primaryReference = ref;
    const anchorId = statement.property_id || propertyIds[0] || null;
    const bank = anchorId ? bankByProperty.get(anchorId) : null;
    payments.push({
      statement_id: id,
      property_id: statement.property_id,
      beneficiary_name: bank?.account_holder || statement.group_name,
      bank_name: bank?.bank_name || null,
      branch_code: bank?.branch_code || null,
      account_number_masked: bank?.account_number_masked || null,
      account_type: bank?.account_type || null,
      amount: round2(statement.net_payable),
      currency: statement.currency,
      payment_reference: ref,
      status: "pending",
    });
  }

  if (payments.length > 0) {
    const { error: payErr } = await supabase
      .from("property_payout_statement_payments")
      .insert(payments);
    if (payErr) throw payErr;
  }

  // Platform charges recovered on this invoice are now invoiced.
  const { data: chargeLines } = await supabase
    .from("property_payout_statement_lines")
    .select("source_id, line_kind")
    .eq("statement_id", id)
    .eq("line_kind", "charge");
  const chargeIds = (chargeLines || [])
    .map((l: Record<string, any>) => l.source_id)
    .filter(Boolean);
  if (chargeIds.length > 0) {
    await supabase
      .from("subscription_charge_items")
      .update({ status: "invoiced", invoiced_at: new Date().toISOString() })
      .in("id", chargeIds);
  }

  const { data: updated, error: updErr } = await supabase
    .from("property_payout_statements")
    .update({
      status: "finalised",
      statement_reference: statementReference,
      invoice_reference: invoiceReference,
      payment_reference: primaryReference,
      finalised_at: new Date().toISOString(),
      finalised_by: userId,
    })
    .eq("id", id)
    .select()
    .single();
  if (updErr) throw updErr;

  return json({ success: true, data: { statement: updated, payments } });
}

// deno-lint-ignore no-explicit-any
async function markPaid(supabase: any, body: Json, userId: string): Promise<Response> {
  const id = String(body.statement_id || "");
  if (!id) return json({ success: false, error: "statement_id is required" }, 400);
  const now = new Date().toISOString();

  const { data: statement } = await supabase
    .from("property_payout_statements")
    .select("status")
    .eq("id", id)
    .single();
  if (!statement) return json({ success: false, error: "Statement not found" }, 404);
  if (statement.status !== "finalised") {
    return json({ success: false, error: "Only a finalised statement can be marked paid" }, 400);
  }

  await supabase
    .from("property_payout_statement_payments")
    .update({ status: "paid", paid_at: now })
    .eq("statement_id", id)
    .eq("status", "pending");

  const { data: updated, error } = await supabase
    .from("property_payout_statements")
    .update({
      status: "paid",
      paid_at: now,
      paid_by: userId,
      bank_payment_reference: body.bank_payment_reference ? String(body.bank_payment_reference) : null,
    })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return json({ success: true, data: { statement: updated } });
}

// deno-lint-ignore no-explicit-any
async function voidStatement(supabase: any, body: Json): Promise<Response> {
  const id = String(body.statement_id || "");
  if (!id) return json({ success: false, error: "statement_id is required" }, 400);
  const { data: updated, error } = await supabase
    .from("property_payout_statements")
    .update({ status: "void", notes: body.reason ? String(body.reason) : null })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return json({ success: true, data: { statement: updated } });
}
