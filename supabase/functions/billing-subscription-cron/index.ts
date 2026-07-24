// Daily cron: create pending subscription invoices + send reminder emails.
// Runs at 06:00 UTC. Handles:
//  - New activation when billing_start_date reached and status='pending'
//  - Renewal reminder 5 days before current_period_end
//  - Marks past_due after current_period_end lapses without payment
//  - Resends reminder every 3 days for still-pending invoices (max 5)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SITE_URL = Deno.env.get("SITE_URL") || "https://sleepinafrica.roomsonline.co.za";
const FROM_EMAIL = Deno.env.get("BILLING_FROM_EMAIL") || "Rooms Online <billing@notify.sleepinafrica.roomsonline.co.za>";

type Tier = { min_rooms: number; max_rooms: number | null; monthly_fee: number };

function resolveMonthlyFeeFromTiers(tiers: Tier[] | null | undefined, rooms: number): number {
  if (!tiers || tiers.length === 0) return 0;
  const sorted = [...tiers].sort((a, b) => a.min_rooms - b.min_rooms);
  for (const t of sorted) {
    const max = t.max_rooms == null ? Infinity : t.max_rooms;
    if (rooms >= t.min_rooms && rooms <= max) return Number(t.monthly_fee) || 0;
  }
  return Number(sorted[sorted.length - 1].monthly_fee) || 0;
}

async function getRoomCount(supabase: any, propertyIds: string[]): Promise<number> {
  if (!propertyIds.length) return 0;
  const { data: rooms } = await supabase
    .from("rolos_rooms")
    .select("id, property_id")
    .in("property_id", propertyIds);
  if (rooms && rooms.length > 0) return rooms.length;
  const { data: props } = await supabase
    .from("properties")
    .select("total_units")
    .in("id", propertyIds);
  return (props ?? []).reduce((s: number, p: any) => s + (Number(p.total_units) || 0), 0);
}

async function computeSubscriptionAmount(supabase: any, cfg: any, scope: "property" | "portfolio", entityId: string): Promise<number> {
  // Direct fixed monthly fee wins
  if (cfg.subscription_fee_monthly && Number(cfg.subscription_fee_monthly) > 0) {
    return Number(cfg.subscription_fee_monthly);
  }
  // Resolve tier pricing (property/portfolio override → global default)
  let tiers: Tier[] | null = Array.isArray(cfg.tier_pricing_json) ? cfg.tier_pricing_json : null;
  if (!tiers || tiers.length === 0) {
    const { data: globals } = await supabase
      .from("billing_global_defaults")
      .select("tier_pricing_json")
      .eq("strategy", cfg.billing_strategy || "default")
      .maybeSingle();
    tiers = Array.isArray(globals?.tier_pricing_json) ? globals.tier_pricing_json : null;
  }
  // Determine property list to count rooms
  let propertyIds: string[] = [];
  if (scope === "property") {
    propertyIds = [entityId];
  } else {
    const { data: props } = await supabase.from("properties").select("id").eq("portfolio_id", entityId);
    propertyIds = (props ?? []).map((p: any) => p.id);
  }
  const rooms = cfg.room_count_override ?? await getRoomCount(supabase, propertyIds);
  return resolveMonthlyFeeFromTiers(tiers, rooms);
}

function fmtCurrency(amount: number, currency = "ZAR") {
  return `${currency} ${Number(amount).toFixed(2)}`;
}

