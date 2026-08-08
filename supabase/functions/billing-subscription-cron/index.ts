// Daily cron: create pending subscription invoices + send reminder emails.
// Runs at 06:00 UTC. Handles:
//  - New activation when billing_start_date reached and status='pending'
//  - Renewal reminder 5 days before current_period_end
//  - Marks past_due after current_period_end lapses without payment
//  - Resends reminder every 3 days for still-pending invoices (max 5)

import { createClient } from "npm:@supabase/supabase-js@2";
import { Resend } from "npm:resend@2";
import { getAdminCopyRecipients } from "../_shared/billingAdminRecipients.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SITE_URL = Deno.env.get("SITE_URL") || "https://sleepinafrica.roomsonline.co.za";
const FROM_EMAIL = Deno.env.get("BILLING_FROM_EMAIL") || "Rooms Online <billing@notify.roomsonline.co.za>";

const DEFAULT_FREE_PERIOD_DAYS = 60;

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * The paid subscription clock starts at engagement_date + free_period_days.
 * Legacy configs without an engagement date keep using billing_start_date.
 */
function resolvePaidStart(cfg: any, globalFreeDefault: number): string | null {
  const freeDays = cfg?.free_period_days ?? globalFreeDefault;
  if (cfg?.engagement_date) return addDays(String(cfg.engagement_date), Number(freeDays) || 0);
  return cfg?.billing_start_date ? String(cfg.billing_start_date).slice(0, 10) : null;
}

/** Setup fees are invoiced upfront on contract signature — never bundled monthly. */
function isSetupCharge(kind: string | null | undefined): boolean {
  return !!kind && /setup/i.test(kind);
}

async function getGlobalFreePeriodDefault(supabase: any, strategy: string): Promise<number> {
  const { data } = await supabase
    .from("billing_global_defaults")
    .select("free_period_days_default")
    .eq("strategy", strategy || "default")
    .maybeSingle();
  const v = Number(data?.free_period_days_default);
  return Number.isFinite(v) && v >= 0 ? v : DEFAULT_FREE_PERIOD_DAYS;
}

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
  // A pending plan change takes over the moment its effective date arrives.
  if (cfg.pending_monthly_fee != null && cfg.pending_effective_date) {
    const effective = String(cfg.pending_effective_date).slice(0, 10);
    if (new Date().toISOString().slice(0, 10) >= effective) {
      const pending = Number(cfg.pending_monthly_fee) || 0;
      if (pending > 0) return pending;
    }
  }
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

async function sendReminder(resend: Resend, to: string, subject: string, html: string, cc: string[] = []) {
  try {
    const res = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      ...(cc.length > 0 ? { cc } : {}),
      subject,
      html,
    });
    return { ok: !res.error, id: res.data?.id, error: res.error };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

