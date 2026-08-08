/**
 * calculate-rep-commissions — the referral commission statement run.
 *
 * Actions:
 *   preview    { period_month }                → what a run would produce (no writes)
 *   generate   { period_month }                → creates/refreshes DRAFT statements
 *   approve    { statement_id }                → locks it and mints the reference
 *   mark_paid  { statement_id, paid_reference? }
 *   void       { statement_id, void_reason? }
 *
 * Draft statements are fully rebuildable. Approved statements are immutable:
 * their revenue, rates and banking are snapshots, so anything that arrives later
 * lands on the next period as an adjustment line.
 *
 * Commissionable revenue = revenue ROL actually earned for the property in the
 * period, excluding every pass-through amount:
 *   · commission on bookings settled through ROL      (payout statement ledger)
 *   · commission recovered on own-gateway/OTA bookings (payout statement ledger)
 *   · paid platform / subscription revenue             (subscription invoices)
 */
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

import { splitInvoiceMargin } from "../_shared/feeMargin.ts";

type Json = Record<string, unknown>;

// deno-lint-ignore no-explicit-any
type Client = any;

const round2 = (n: unknown) => Math.round((Number(n) || 0) * 100) / 100;
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function json(body: Json, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const PAID_INVOICE_STATUSES = ["paid", "settled", "completed"];

/** South African VAT rate applied when a referral partner is a VAT vendor. */
const DEFAULT_VAT_RATE = 15;


/** Platform fallbacks — only used when nothing is configured anywhere. */
const TIER_FALLBACKS: Record<string, { first_year_rate: number; residual_rate: number }> = {
  base: { first_year_rate: 20, residual_rate: 5 },
  accelerated: { first_year_rate: 25, residual_rate: 7.5 },
  elite: { first_year_rate: 30, residual_rate: 10 },
};

interface ResolvedTerms {
  tier: string;
  tier_label: string;
  first_year_rate: number;
  residual_rate: number;
  residual_months: number;
  clawback_days: number;
  source: string;
}

/**
 * One cascade for the whole platform:
 * referral override → rep tier criteria → billing global defaults → constants.
 */
function resolveTerms(
  repTier: string | null | undefined,
  globals: Record<string, unknown> | null,
  referral: Record<string, unknown> | null,
): ResolvedTerms {
  const tier = ["accelerated", "elite"].includes(String(repTier || "base").toLowerCase())
    ? String(repTier).toLowerCase()
    : "base";
  const criteria = (globals?.sales_rep_tier_criteria_json ?? null) as
    | Record<string, { first_year_rate?: number; residual_rate?: number }>
    | null;
  const tierRow = criteria?.[tier];

  const overrideFirst = num(referral?.first_year_rate_override);
  const overrideResidual = num(referral?.residual_rate_override);
  const overrideMonths = num(referral?.residual_months_override);

  const tierFirst = num(tierRow?.first_year_rate);
  const tierResidual = num(tierRow?.residual_rate);
  const globalFirst = num(globals?.referral_first_year_rate);
  const globalResidual = num(globals?.referral_residual_rate);

  const first_year_rate =
    overrideFirst ?? tierFirst ?? globalFirst ?? TIER_FALLBACKS[tier].first_year_rate;
  const residual_rate =
    overrideResidual ?? tierResidual ?? globalResidual ?? TIER_FALLBACKS[tier].residual_rate;
  const residual_months = overrideMonths ?? num(globals?.referral_residual_months) ?? 24;
  const clawback_days = num(globals?.referral_clawback_days) ?? 90;

  const source =
    overrideFirst != null || overrideResidual != null
      ? "referral_override"
      : tierFirst != null || tierResidual != null
        ? "tier_criteria"
        : globalFirst != null || globalResidual != null
          ? "global_default"
          : "constant";

  return {
    tier,
    tier_label: tier.charAt(0).toUpperCase() + tier.slice(1),
    first_year_rate,
    residual_rate,
    residual_months,
    clawback_days,
    source,
  };
}

function monthBounds(periodMonth: string) {
  const d = new Date(`${periodMonth.slice(0, 7)}-01T00:00:00Z`);
  const start = d.toISOString().slice(0, 10);
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
  return { start, end, key: `${periodMonth.slice(0, 7)}-01` };
}

function monthsBetween(fromIso: string, toIso: string): number {
  const a = new Date(fromIso);
  const b = new Date(toIso);
  return (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
}

interface RevenueBreakdown {
  booking_commission: number;
  booking_count: number;
  recovered_commission: number;
  /** Paid subscription revenue — shown for transparency, never commissionable. */
  subscription_revenue: number;
  /** Paid upfront setup-fee revenue — shown for transparency, never commissionable. */
  setup_revenue: number;
  /** Portion of subscription/setup revenue that only recovers a third-party cost. */
  passthrough_revenue: number;
}


interface PreviewLine {
  rep_id: string;
  property_id: string | null;
  property_name: string;
  referral_id: string | null;
  referral_started_on: string | null;
  line_kind: "commission" | "clawback";
  commission_type: string;
  rate_applied: number;
  rate_source: string;
  base_revenue: number;
  amount: number;
  revenue_breakdown: RevenueBreakdown | Json;
  description: string | null;
}

interface PreviewStatement {
  rep_id: string;
  rep_name: string;
  rep_code: string | null;
  rep_email: string | null;
  rep_tier: string;
  terms: ResolvedTerms;
  bank: Json;
  /** Partner tax identity frozen onto the statement — SARS position at issue. */
  tax: Json;
  /** VAT added on top of the commission when the partner is a VAT vendor. */
  vat_amount: number;

  lines: PreviewLine[];
  total_revenue: number;
  gross_commission: number;
  adjustments_total: number;
  net_payable: number;
  property_count: number;
}

/* ------------------------------------------------------------------ */
/* Calculation                                                         */
/* ------------------------------------------------------------------ */

async function calculate(supabase: Client, periodMonth: string): Promise<PreviewStatement[]> {
  const { start, end } = monthBounds(periodMonth);

  const [{ data: globalRows }, { data: referrals }] = await Promise.all([
    supabase
      .from("billing_global_defaults")
      .select(
        "referral_first_year_rate, referral_residual_rate, referral_residual_months, referral_clawback_days, sales_rep_tier_criteria_json",
      ),
    supabase
      .from("property_referrals")
      .select(
        "id, property_id, rep_id, status, referral_date, converted_at, clawback_until, first_year_rate_override, residual_rate_override, residual_months_override",
      )
      .in("status", ["converted", "churned"]),
  ]);

  const globals =
    ((globalRows || []) as Record<string, unknown>[]).find((r) => r.referral_first_year_rate != null) ||
    ((globalRows || []) as Record<string, unknown>[])[0] ||
    null;

  if (!referrals || referrals.length === 0) return [];

  const repIds = [...new Set(referrals.map((r: Record<string, unknown>) => r.rep_id as string))];
  const propertyIds = [
    ...new Set(referrals.map((r: Record<string, unknown>) => r.property_id as string).filter(Boolean)),
  ];

  const [{ data: reps }, { data: banks }, { data: properties }, { data: payoutLines }, { data: subInvoices }] =
    await Promise.all([
      supabase
        .from("sales_reps")
        .select(
          "id, display_name, rep_code, email, commission_tier, is_active, entity_type, trading_name, tax_reference_number, vat_registered, vat_number",
        )
        .in("id", repIds),

      supabase
        .from("sales_rep_bank_details")
        .select("rep_id, bank_name, branch_code, account_holder, account_number_masked, account_type, is_verified")
        .in("rep_id", repIds),
      supabase.from("properties").select("id, name").in("id", propertyIds.length ? propertyIds : ["00000000-0000-0000-0000-000000000000"]),
      supabase
        .from("property_payout_statement_lines")
        .select(
          "property_id, line_kind, commission_amount, booking_id, property_payout_statements!inner(status, period_start, period_end)",
        )
        .in("property_id", propertyIds.length ? propertyIds : ["00000000-0000-0000-0000-000000000000"])
        .in("line_kind", ["booking", "recovery"])
        .neq("property_payout_statements.status", "void")
        .gte("property_payout_statements.period_start", start)
        .lte("property_payout_statements.period_end", end),
      supabase
        .from("subscription_invoices")
        .select("property_id, amount, status, period_start, paid_at, invoice_kind, line_items")

        .in("property_id", propertyIds.length ? propertyIds : ["00000000-0000-0000-0000-000000000000"])
        .in("status", PAID_INVOICE_STATUSES)
        .gte("period_start", start)
        .lte("period_start", end),
    ]);

  const repMap = new Map((reps || []).map((r: Record<string, unknown>) => [r.id as string, r]));
  const bankMap = new Map((banks || []).map((b: Record<string, unknown>) => [b.rep_id as string, b]));
  const propertyMap = new Map((properties || []).map((p: Record<string, unknown>) => [p.id as string, p.name as string]));

  // Revenue per property
  const revenue = new Map<string, RevenueBreakdown>();
  const bump = (propertyId: string): RevenueBreakdown => {
    const existing = revenue.get(propertyId) ?? {
      booking_commission: 0,
      booking_count: 0,
      recovered_commission: 0,
      subscription_revenue: 0,
      setup_revenue: 0,
      passthrough_revenue: 0,
    };
    revenue.set(propertyId, existing);
    return existing;
  };

  ((payoutLines || []) as Record<string, unknown>[]).forEach((l) => {
    const propertyId = l.property_id as string | null;
    if (!propertyId) return;
    const bucket = bump(propertyId);
    const commission = Number(l.commission_amount) || 0;
    if (commission === 0) return;
    if (l.line_kind === "booking") {
      bucket.booking_commission += commission;
      bucket.booking_count += 1;
    } else {
      bucket.recovered_commission += commission;
    }
  });

  // Subscription & setup revenue is reported for transparency only — rep
  // commission is earned on booking commission, never on platform fees or
  // pass-through third-party costs.
  ((subInvoices || []) as Record<string, unknown>[]).forEach((inv) => {
    const propertyId = inv.property_id as string | null;
    if (!propertyId) return;
    const bucket = bump(propertyId);
    const amount = Number(inv.amount) || 0;
    const split = splitInvoiceMargin(
      inv.line_items as Array<{ kind?: string | null; amount?: number | null }> | null,
      amount,
    );
    if (String(inv.invoice_kind) === "setup") bucket.setup_revenue += amount;
    else bucket.subscription_revenue += amount;
    bucket.passthrough_revenue += split.passthrough;
  });


  // Prior reversals, so a clawback is never applied twice
  const { data: priorClawbacks } = await supabase
    .from("rep_commission_entries")
    .select("referral_id")
    .eq("line_kind", "clawback")
    .in("rep_id", repIds);
  const clawedBack = new Set(
    ((priorClawbacks || []) as Record<string, unknown>[]).map((r) => r.referral_id as string),
  );

  const byRep = new Map<string, PreviewStatement>();

  for (const referral of referrals as Record<string, unknown>[]) {
    const rep = repMap.get(referral.rep_id as string);
    if (!rep || !rep.is_active) continue;

    const terms = resolveTerms(rep.commission_tier as string, globals, referral);
    const propertyId = referral.property_id as string;
    const propertyName = propertyMap.get(propertyId) || "Unknown property";
    const startedOn = (referral.converted_at as string | null) || (referral.referral_date as string);

    const statement =
      byRep.get(rep.id as string) ??
      ({
        rep_id: rep.id as string,
        rep_name: (rep.display_name as string) || "Referral partner",
        rep_code: (rep.rep_code as string) || null,
        rep_email: (rep.email as string) || null,
        rep_tier: terms.tier,
        terms,
        bank: (bankMap.get(rep.id as string) as Json) || {},
        tax: {
          entity_type: (rep.entity_type as string) || "individual",
          legal_name: (rep.display_name as string) || null,
          trading_name: (rep.trading_name as string) || null,
          tax_reference_number: (rep.tax_reference_number as string) || null,
          vat_registered: !!rep.vat_registered,
          vat_number: (rep.vat_number as string) || null,
          vat_rate: DEFAULT_VAT_RATE,
        } as Json,
        vat_amount: 0,

        lines: [],
        total_revenue: 0,
        gross_commission: 0,
        adjustments_total: 0,
        net_payable: 0,
        property_count: 0,
      } as PreviewStatement);
    byRep.set(rep.id as string, statement);

    /* ---- churned inside the clawback window → reverse what was paid ---- */
    if (referral.status === "churned") {
      const clawbackUntil = referral.clawback_until as string | null;
      const inWindow = clawbackUntil ? new Date(clawbackUntil) >= new Date(start) : false;
      if (inWindow && !clawedBack.has(referral.id as string)) {
        const { data: earned } = await supabase
          .from("rep_commission_entries")
          .select("amount, status")
          .eq("referral_id", referral.id)
          .eq("line_kind", "commission")
          .in("status", ["approved", "paid"]);
        const total = ((earned || []) as Record<string, unknown>[]).reduce(
          (s, e) => s + (Number(e.amount) || 0),
          0,
        );
        if (total > 0) {
          statement.lines.push({
            rep_id: rep.id as string,
            property_id: propertyId,
            property_name: propertyName,
            referral_id: referral.id as string,
            referral_started_on: startedOn,
            line_kind: "clawback",
            commission_type: "residual",
            rate_applied: 0,
            rate_source: terms.source,
            base_revenue: 0,
            amount: -round2(total),
            revenue_breakdown: {},
            description: `Clawback — ${propertyName} churned within the ${terms.clawback_days}-day window`,
          });
        }
      }
      continue;
    }

    /* ---- entitlement window ---- */
    const monthsSince = monthsBetween(startedOn, start);
    const isFirstYear = monthsSince < 12;
    if (!isFirstYear && monthsSince >= terms.residual_months) continue;

    const rate = isFirstYear ? terms.first_year_rate : terms.residual_rate;
    const breakdown = revenue.get(propertyId);
    // Commissionable base = booking commission only. Setup fees and monthly
    // subscriptions are billed and settled separately and are not commissionable.
    const baseRevenue = round2(
      (breakdown?.booking_commission || 0) + (breakdown?.recovered_commission || 0),
    );
    const reportedPlatformRevenue = round2(
      (breakdown?.subscription_revenue || 0) + (breakdown?.setup_revenue || 0),
    );
    if (baseRevenue <= 0 && reportedPlatformRevenue <= 0) continue;

    statement.lines.push({
      rep_id: rep.id as string,
      property_id: propertyId,
      property_name: propertyName,
      referral_id: referral.id as string,
      referral_started_on: startedOn,
      line_kind: "commission",
      commission_type: isFirstYear ? "first_year" : "residual",
      rate_applied: rate,
      rate_source: terms.source,
      base_revenue: baseRevenue,
      amount: round2(baseRevenue * (rate / 100)),
      revenue_breakdown: {
        booking_commission: round2(breakdown?.booking_commission || 0),
        booking_count: breakdown?.booking_count || 0,
        recovered_commission: round2(breakdown?.recovered_commission || 0),
        subscription_revenue: round2(breakdown?.subscription_revenue || 0),
        setup_revenue: round2(breakdown?.setup_revenue || 0),
        passthrough_revenue: round2(breakdown?.passthrough_revenue || 0),
      },

      description: null,
    });
  }

  // Totals
  const statements = [...byRep.values()].filter((s) => s.lines.length > 0);
  statements.forEach((s) => {
    const commission = s.lines.filter((l) => l.line_kind === "commission");
    const adjustments = s.lines.filter((l) => l.line_kind !== "commission");
    s.total_revenue = round2(commission.reduce((t, l) => t + l.base_revenue, 0));
    s.gross_commission = round2(commission.reduce((t, l) => t + l.amount, 0));
    s.adjustments_total = round2(adjustments.reduce((t, l) => t + l.amount, 0));
    s.net_payable = round2(s.gross_commission + s.adjustments_total);
    s.property_count = new Set(commission.map((l) => l.property_id)).size;
    // Commission is VAT-exclusive: a VAT-vendor partner adds VAT on top.
    const tax = (s.tax || {}) as Record<string, unknown>;
    s.vat_amount = tax.vat_registered
      ? round2(s.net_payable * ((Number(tax.vat_rate) || DEFAULT_VAT_RATE) / 100))
      : 0;
  });


  return statements.sort((a, b) => b.net_payable - a.net_payable);
}

/* ------------------------------------------------------------------ */
/* Actions                                                             */
/* ------------------------------------------------------------------ */

async function generate(supabase: Client, periodMonth: string): Promise<Response> {
  const { start, end, key } = monthBounds(periodMonth);
  const statements = await calculate(supabase, periodMonth);
  let written = 0;

  for (const s of statements) {
    const { data: existing } = await supabase
      .from("rep_commission_reports")
      .select("id, status")
      .eq("rep_id", s.rep_id)
      .eq("period_month", key)
      .maybeSingle();

    if (existing && !["draft", "pending_approval"].includes(existing.status)) continue; // locked

    const payload = {
      rep_id: s.rep_id,
      period_month: key,
      period_start: start,
      period_end: end,
      total_entries: s.lines.length,
      property_count: s.property_count,
      total_revenue: s.total_revenue,
      gross_commission: s.gross_commission,
      adjustments_total: s.adjustments_total,
      net_payable: s.net_payable,
      total_amount: s.net_payable,
      bank_snapshot: s.bank,
      terms_snapshot: s.terms,
      tax_snapshot: s.tax,
      vat_amount: s.vat_amount,

      status: "pending_approval",
      generated_at: new Date().toISOString(),
    };

    let reportId = existing?.id as string | undefined;
    if (reportId) {
      await supabase.from("rep_commission_reports").update(payload).eq("id", reportId);
      // Rebuild engine-owned lines; manual adjustments captured by an admin stay.
      await supabase
        .from("rep_commission_entries")
        .delete()
        .eq("report_id", reportId)
        .in("line_kind", ["commission", "clawback"]);
    } else {
      const { data: inserted, error } = await supabase
        .from("rep_commission_reports")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw error;
      reportId = inserted.id as string;
    }

    const rows = s.lines.map((l) => ({
      report_id: reportId,
      rep_id: l.rep_id,
      property_id: l.property_id,
      referral_id: l.referral_id,
      period_start: start,
      period_end: end,
      base_revenue: l.base_revenue,
      commission_type: l.commission_type,
      rate_applied: l.rate_applied,
      rate_source: l.rate_source,
      amount: l.amount,
      line_kind: l.line_kind,
      revenue_breakdown: l.revenue_breakdown,
      description: l.description,
      referral_started_on: l.referral_started_on,
      status: "pending",
      clawback_reason: l.line_kind === "clawback" ? l.description : null,
    }));
    if (rows.length > 0) {
      const { error: lineError } = await supabase.from("rep_commission_entries").insert(rows);
      if (lineError) throw lineError;
    }

    // Manual adjustments already on the statement change the totals
    await refreshTotals(supabase, reportId!);
    written += 1;
  }

  return json({ success: true, statements: written, period_month: key });
}

/** Recompute a draft statement's totals from its lines. */
async function refreshTotals(supabase: Client, reportId: string): Promise<void> {
  const { data: lines } = await supabase
    .from("rep_commission_entries")
    .select("base_revenue, amount, line_kind, property_id")
    .eq("report_id", reportId);

  const rows = (lines || []) as Record<string, unknown>[];
  const commission = rows.filter((l) => l.line_kind === "commission");
  const adjustments = rows.filter((l) => l.line_kind !== "commission");
  const gross = round2(commission.reduce((t, l) => t + (Number(l.amount) || 0), 0));
  const adjustmentsTotal = round2(adjustments.reduce((t, l) => t + (Number(l.amount) || 0), 0));

  await supabase
    .from("rep_commission_reports")
    .update({
      total_entries: rows.length,
      property_count: new Set(commission.map((l) => l.property_id).filter(Boolean)).size,
      total_revenue: round2(commission.reduce((t, l) => t + (Number(l.base_revenue) || 0), 0)),
      gross_commission: gross,
      adjustments_total: adjustmentsTotal,
      net_payable: round2(gross + adjustmentsTotal),
      total_amount: round2(gross + adjustmentsTotal),
    })
    .eq("id", reportId);
}

async function approve(supabase: Client, body: Json, userId: string): Promise<Response> {
  const statementId = String(body.statement_id || "");
  if (!statementId) return json({ success: false, error: "statement_id is required" }, 400);

  const { data: statement, error } = await supabase
    .from("rep_commission_reports")
    .select("id, rep_id, status, period_month, statement_reference, sales_reps(rep_code)")
    .eq("id", statementId)
    .single();
  if (error || !statement) return json({ success: false, error: "Statement not found" }, 404);
  if (!["draft", "pending_approval"].includes(statement.status)) {
    return json({ success: false, error: `Statement is already ${statement.status}` }, 409);
  }

  await refreshTotals(supabase, statementId);

  let reference = statement.statement_reference as string | null;
  if (!reference) {
    const { data: minted, error: refError } = await supabase.rpc("next_commission_statement_reference", {
      _rep_code: statement.sales_reps?.rep_code || "REP",
      _period_month: statement.period_month,
    });
    if (refError) throw refError;
    reference = minted as string;
  }

  const now = new Date().toISOString();
  await supabase
    .from("rep_commission_reports")
    .update({
      status: "approved",
      statement_reference: reference,
      approved_by: userId,
      approved_at: now,
      finalized_at: now,
      finalized_by: userId,
    })
    .eq("id", statementId);

  await supabase
    .from("rep_commission_entries")
    .update({ status: "approved" })
    .eq("report_id", statementId)
    .eq("line_kind", "commission");

  return json({ success: true, statement_reference: reference });
}

async function markPaid(supabase: Client, body: Json): Promise<Response> {
  const statementId = String(body.statement_id || "");
  if (!statementId) return json({ success: false, error: "statement_id is required" }, 400);

  const { data: statement } = await supabase
    .from("rep_commission_reports")
    .select("id, status, statement_reference")
    .eq("id", statementId)
    .single();
  if (!statement) return json({ success: false, error: "Statement not found" }, 404);
  if (statement.status !== "approved") {
    return json({ success: false, error: "Approve the statement before marking it paid" }, 409);
  }

  await supabase
    .from("rep_commission_reports")
    .update({
      status: "paid",
      paid_at: body.paid_at ? String(body.paid_at) : new Date().toISOString(),
      paid_reference: String(body.paid_reference || statement.statement_reference || ""),
    })
    .eq("id", statementId);

  await supabase
    .from("rep_commission_entries")
    .update({ status: "paid" })
    .eq("report_id", statementId)
    .eq("line_kind", "commission");

  return json({ success: true });
}

async function voidStatement(supabase: Client, body: Json): Promise<Response> {
  const statementId = String(body.statement_id || "");
  if (!statementId) return json({ success: false, error: "statement_id is required" }, 400);
  await supabase
    .from("rep_commission_reports")
    .update({ status: "void", void_reason: String(body.void_reason || "Voided by admin") })
    .eq("id", statementId);
  return json({ success: true });
}

/* ------------------------------------------------------------------ */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    const isServiceCall = token === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    let userId = "system";
    if (!isServiceCall) {
      if (!token) return json({ success: false, error: "Missing authorization header" }, 401);
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser(token);
      if (authError || !user) return json({ success: false, error: "Invalid token" }, 401);

      const { data: roleRows } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
      const roles = (roleRows || []).map((r: { role: string }) => r.role);
      if (!roles.some((r) => ["admin", "dev", "fearless_leader"].includes(r))) {
        return json({ success: false, error: "Requires admin, dev or fearless_leader role" }, 403);
      }
      userId = user.id;
    }

    const body = (await req.json().catch(() => ({}))) as Json;
    const action = String(body.action || "generate");
    console.log(`[rep-commissions] ${action} by ${userId}`);

    if (action === "approve") return await approve(supabase, body, userId);
    if (action === "mark_paid") return await markPaid(supabase, body);
    if (action === "void") return await voidStatement(supabase, body);

    const now = new Date();
    const periodMonth = String(
      body.period_month ||
        new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString().slice(0, 10),
    );

    if (action === "preview") {
      const statements = await calculate(supabase, periodMonth);
      const { start, end } = monthBounds(periodMonth);
      return json({
        success: true,
        period_month: monthBounds(periodMonth).key,
        period_start: start,
        period_end: end,
        statements: statements as unknown as Json[],
      });
    }

    return await generate(supabase, periodMonth);
  } catch (error: unknown) {
    console.error("[rep-commissions] failed", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return json({ success: false, error: message }, 500);
  }
});