function renderEmail({ entityName, amount, currency, periodStart, periodEnd, payUrl, isRenewal }: {
  entityName: string; amount: number; currency: string;
  periodStart: string; periodEnd: string; payUrl: string; isRenewal: boolean;
}) {
  const heading = isRenewal ? "Your Rooms Online subscription renewal is due" : "Activate your Rooms Online subscription";
  const intro = isRenewal
    ? `Your subscription for <strong>${entityName}</strong> renews soon. Please complete payment to keep the account active for the next month.`
    : `Welcome — your subscription for <strong>${entityName}</strong> is ready to start. Please complete your first payment to activate the account.`;
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;background:#fff;padding:24px;color:#1A1A2E">
  <div style="max-width:560px;margin:0 auto;border:1px solid #eee;border-radius:8px;padding:24px">
    <h2 style="color:#E91E8C;margin-top:0">${heading}</h2>
    <p>${intro}</p>
    <table style="width:100%;margin:16px 0;border-collapse:collapse">
      <tr><td style="padding:6px 0;color:#666">Amount</td><td style="padding:6px 0;text-align:right;font-weight:600">${fmtCurrency(amount, currency)}</td></tr>
      <tr><td style="padding:6px 0;color:#666">Period</td><td style="padding:6px 0;text-align:right">${periodStart} → ${periodEnd}</td></tr>
    </table>
    <p style="text-align:center;margin:24px 0">
      <a href="${payUrl}" style="background:#E91E8C;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;display:inline-block;font-weight:600">Pay now</a>
    </p>
    <p style="color:#666;font-size:13px">You can cancel any time from the payment page — no lock-in, no cancellation fee.</p>
    <hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>
    <p style="color:#999;font-size:12px">If the button doesn't work, paste this link into your browser:<br/>${payUrl}</p>
  </div></body></html>`;
}

async function sendReminder(resend: Resend, to: string, subject: string, html: string) {
  try {
    const res = await resend.emails.send({ from: FROM_EMAIL, to, subject, html });
    return { ok: !res.error, id: res.data?.id, error: res.error };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

async function ensureInvoiceAndEmail(supabase: any, resend: Resend, opts: {
  cfg: any; scope: "property" | "portfolio"; entityId: string; entityName: string;
  ownerId: string | null; ownerEmail: string | null; isRenewal: boolean;
}) {
  const { cfg, scope, entityId, entityName, ownerId, ownerEmail, isRenewal } = opts;
  const today = new Date();
  const periodStart = isRenewal && cfg.current_period_end ? new Date(cfg.current_period_end) : today;
  const periodEnd = new Date(periodStart);
  periodEnd.setMonth(periodEnd.getMonth() + 1);
  const psStr = periodStart.toISOString().slice(0, 10);
  const peStr = periodEnd.toISOString().slice(0, 10);

  // Skip if a pending invoice for this period exists already
  const { data: existing } = await supabase
    .from("subscription_invoices")
    .select("id, payfast_token, reminder_count, email_sent_at")
    .eq(scope === "property" ? "property_id" : "portfolio_id", entityId)
    .eq("period_start", psStr)
    .eq("status", "pending")
    .maybeSingle();

  let invoice = existing;
  if (!invoice) {
    const amount = await computeSubscriptionAmount(supabase, cfg, scope, entityId);
    if (!amount || amount <= 0) {
      console.log(`[cron] Skip ${scope} ${entityId}: amount is zero`);
      return { skipped: true, reason: "zero_amount" };
    }
    const insert: any = {
      amount, currency: "ZAR",
      period_start: psStr, period_end: peStr,
      status: "pending",
      invoice_kind: isRenewal ? "renewal" : "activation",
      owner_id: ownerId,
    };
    insert[scope === "property" ? "property_id" : "portfolio_id"] = entityId;
    const { data: created, error: crErr } = await supabase.from("subscription_invoices").insert(insert).select("id, payfast_token, reminder_count, email_sent_at").single();
    if (crErr) { console.error("[cron] insert error:", crErr); return { error: crErr }; }
    invoice = created;
  } else {
    // Throttle: only re-send every 3 days, max 5 reminders
    if (invoice.reminder_count >= 5) return { skipped: true, reason: "max_reminders" };
    const lastSent = invoice.email_sent_at ? new Date(invoice.email_sent_at) : null;
    if (lastSent) {
      const days = (today.getTime() - lastSent.getTime()) / 86400000;
      if (days < 3) return { skipped: true, reason: "throttled" };
    }
  }

  if (!ownerEmail) return { skipped: true, reason: "no_owner_email", invoice_id: invoice.id };

  const payUrl = `${SITE_URL}/subscribe/pay/${invoice.payfast_token}`;
  const { data: invFull } = await supabase.from("subscription_invoices").select("amount, currency, period_start, period_end").eq("id", invoice.id).single();
  const html = renderEmail({
    entityName,
    amount: Number(invFull?.amount || 0),
    currency: invFull?.currency || "ZAR",
    periodStart: invFull?.period_start || psStr,
    periodEnd: invFull?.period_end || peStr,
    payUrl,
    isRenewal,
  });
  const subject = isRenewal ? `Renew your Rooms Online subscription — ${entityName}` : `Activate your Rooms Online subscription — ${entityName}`;
  const send = await sendReminder(resend, ownerEmail, subject, html);
  await supabase.from("subscription_invoices").update({
    email_sent_at: new Date().toISOString(),
    reminder_count: (invoice.reminder_count || 0) + 1,
  }).eq("id", invoice.id);
  return { sent: send.ok, invoice_id: invoice.id, to: ownerEmail };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const resend = new Resend(resendKey);

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const in5Days = new Date(today); in5Days.setDate(in5Days.getDate() + 5);
  const in5Str = in5Days.toISOString().slice(0, 10);

  const results: any[] = [];

  // 1) Activation reminders — property scope
  const { data: propStart } = await supabase
    .from("property_billing_configs")
    .select("*, properties!inner(id, name, owner_id, owner_email, is_active)")
    .lte("billing_start_date", todayStr)
    .eq("subscription_status", "pending")
    .eq("properties.is_active", true);
  for (const cfg of propStart ?? []) {
    const p = (cfg as any).properties;
    const r = await ensureInvoiceAndEmail(supabase, resend, {
      cfg, scope: "property", entityId: p.id, entityName: p.name,
      ownerId: p.owner_id, ownerEmail: p.owner_email, isRenewal: false,
    });
    results.push({ property_id: p.id, ...r });
  }

  // 2) Activation reminders — portfolio scope
  const { data: portStart } = await supabase
    .from("portfolio_billing_configs")
    .select("*, property_portfolios!inner(id, name, owner_id)")
    .lte("billing_start_date", todayStr)
    .eq("subscription_status", "pending");
  for (const cfg of portStart ?? []) {
    const pf = (cfg as any).property_portfolios;
    let ownerEmail: string | null = null;
    if (pf.owner_id) {
      const { data: prof } = await supabase.from("profiles").select("email").eq("id", pf.owner_id).single();
      ownerEmail = prof?.email ?? null;
    }
    const r = await ensureInvoiceAndEmail(supabase, resend, {
      cfg, scope: "portfolio", entityId: pf.id, entityName: pf.name,
      ownerId: pf.owner_id, ownerEmail, isRenewal: false,
    });
    results.push({ portfolio_id: pf.id, ...r });
  }

  // 3) Renewals — property (within 5 days of current_period_end)
  const { data: propRenew } = await supabase
    .from("property_billing_configs")
    .select("*, properties!inner(id, name, owner_id, owner_email)")
    .eq("subscription_status", "active")
    .lte("current_period_end", in5Str);
  for (const cfg of propRenew ?? []) {
    const p = (cfg as any).properties;
    const r = await ensureInvoiceAndEmail(supabase, resend, {
      cfg, scope: "property", entityId: p.id, entityName: p.name,
      ownerId: p.owner_id, ownerEmail: p.owner_email, isRenewal: true,
    });
    results.push({ property_id: p.id, renewal: true, ...r });
  }

  // 4) Renewals — portfolio
  const { data: portRenew } = await supabase
    .from("portfolio_billing_configs")
    .select("*, property_portfolios!inner(id, name, owner_id)")
    .eq("subscription_status", "active")
    .lte("current_period_end", in5Str);
  for (const cfg of portRenew ?? []) {
    const pf = (cfg as any).property_portfolios;
    let ownerEmail: string | null = null;
    if (pf.owner_id) {
      const { data: prof } = await supabase.from("profiles").select("email").eq("id", pf.owner_id).single();
      ownerEmail = prof?.email ?? null;
    }
    const r = await ensureInvoiceAndEmail(supabase, resend, {
      cfg, scope: "portfolio", entityId: pf.id, entityName: pf.name,
      ownerId: pf.owner_id, ownerEmail, isRenewal: true,
    });
    results.push({ portfolio_id: pf.id, renewal: true, ...r });
  }

  // 5) Mark past_due (property + portfolio)
  await supabase.from("property_billing_configs")
    .update({ subscription_status: "past_due" })
    .eq("subscription_status", "active")
    .lt("current_period_end", todayStr);
  await supabase.from("portfolio_billing_configs")
    .update({ subscription_status: "past_due" })
    .eq("subscription_status", "active")
    .lt("current_period_end", todayStr);

  return new Response(JSON.stringify({ success: true, ran_at: new Date().toISOString(), results }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