async function ensureInvoiceAndEmail(supabase: any, resend: Resend, opts: {
  cfg: any; scope: "property" | "portfolio"; entityId: string; entityName: string;
  ownerId: string | null; ownerEmail: string | null; isRenewal: boolean;
  globalFreeDefault: number;
}) {
  const { cfg, scope, entityId, entityName, ownerId, ownerEmail, isRenewal, globalFreeDefault } = opts;
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  // Hard gate: never invoice unless billing has been explicitly switched on.
  if (cfg.billing_enabled !== true) {
    console.log(`[cron] Skip ${scope} ${entityId}: billing_enabled is off`);
    return { skipped: true, reason: "billing_disabled" };
  }

  // Plan changed by admin: the owner must approve and settle the new balance
  // before the subscription renews on the new fee. Existing paid period stands.
  if (cfg.subscription_reset_pending === true && isRenewal) {
    console.log(`[cron] Skip renewal ${scope} ${entityId}: subscription reset pending re-approval`);
    return { skipped: true, reason: "subscription_reset_pending" };
  }

  // Switched off by admin: keep the paid period in force, never renew past it.
  if (cfg.billing_switched_off_at && isRenewal) {
    console.log(`[cron] Skip renewal ${scope} ${entityId}: billing switched off ${cfg.billing_switched_off_at}`);
    return { skipped: true, reason: "billing_switched_off" };
  }


  const paidStart = resolvePaidStart(cfg, globalFreeDefault);
  if (!paidStart) {
    return { skipped: true, reason: "no_engagement_or_billing_start_date" };
  }
  // Free period: the clock runs but nothing is invoiced until it lapses.
  if (!isRenewal && todayStr < paidStart) {
    return { skipped: true, reason: "in_free_period", free_period_ends: paidStart };
  }

  // The first paid period starts the day the free period ends, so the anniversary
  // day stays aligned with the engagement date.
  const periodStart = isRenewal && cfg.current_period_end
    ? new Date(`${String(cfg.current_period_end).slice(0, 10)}T00:00:00Z`)
    : new Date(`${paidStart}T00:00:00Z`);
  const periodEnd = new Date(periodStart);
  periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1);
  const psStr = periodStart.toISOString().slice(0, 10);
  const peStr = periodEnd.toISOString().slice(0, 10);


  const entityCol = scope === "property" ? "property_id" : "portfolio_id";

  // Activation invoices are once-off: if ANY activation invoice already exists
  // (pending or paid) we must never mint another one — this is what caused a new
  // invoice to be created on every daily run. Renewals still de-dupe per period.
  let existingQuery = supabase
    .from("subscription_invoices")
    .select("id, payfast_token, reminder_count, email_sent_at, status")
    .eq(entityCol, entityId);

  existingQuery = isRenewal
    ? existingQuery.eq("period_start", psStr).eq("status", "pending")
    : existingQuery.eq("invoice_kind", "activation").in("status", ["pending", "paid"]);

  const { data: existingRows } = await existingQuery
    .order("created_at", { ascending: false })
    .limit(1);
  const existing = existingRows?.[0] ?? null;

  if (existing && existing.status === "paid") {
    return { skipped: true, reason: "already_paid", invoice_id: existing.id };
  }

  let invoice = existing;
  if (!invoice) {
    const subscriptionAmount = await computeSubscriptionAmount(supabase, cfg, scope, entityId);

    // Pull pending once-off charges for this entity. Setup fees are excluded —
    // those are raised as a standalone upfront invoice on contract signature.
    const chargeCol = entityCol;
    const { data: allPending } = await supabase
      .from("subscription_charge_items")
      .select("id, kind, description, amount, currency")
      .eq(chargeCol, entityId)
      .is("invoiced_at", null)
      .is("invoiced_on_invoice_id", null);
    const pendingCharges = (allPending ?? []).filter((c: any) => !isSetupCharge(c.kind));
    const onceOffAmount = pendingCharges.reduce((s: number, c: any) => s + (Number(c.amount) || 0), 0);

    const total = subscriptionAmount + onceOffAmount;

    if (!total || total <= 0) {
      console.log(`[cron] Skip ${scope} ${entityId}: total is zero`);
      return { skipped: true, reason: "zero_amount" };
    }

    const lineItems: any[] = [];
    if (subscriptionAmount > 0) {
      lineItems.push({
        kind: "monthly_subscription",
        description: `Monthly subscription (${psStr} → ${peStr})`,
        amount: subscriptionAmount,
      });
    }
    for (const c of pendingCharges ?? []) {
      lineItems.push({ kind: c.kind, description: c.description, amount: Number(c.amount) || 0, charge_item_id: c.id });
    }

    const insert: any = {
      amount: total, currency: "ZAR",
      subscription_amount: subscriptionAmount,
      once_off_amount: onceOffAmount,
      line_items: lineItems,
      period_start: psStr, period_end: peStr,
      status: "pending",
      invoice_kind: isRenewal ? "renewal" : "activation",
      owner_id: ownerId,
    };
    insert[entityCol] = entityId;
    const { data: created, error: crErr } = await supabase.from("subscription_invoices").insert(insert).select("id, payfast_token, reminder_count, email_sent_at").single();
    if (crErr) { console.error("[cron] insert error:", crErr); return { error: crErr }; }
    invoice = created;

    // The pending plan has now been invoiced — retire it and lift the scheduled
    // cancellation so the account continues on the new model once paid.
    if (cfg.pending_monthly_fee != null && cfg.pending_effective_date &&
        new Date().toISOString().slice(0, 10) >= String(cfg.pending_effective_date).slice(0, 10)) {
      await supabase
        .from(scope === "property" ? "property_billing_configs" : "portfolio_billing_configs")
        .update({
          pending_monthly_fee: null,
          pending_effective_date: null,
          pending_model_json: null,
          plan_change_reason: null,
          cancel_at_period_end: false,
          cancel_effective_date: null,
          cancelled_at: null,
        })
        .eq(entityCol, entityId);
    }

    // Reserve the charge items against this invoice (invoiced_at set on payment)
    if (pendingCharges && pendingCharges.length > 0) {
      await supabase.from("subscription_charge_items")
        .update({ invoiced_on_invoice_id: created.id })
        .in("id", pendingCharges.map((c: any) => c.id));
    }
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
  const adminCopies = await getAdminCopyRecipients(supabase, ownerEmail);
  const send = await sendReminder(resend, ownerEmail, subject, html, adminCopies);
  await supabase.from("subscription_invoices").update({
    email_sent_at: new Date().toISOString(),
    reminder_count: (invoice.reminder_count || 0) + 1,
  }).eq("id", invoice.id);
  await supabase.from("subscription_invoice_events").insert({
    invoice_id: invoice.id,
    event_type: "email",
    status: send.ok ? "sent" : "error",
    detail: `to:${ownerEmail}${adminCopies.length > 0 ? ` cc:${adminCopies.join(",")}` : ""}`,
  });
  return { sent: send.ok, invoice_id: invoice.id, to: ownerEmail, cc: adminCopies };
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
  const freeDefaultCache = new Map<string, number>();
  const freeDefaultFor = async (strategy: string) => {
    const key = strategy || "default";
    if (!freeDefaultCache.has(key)) {
      freeDefaultCache.set(key, await getGlobalFreePeriodDefault(supabase, key));
    }
    return freeDefaultCache.get(key)!;
  };

  // 1) Activation reminders — property scope. The date gate lives in
  //    ensureInvoiceAndEmail so engagement-date + free-period configs qualify too.
  const { data: propStart } = await supabase
    .from("property_billing_configs")
    .select("*, properties!inner(id, name, owner_id, owner_email, is_active)")
    .eq("billing_enabled", true)
    .eq("subscription_status", "pending")
    .eq("properties.is_active", true);
  for (const cfg of propStart ?? []) {
    const p = (cfg as any).properties;
    const r = await ensureInvoiceAndEmail(supabase, resend, {
      cfg, scope: "property", entityId: p.id, entityName: p.name,
      ownerId: p.owner_id, ownerEmail: p.owner_email, isRenewal: false,
      globalFreeDefault: await freeDefaultFor(cfg.billing_strategy),
    });
    results.push({ property_id: p.id, ...r });
  }

  // 2) Activation reminders — portfolio scope
  const { data: portStart } = await supabase
    .from("portfolio_billing_configs")
    .select("*, property_portfolios!inner(id, name, owner_id)")
    .eq("billing_enabled", true)
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
      globalFreeDefault: await freeDefaultFor(cfg.billing_strategy),
    });
    results.push({ portfolio_id: pf.id, ...r });
  }


  // 3) Renewals — property (within 5 days of current_period_end)
  const { data: propRenew } = await supabase
    .from("property_billing_configs")
    .select("*, properties!inner(id, name, owner_id, owner_email)")
    .eq("billing_enabled", true)
    .eq("subscription_status", "active")
    .eq("cancel_at_period_end", false)
    .lte("current_period_end", in5Str);
  for (const cfg of propRenew ?? []) {
    const p = (cfg as any).properties;
    const r = await ensureInvoiceAndEmail(supabase, resend, {
      cfg, scope: "property", entityId: p.id, entityName: p.name,
      ownerId: p.owner_id, ownerEmail: p.owner_email, isRenewal: true,
      globalFreeDefault: await freeDefaultFor(cfg.billing_strategy),

    });
    results.push({ property_id: p.id, renewal: true, ...r });
  }

  // 4) Renewals — portfolio
  const { data: portRenew } = await supabase
    .from("portfolio_billing_configs")
    .select("*, property_portfolios!inner(id, name, owner_id)")
    .eq("billing_enabled", true)
    .eq("subscription_status", "active")
    .eq("cancel_at_period_end", false)
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
      globalFreeDefault: await freeDefaultFor(cfg.billing_strategy),

    });
    results.push({ portfolio_id: pf.id, renewal: true, ...r });
  }

  // 4b) Upcoming-start reminders — the owner (plus admin / fearless leader / dev)
  //     is reminded that the once-off setup fee and the first monthly
  //     subscription are due, from a week before the first billing date.
  const remindWindowStart = todayStr;
  const remindWindowEnd = addDays(todayStr, 7);
  const notifyDue = async (scope: "property" | "portfolio", entityId: string) => {
    try {
      const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/subscription-billing-actions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({ action: "send_due_reminder", scope, entity_id: entityId }),
      });
      const body = await res.json().catch(() => ({}));
      results.push({ scope, entity_id: entityId, due_reminder: res.ok, detail: body });
    } catch (e) {
      results.push({ scope, entity_id: entityId, due_reminder: false, error: String(e) });
    }
  };

  for (const [table, col, scope] of [
    ["property_billing_configs", "property_id", "property"],
    ["portfolio_billing_configs", "portfolio_id", "portfolio"],
  ] as const) {
    const { data: rows } = await supabase
      .from(table)
      .select(`${col}, engagement_date, billing_start_date, free_period_days, billing_strategy, subscription_status`)
      .neq("subscription_status", "active");
    for (const row of rows ?? []) {
      const paidStart = resolvePaidStart(row, await freeDefaultFor((row as any).billing_strategy));
      if (!paidStart) continue;
      if (paidStart < remindWindowStart || paidStart > remindWindowEnd) continue;
      await notifyDue(scope, (row as any)[col]);
    }
  }

  // 5) Mark past_due (property + portfolio) — never for accounts that are
  //     winding down: a scheduled cancellation is not a missed payment.
  await supabase.from("property_billing_configs")
    .update({ subscription_status: "past_due" })
    .eq("subscription_status", "active")
    .eq("cancel_at_period_end", false)
    .lt("current_period_end", todayStr);
  await supabase.from("portfolio_billing_configs")
    .update({ subscription_status: "past_due" })
    .eq("subscription_status", "active")
    .eq("cancel_at_period_end", false)
    .lt("current_period_end", todayStr);

  // 5b) Pending plan change: once the 7-day activation window opens, invite the
  //     owner to activate the new monthly plan. Sent once per pending plan.
  for (const [table, col, joinSel] of [
    ["property_billing_configs", "property_id", "properties!inner(id, name, owner_email)"],
    ["portfolio_billing_configs", "portfolio_id", "property_portfolios!inner(id, name, owner_id)"],
  ] as const) {
    const { data: pendingPlans } = await supabase
      .from(table)
      .select(`${col}, pending_monthly_fee, pending_effective_date, plan_change_reason, cancel_effective_date, ${joinSel}`)
      .not("pending_effective_date", "is", null)
      .eq("plan_change_reason", "model_change")
      .lte("pending_effective_date", in5Str);
    for (const row of pendingPlans ?? []) {
      const entityId = (row as any)[col];
      const effective = String((row as any).pending_effective_date).slice(0, 10);
      const fee = Number((row as any).pending_monthly_fee) || 0;
      if (fee <= 0) continue;
      const entity = (row as any).properties ?? (row as any).property_portfolios ?? {};
      let ownerEmail: string | null = entity.owner_email ?? null;
      if (!ownerEmail && entity.owner_id) {
        const { data: prof } = await supabase.from("profiles").select("email").eq("id", entity.owner_id).maybeSingle();
        ownerEmail = prof?.email ?? null;
      }
      const cc = await getAdminCopyRecipients(supabase, ownerEmail);
      if (ownerEmail) {
        await sendReminder(
          resend,
          ownerEmail,
          `Activate your new subscription plan - ${entity.name || ""}`,
          `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Type" content="text/html; charset=UTF-8"><title>Activate your new plan</title></head><body style="font-family:Arial,sans-serif;background:#fff;padding:24px;color:#1A1A2E">
            <div style="max-width:560px;margin:0 auto;border:1px solid #eee;border-radius:8px;padding:24px">
              <h2 style="color:#E91E8C;margin-top:0">Activate your new subscription plan</h2>
              <p>The billing plan for <strong>${entity.name || ""}</strong> has changed. Your current plan runs to <strong>${String((row as any).cancel_effective_date || "").slice(0, 10) || effective}</strong>.</p>
              <p>The new plan of <strong>${fmtCurrency(fee)} per month</strong> starts on <strong>${effective}</strong> and needs to be activated from your ROL Account to keep the account running.</p>
              <p style="text-align:center;margin:20px 0"><a href="${SITE_URL}/admin/account" style="background:#E91E8C;color:#fff;text-decoration:none;padding:12px 22px;border-radius:6px;display:inline-block;font-weight:600">Activate new plan</a></p>
              <p style="color:#666;font-size:13px">Cancel any time &mdash; no lock-in, no cancellation fee.</p>
            </div></body></html>`,
          cc,
        );
      }
      await supabase.from(table).update({ plan_change_reason: "model_change_notified" }).eq(col, entityId);
      results.push({ scope: table === "property_billing_configs" ? "property" : "portfolio", entity_id: entityId, plan_change_reminder: true, effective_from: effective });
    }
  }

  // 6) Suspend accounts whose scheduled cancellation date has passed. Service
  //    ran to the last paid day; from here access and functionality are
  //    restricted pending reactivation. Data is retained.
  for (const [table, col, scope, joinSel] of [
    ["property_billing_configs", "property_id", "property", "properties!inner(id, name, owner_email)"],
    ["portfolio_billing_configs", "portfolio_id", "portfolio", "property_portfolios!inner(id, name, owner_id)"],
  ] as const) {
    const { data: due } = await supabase
      .from(table)
      .select(`${col}, cancel_effective_date, current_period_end, ${joinSel}`)
      .eq("cancel_at_period_end", true)
      .is("suspended_at", null);
    for (const row of due ?? []) {
      const effective = String((row as any).cancel_effective_date || (row as any).current_period_end || "").slice(0, 10);
      if (!effective || effective >= todayStr) continue;
      const entityId = (row as any)[col];
      await supabase
        .from(table)
        .update({ subscription_status: "suspended", suspended_at: new Date().toISOString() })
        .eq(col, entityId);

      const entity = (row as any).properties ?? (row as any).property_portfolios ?? {};
      let ownerEmail: string | null = entity.owner_email ?? null;
      if (!ownerEmail && entity.owner_id) {
        const { data: prof } = await supabase.from("profiles").select("email").eq("id", entity.owner_id).maybeSingle();
        ownerEmail = prof?.email ?? null;
      }
      if (ownerEmail) {
        try {
          await resend.emails.send({
            from: FROM_EMAIL,
            to: [ownerEmail],
            subject: `Account suspended - ${entity.name || "your account"}`,
            html: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Type" content="text/html; charset=UTF-8"><title>Account suspended</title></head><body style="font-family:Arial,sans-serif;background:#fff;padding:24px;color:#1A1A2E">
              <div style="max-width:560px;margin:0 auto;border:1px solid #eee;border-radius:8px;padding:24px">
                <h2 style="color:#E91E8C;margin-top:0">Account suspended</h2>
                <p>The subscription for <strong>${entity.name || ""}</strong> was cancelled and the paid period ended on <strong>${effective}</strong>.</p>
                <p>Access and functionality are now restricted pending reactivation. Your data is retained and everything is restored the moment the subscription is reactivated.</p>
                <p style="text-align:center;margin:20px 0"><a href="${SITE_URL}/admin/account" style="background:#E91E8C;color:#fff;text-decoration:none;padding:12px 22px;border-radius:6px;display:inline-block;font-weight:600">Reactivate subscription</a></p>
              </div></body></html>`,
          });
        } catch (e) {
          console.error("[billing-cron] suspension email failed", e);
        }
      }
      results.push({ scope, entity_id: entityId, suspended: true, effective_from: effective });
    }
  }

  return new Response(JSON.stringify({ success: true, ran_at: new Date().toISOString(), results }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
