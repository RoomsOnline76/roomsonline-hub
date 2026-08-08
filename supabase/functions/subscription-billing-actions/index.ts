// Two-payment billing actions for the ROL Account.
//
//  * setup / once-off fees  → due immediately on contract signature
//  * monthly subscription   → activated by the owner, but only inside the
//                             7-day window before the first paid billing date
//
// Also supports deleting cancelled/void test invoices (staff only) and sending
// the "payment due by" reminder to the owner plus admin / fearless leader / dev.

import { createClient } from "npm:@supabase/supabase-js@2";
import { Resend } from "npm:resend@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SITE_URL = Deno.env.get("SITE_URL") || "https://sleepinafrica.roomsonline.co.za";
// Must be on our verified sending domain, otherwise Resend rejects the send.
const FROM_EMAIL =
  Deno.env.get("BILLING_FROM_EMAIL") || "Rooms Online <billing@notify.roomsonline.co.za>";

const DEFAULT_FREE_PERIOD_DAYS = 60;
/** The monthly subscription can only be started this many days before it is due. */
const START_WINDOW_DAYS = 7;

const today = () => new Date().toISOString().slice(0, 10);

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function addMonth(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 10);
}

const isSetupCharge = (kind?: string | null) => !!kind && /setup/i.test(kind);

/**
 * Setup charge items have been enqueued by more than one path over time, using
 * different kind spellings (`setup_pricelabs` vs `pricelabs_setup`). Normalising
 * the kind lets us dedupe them and reconcile against the billing config, which
 * is the contracted source of truth for once-off fees.
 */
function setupKey(kind?: string | null): string {
  const k = String(kind || "").toLowerCase().replace(/^setup[_-]/, "").replace(/[_-]setup$/, "");
  if (/price ?labs/.test(k)) return "pricelabs";
  if (/white[_-]?label|^wl$/.test(k)) return "white_label";
  if (/brand/.test(k)) return "branding";
  return k || "other";
}

/** Contracted once-off fees straight off the billing config. */
function configSetupLines(cfg: any): { key: string; description: string; amount: number }[] {
  const rows: { key: string; description: string; amount: number }[] = [];
  const add = (key: string, description: string, amount: unknown) => {
    const n = Number(amount) || 0;
    if (n > 0) rows.push({ key, description, amount: n });
  };
  add("white_label", "White-label setup fee", cfg?.white_label_setup_fee);
  if (!cfg?.white_label_allowed) add("branding", "Branding add-on setup fee", cfg?.branding_addon_setup_fee);
  if (cfg?.pricelabs_allowed) add("pricelabs", "PriceLabs revenue management setup fee", cfg?.pricelabs_setup_fee);
  return rows;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type Tier = { min_rooms: number; max_rooms: number | null; monthly_fee: number };

function feeFromTiers(tiers: Tier[] | null, rooms: number): number {
  if (!tiers?.length) return 0;
  const sorted = [...tiers].sort((a, b) => a.min_rooms - b.min_rooms);
  for (const t of sorted) {
    const max = t.max_rooms == null ? Infinity : t.max_rooms;
    if (rooms >= t.min_rooms && rooms <= max) return Number(t.monthly_fee) || 0;
  }
  return Number(sorted[sorted.length - 1].monthly_fee) || 0;
}

async function propertyIdsFor(supabase: any, scope: string, entityId: string): Promise<string[]> {
  if (scope === "property") return [entityId];
  const { data } = await supabase
    .from("property_portfolio_members")
    .select("property_id")
    .eq("portfolio_id", entityId);
  return (data ?? []).map((r: any) => r.property_id);
}

async function monthlyFee(supabase: any, cfg: any, scope: string, entityId: string): Promise<number> {
  if (Number(cfg?.subscription_fee_monthly) > 0) return Number(cfg.subscription_fee_monthly);
  let tiers: Tier[] | null = Array.isArray(cfg?.tier_pricing_json) ? cfg.tier_pricing_json : null;
  if (!tiers?.length) {
    const { data } = await supabase
      .from("billing_global_defaults")
      .select("tier_pricing_json")
      .eq("strategy", cfg?.billing_strategy || "default")
      .maybeSingle();
    tiers = Array.isArray(data?.tier_pricing_json) ? data.tier_pricing_json : null;
  }
  const ids = await propertyIdsFor(supabase, scope, entityId);
  let rooms = Number(cfg?.room_count_override) || 0;
  if (!rooms && ids.length) {
    const { count } = await supabase
      .from("rolos_rooms")
      .select("id", { count: "exact", head: true })
      .in("property_id", ids);
    rooms = count || 0;
  }
  const addOns =
    (Number(cfg?.white_label_monthly_fee) || 0) +
    (Number(cfg?.branding_addon_monthly_fee) || 0) +
    (Number(cfg?.pricelabs_monthly_fee) || 0) +
    (Number(cfg?.byo_gateway_monthly_fee) || 0) +
    (cfg?.channel_manager_enabled ? (Number(cfg?.channel_manager_per_unit_fee) || 0) * rooms : 0);
  return feeFromTiers(tiers, rooms) + addOns;
}

function paidStartFor(cfg: any): string | null {
  const freeDays = cfg?.free_period_days ?? DEFAULT_FREE_PERIOD_DAYS;
  if (cfg?.engagement_date) return addDays(String(cfg.engagement_date), Number(freeDays) || 0);
  return cfg?.billing_start_date ? String(cfg.billing_start_date).slice(0, 10) : null;
}

const money = (v: number, c = "ZAR") => `${c} ${Number(v || 0).toFixed(2)}`;

function reminderHtml(o: {
  entityName: string;
  setupAmount: number;
  setupUrl: string | null;
  monthlyAmount: number;
  dueBy: string | null;
  subscriptionUrl: string | null;
  currency: string;
}) {
  const rows: string[] = [];
  if (o.setupAmount > 0)
    rows.push(
      `<tr><td style="padding:6px 0;color:#666">Once-off setup (due now)</td><td style="padding:6px 0;text-align:right;font-weight:600">${money(o.setupAmount, o.currency)}</td></tr>`,
    );
  rows.push(
    `<tr><td style="padding:6px 0;color:#666">Monthly subscription${o.dueBy ? ` (due by ${o.dueBy})` : ""}</td><td style="padding:6px 0;text-align:right;font-weight:600">${money(o.monthlyAmount, o.currency)}</td></tr>`,
  );
  const btn = (href: string, label: string) =>
    `<a href="${href}" style="background:#E91E8C;color:#fff;text-decoration:none;padding:12px 22px;border-radius:6px;display:inline-block;font-weight:600;margin:4px">${label}</a>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Type" content="text/html; charset=UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Payments due</title></head><body style="font-family:Arial,sans-serif;background:#fff;padding:24px;color:#1A1A2E">
  <div style="max-width:560px;margin:0 auto;border:1px solid #eee;border-radius:8px;padding:24px">
    <h2 style="color:#E91E8C;margin-top:0">Payments due &mdash; ${o.entityName}</h2>
    <p>Your signed agreement is in place. There are two separate payments:</p>
    <table style="width:100%;margin:16px 0;border-collapse:collapse">${rows.join("")}</table>
    <p style="text-align:center;margin:20px 0">
      ${o.setupUrl ? btn(o.setupUrl, "Pay setup fee") : ""}
      ${o.subscriptionUrl ? btn(o.subscriptionUrl, "Start subscription") : ""}
    </p>
    ${
      o.dueBy
        ? `<p style="color:#666;font-size:13px">The monthly subscription can be started from ${addDays(o.dueBy, -START_WINDOW_DAYS)} and must be settled by <strong>${o.dueBy}</strong>.</p>`
        : ""
    }
    <p style="color:#666;font-size:13px">Cancel any time &mdash; no lock-in, no cancellation fee.</p>
  </div></body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    // The daily cron calls this function with the service-role key.
    const isSystem = !!token && token === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const { data: auth } = isSystem ? { data: null } : await supabase.auth.getUser(token);
    const user = auth?.user ?? null;
    if (!user && !isSystem) return json({ error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");
    const scope = body.scope === "portfolio" ? "portfolio" : "property";
    const entityId = String(body.entity_id || "");
    if (!entityId) return json({ error: "entity_id is required" }, 400);

    const { data: roles } = user
      ? await supabase.from("user_roles").select("role").eq("user_id", user.id)
      : { data: [] as any[] };
    const roleSet = new Set((roles ?? []).map((r: any) => r.role));
    const isStaff = isSystem || ["admin", "dev", "fearless_leader"].some((r) => roleSet.has(r));

    const entityCol = scope === "property" ? "property_id" : "portfolio_id";
    const cfgTable = scope === "property" ? "property_billing_configs" : "portfolio_billing_configs";

    // Entity identity + owner
    let entityName = "";
    let ownerId: string | null = null;
    let ownerEmail: string | null = null;
    if (scope === "property") {
      const { data: p } = await supabase
        .from("properties")
        .select("name, owner_email")
        .eq("id", entityId)
        .maybeSingle();
      entityName = p?.name || "";
      ownerEmail = p?.owner_email ?? null;
      const { data: linkedOwner } = await supabase
        .from("property_owners")
        .select("user_id, owner_email")
        .eq("property_id", entityId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      ownerId = linkedOwner?.user_id ?? null;
      ownerEmail = ownerEmail || linkedOwner?.owner_email || null;
    } else {
      const { data: pf } = await supabase
        .from("property_portfolios")
        .select("name, owner_id")
        .eq("id", entityId)
        .maybeSingle();
      entityName = pf?.name || "";
      ownerId = pf?.owner_id ?? null;
    }
    if (!ownerEmail && ownerId) {
      const { data: prof } = await supabase.from("profiles").select("email").eq("id", ownerId).maybeSingle();
      ownerEmail = prof?.email ?? null;
    }
    const isOwner = !!ownerId && !!user && ownerId === user.id;
    if (!isStaff && !isOwner) return json({ error: "forbidden" }, 403);

    const { data: cfg } = await supabase.from(cfgTable).select("*").eq(entityCol, entityId).maybeSingle();
    if (!cfg) return json({ error: "no_billing_config" }, 400);

    const currency = "ZAR";
    const paidStart = paidStartFor(cfg);
    const windowOpensOn = paidStart ? addDays(paidStart, -START_WINDOW_DAYS) : null;
    const canStart = !!windowOpensOn && today() >= windowOpensOn;

    // Pending setup charge items (never bundled into the monthly invoice)
    const { data: charges } = await supabase
      .from("subscription_charge_items")
      .select("id, kind, description, amount, currency, invoiced_at, invoiced_on_invoice_id")
      .eq(entityCol, entityId)
      .is("invoiced_at", null);
    const pendingSetupItems = (charges ?? []).filter(
      (c: any) => isSetupCharge(c.kind) && !c.invoiced_on_invoice_id,
    );

    // Reconcile the queued charge items with the contracted config: one line per
    // fee, config amount wins, duplicate items are collapsed (but still linked
    // to the invoice so they can never be billed a second time).
    const itemsByKey = new Map<string, any[]>();
    for (const item of pendingSetupItems) {
      const key = setupKey(item.kind);
      itemsByKey.set(key, [...(itemsByKey.get(key) ?? []), item]);
    }
    const setupCharges: {
      key: string;
      kind: string;
      description: string;
      amount: number;
      itemIds: string[];
    }[] = [];
    const seen = new Set<string>();
    for (const line of configSetupLines(cfg)) {
      const matches = itemsByKey.get(line.key) ?? [];
      seen.add(line.key);
      setupCharges.push({
        key: line.key,
        kind: matches[0]?.kind ?? `setup_${line.key}`,
        description: matches[0]?.description ?? line.description,
        amount: line.amount,
        itemIds: matches.map((m: any) => m.id),
      });
    }
    // Queued charges with no matching config fee stay on the invoice as-is.
    for (const [key, matches] of itemsByKey) {
      if (seen.has(key)) continue;
      setupCharges.push({
        key,
        kind: matches[0].kind,
        description: matches[0].description,
        amount: Number(matches[0].amount) || 0,
        itemIds: matches.map((m: any) => m.id),
      });
    }
    const setupTotal = setupCharges.reduce((s: number, c) => s + c.amount, 0);

    const { data: invoices } = await supabase
      .from("subscription_invoices")
      .select("id, invoice_number, invoice_kind, amount, status, period_start, period_end, payfast_token, pdf_url, line_items, created_at")
      .eq(entityCol, entityId)
      .order("created_at", { ascending: false })
      .limit(200);

    let openSetup = (invoices ?? []).find(
      (i: any) => i.invoice_kind === "once_off" && !["paid", "void", "cancelled"].includes(i.status),
    );
    const paidSetup = (invoices ?? []).find(
      (i: any) => i.invoice_kind === "once_off" && i.status === "paid",
    );
    const openSubscription = (invoices ?? []).find(
      (i: any) => i.invoice_kind === "activation" && !["paid", "void", "cancelled"].includes(i.status),
    );
    const cancelled = (invoices ?? []).filter((i: any) => ["cancelled", "void"].includes(i.status));
    const fee = await monthlyFee(supabase, cfg, scope, entityId);

    const payUrl = (t?: string | null) => (t ? `${SITE_URL}/subscribe/pay/${t}` : null);

    const summary = () => ({
      entity_name: entityName,
      owner_email: ownerEmail,
      currency,
      is_staff: isStaff,
      setup: {
        total: setupTotal,
        paid_total: paidSetupAmount,
        outstanding: setupBalance,
        items: setupCharges.map((c) => ({ description: c.description, amount: c.amount })),
        invoice: openSetup
          ? { id: openSetup.id, number: openSetup.invoice_number, amount: Number(openSetup.amount), pay_url: payUrl(openSetup.payfast_token) }
          : null,
        paid_invoice: paidSetup
          ? { id: paidSetup.id, number: paidSetup.invoice_number, amount: Number(paidSetup.amount), pdf_url: paidSetup.pdf_url }
          : null,
      },
      // A billing-model change schedules the current plan to end and parks the
      // new monthly fee until the owner activates it.
      pending_plan: cfg.pending_monthly_fee != null
        ? {
            monthly_fee: Number(cfg.pending_monthly_fee) || 0,
            effective_date: cfg.pending_effective_date ? String(cfg.pending_effective_date).slice(0, 10) : null,
            reason: cfg.plan_change_reason ?? null,
            window_opens_on: cfg.pending_effective_date
              ? addDays(String(cfg.pending_effective_date), -START_WINDOW_DAYS)
              : null,
            can_activate:
              !!cfg.pending_effective_date &&
              today() >= addDays(String(cfg.pending_effective_date), -START_WINDOW_DAYS),
          }
        : null,
      subscription: {
        monthly_fee: fee,
        due_by: paidStart,
        window_opens_on: windowOpensOn,
        can_start: canStart,
        invoice: openSubscription
          ? {
              id: openSubscription.id,
              number: openSubscription.invoice_number,
              amount: Number(openSubscription.amount),
              period_start: openSubscription.period_start,
              period_end: openSubscription.period_end,
              pay_url: payUrl(openSubscription.payfast_token),
            }
          : null,
        // Lifecycle — a cancellation is always scheduled for the end of the
        // period the owner has already paid for; service only stops after that.
        status: String(cfg.subscription_status || "pending"),
        paid_through: cfg.current_period_end ? String(cfg.current_period_end).slice(0, 10) : null,
        cancel_at_period_end: !!cfg.cancel_at_period_end,
        cancel_effective_date: cfg.cancel_effective_date ? String(cfg.cancel_effective_date).slice(0, 10) : null,
        suspended_at: cfg.suspended_at ?? null,
        can_cancel:
          !cfg.cancel_at_period_end &&
          ["active", "past_due"].includes(String(cfg.subscription_status || "")),
        can_resume: !!cfg.cancel_at_period_end && !cfg.suspended_at,
        can_reactivate:
          !!cfg.suspended_at || ["suspended", "cancelled"].includes(String(cfg.subscription_status || "")),
      },
      cancelled_count: cancelled.length,
    });


    // Contracted setup fees are payable on signature, so the once-off invoice is
    // raised automatically the first time the account is read — no manual step.
    // Everything already settled on once-off invoices. Anything paid here is
    // never re-billed: a later increase or a brand-new fee is invoiced for the
    // outstanding balance only.
    const paidSetupAmount = (invoices ?? [])
      .filter((i: any) => i.invoice_kind === "once_off" && i.status === "paid")
      .reduce((sum: number, i: any) => sum + (Number(i.amount) || 0), 0);
    const setupBalance = Math.max(0, Math.round((setupTotal - paidSetupAmount) * 100) / 100);

    const setupInvoiceLines = () => {
      const lines = setupCharges.map((c) => ({
        kind: c.kind,
        description: c.description,
        amount: c.amount,
        charge_item_id: c.itemIds[0] ?? null,
      }));
      if (paidSetupAmount > 0) {
        lines.push({
          kind: "setup_already_paid",
          description: "Less: once-off fees already paid",
          amount: -paidSetupAmount,
          charge_item_id: null,
        } as any);
      }
      return lines;
    };

    const ensureSetupInvoice = async () => {
      if (openSetup) return openSetup;
      if (setupBalance <= 0) return null;
      const insert: any = {
        amount: setupBalance,
        currency,
        subscription_amount: 0,
        once_off_amount: setupBalance,
        line_items: setupInvoiceLines(),
        period_start: today(),
        period_end: today(),
        status: "pending",
        invoice_kind: "once_off",
        owner_id: ownerId,
      };
      insert[entityCol] = entityId;
      const { data: created, error } = await supabase
        .from("subscription_invoices")
        .insert(insert)
        .select("id, invoice_number, invoice_kind, amount, status, period_start, period_end, payfast_token, created_at")
        .single();
      if (error || !created) return null;
      const itemIds = setupCharges.flatMap((c) => c.itemIds);
      if (itemIds.length) {
        await supabase
          .from("subscription_charge_items")
          .update({ invoiced_on_invoice_id: created.id })
          .in("id", itemIds);
      }
      openSetup = created;
      return created;
    };

    if (action === "summary") {
      await ensureSetupInvoice();
      return json({ success: true, ...summary() });
    }

    if (action === "delete_cancelled") {
      if (!isStaff) return json({ error: "forbidden" }, 403);
      const ids = cancelled.map((i: any) => i.id);
      if (!ids.length) return json({ success: true, deleted: 0 });
      await supabase
        .from("subscription_charge_items")
        .update({ invoiced_on_invoice_id: null })
        .in("invoiced_on_invoice_id", ids);
      const { error } = await supabase.from("subscription_invoices").delete().in("id", ids);
      if (error) return json({ error: error.message }, 400);
      return json({ success: true, deleted: ids.length });
    }

    if (action === "raise_setup_invoice") {
      const inv = await ensureSetupInvoice();
      if (!inv) return json({ error: "no_setup_fees_due" }, 400);
      return json({ success: true, invoice_id: inv.id, pay_url: payUrl(inv.payfast_token) });
    }

    // ---- Billing configuration changed ------------------------------------
    // Once-off fees: bill the new balance only, never anything already paid.
    // Monthly model: end the current plan at the end of the paid period and
    // park the new fee for the owner to activate inside the 7-day window.
    if (action === "apply_config_change") {
      if (!isStaff) return json({ error: "forbidden" }, 403);
      const before = body.before ?? {};

      const notify = async (subject: string, inner: string) => {
        try {
          const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
          const admins = await getBillingAdminRecipients(supabase);
          const recipients = [...new Set([ownerEmail, ...admins].filter(Boolean))] as string[];
          if (!recipients.length) return "no_recipients";
          const res = await resend.emails.send({
            from: FROM_EMAIL,
            to: recipients,
            subject,
            html: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Type" content="text/html; charset=UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${subject}</title></head><body style="font-family:Arial,sans-serif;background:#fff;padding:24px;color:#1A1A2E">
              <div style="max-width:560px;margin:0 auto;border:1px solid #eee;border-radius:8px;padding:24px">
                <h2 style="color:#E91E8C;margin-top:0">${subject}</h2>
                ${inner}
                <p style="text-align:center;margin:20px 0"><a href="${SITE_URL}/admin/account" style="background:#E91E8C;color:#fff;text-decoration:none;padding:12px 22px;border-radius:6px;display:inline-block;font-weight:600">Open ROL Account</a></p>
                <p style="color:#666;font-size:13px">Cancel any time &mdash; no lock-in, no cancellation fee.</p>
              </div></body></html>`,
          });
          return res.error ? `failed: ${(res.error as any)?.message ?? "unknown"}` : "sent";
        } catch (e) {
          console.error("[apply_config_change] email failed", e);
          return "failed";
        }
      };

      // --- 1. Once-off delta -------------------------------------------------
      const beforeSetup = configSetupLines(before).reduce((s, l) => s + l.amount, 0);
      let setupInvoice: any = null;
      let deltaBilled = 0;
      if (setupBalance > 0) {
        if (openSetup) {
          // Keep the single open once-off invoice in step with the contract.
          if (Math.abs(Number(openSetup.amount) - setupBalance) > 0.005) {
            const { data: updated } = await supabase
              .from("subscription_invoices")
              .update({
                amount: setupBalance,
                once_off_amount: setupBalance,
                line_items: setupInvoiceLines(),
              })
              .eq("id", openSetup.id)
              .select("id, invoice_number, amount, payfast_token")
              .maybeSingle();
            setupInvoice = updated ?? openSetup;
          } else {
            setupInvoice = openSetup;
          }
        } else {
          setupInvoice = await ensureSetupInvoice();
        }
        deltaBilled = setupBalance;
      }
      const requiresCreditNote = setupTotal < beforeSetup && paidSetupAmount > setupTotal;

      // --- 2. Monthly model --------------------------------------------------
      const lastPaidSubscription = (invoices ?? []).find(
        (i: any) => i.invoice_kind !== "once_off" && i.status === "paid",
      );
      const billedFee = lastPaidSubscription ? Number(lastPaidSubscription.amount) || 0 : 0;
      const status = String(cfg.subscription_status || "pending");
      const subscriptionLive = ["active", "past_due", "cancelling"].includes(status) && billedFee > 0;
      const feeChanged = Math.abs(fee - billedFee) > 0.005;
      let planChange: any = null;

      if (subscriptionLive && feeChanged) {
        const paidThrough = cfg.current_period_end ? String(cfg.current_period_end).slice(0, 10) : today();
        const effective = addDays(paidThrough, 1);
        const { error: planError } = await supabase
          .from(cfgTable)
          .update({
            cancel_at_period_end: true,
            cancel_effective_date: paidThrough,
            cancelled_at: new Date().toISOString(),
            subscription_status: "cancelling",
            plan_change_reason: "model_change",
            pending_monthly_fee: fee,
            pending_effective_date: effective,
            pending_model_json: {
              billing_strategy: cfg.billing_strategy ?? null,
              room_count_override: cfg.room_count_override ?? null,
              subscription_fee_monthly: cfg.subscription_fee_monthly ?? null,
              tier_pricing_json: cfg.tier_pricing_json ?? null,
              monthly_fee: fee,
            },
          })
          .eq(entityCol, entityId);
        if (planError) return json({ error: planError.message }, 400);
        planChange = {
          previous_monthly_fee: billedFee,
          new_monthly_fee: fee,
          runs_to: paidThrough,
          effective_date: effective,
          window_opens_on: addDays(effective, -START_WINDOW_DAYS),
        };
      } else if (cfg.pending_monthly_fee != null && !feeChanged) {
        // The change was reverted before it took effect.
        await supabase
          .from(cfgTable)
          .update({
            pending_monthly_fee: null,
            pending_effective_date: null,
            pending_model_json: null,
            plan_change_reason: null,
          })
          .eq(entityCol, entityId);
      }

      // --- 3. Notify ---------------------------------------------------------
      let notificationStatus = "not_required";
      if (deltaBilled > 0 || planChange) {
        const parts: string[] = [
          `<p>The billing configuration for <strong>${entityName}</strong> has been updated.</p>`,
        ];
        if (deltaBilled > 0) {
          parts.push(
            `<p><strong>Additional once-off fee due: ${money(deltaBilled, currency)}</strong>${
              setupInvoice?.invoice_number ? ` (invoice ${setupInvoice.invoice_number})` : ""
            }. Fees already paid are not re-billed &mdash; only the outstanding balance is charged.</p>`,
          );
        }
        if (planChange) {
          parts.push(
            `<p><strong>Subscription plan change scheduled.</strong> The current plan (${money(planChange.previous_monthly_fee, currency)} per month) runs to <strong>${planChange.runs_to}</strong>. The new plan of <strong>${money(planChange.new_monthly_fee, currency)} per month</strong> starts on <strong>${planChange.effective_date}</strong> and is activated by the owner from the ROL Account &mdash; the activation opens on ${planChange.window_opens_on}.</p>`,
          );
        }
        if (requiresCreditNote) {
          parts.push(
            `<p style="color:#666;font-size:13px">A once-off fee was reduced after payment. A credit note will be raised manually by the Rooms Online team.</p>`,
          );
        }
        notificationStatus = await notify(
          planChange && deltaBilled > 0
            ? `Billing updated - additional fee due and plan change scheduled - ${entityName}`
            : planChange
            ? `Subscription plan change scheduled - ${entityName}`
            : `Billing updated - additional once-off fee due - ${entityName}`,
          parts.join(""),
        );
      }

      const logRow: any = {
        owner_id: ownerId,
        changed_by: user?.id ?? null,
        change_type: planChange && deltaBilled > 0 ? "both" : planChange ? "subscription_model" : "setup_delta",
        before_snapshot: before,
        after_snapshot: cfg,
        setup_delta: deltaBilled,
        setup_delta_lines: setupInvoiceLines(),
        previous_monthly_fee: billedFee,
        new_monthly_fee: fee,
        plan_effective_date: planChange?.effective_date ?? null,
        invoice_id: setupInvoice?.id ?? null,
        requires_credit_note: requiresCreditNote,
        notification_status: notificationStatus,
      };
      logRow[entityCol] = entityId;
      await supabase.from("billing_config_change_log").insert(logRow);

      return json({
        success: true,
        setup_delta: deltaBilled,
        setup_invoice_id: setupInvoice?.id ?? null,
        pay_url: payUrl(setupInvoice?.payfast_token),
        plan_change: planChange,
        requires_credit_note: requiresCreditNote,
        notification_status: notificationStatus,
      });
    }

    // Owner-driven switch onto a pending plan, inside the 7-day window.
    if (action === "activate_pending_plan") {
      if (cfg.pending_monthly_fee == null || !cfg.pending_effective_date)
        return json({ error: "no_pending_plan" }, 400);
      const pendingFee = Number(cfg.pending_monthly_fee) || 0;
      if (pendingFee <= 0) return json({ error: "zero_subscription_amount" }, 400);
      const effective = String(cfg.pending_effective_date).slice(0, 10);
      const opensOn = addDays(effective, -START_WINDOW_DAYS);
      if (today() < opensOn && !isStaff) return json({ error: "too_early", window_opens_on: opensOn }, 400);

      const periodStart = today() > effective ? today() : effective;
      const periodEnd = addMonth(periodStart);
      const insert: any = {
        amount: pendingFee,
        currency,
        subscription_amount: pendingFee,
        once_off_amount: 0,
        line_items: [
          { kind: "monthly_subscription", description: `Monthly subscription (${periodStart} - ${periodEnd})`, amount: pendingFee },
        ],
        period_start: periodStart,
        period_end: periodEnd,
        status: "pending",
        invoice_kind: "activation",
        owner_id: ownerId,
      };
      insert[entityCol] = entityId;
      const { data: created, error } = await supabase
        .from("subscription_invoices")
        .insert(insert)
        .select("id, payfast_token")
        .single();
      if (error) return json({ error: error.message }, 400);

      const { error: cfgError } = await supabase
        .from(cfgTable)
        .update({
          subscription_fee_monthly: pendingFee,
          pending_monthly_fee: null,
          pending_effective_date: null,
          pending_model_json: null,
          plan_change_reason: null,
          cancel_at_period_end: false,
          cancel_effective_date: null,
          cancelled_at: null,
          suspended_at: null,
          billing_enabled: true,
          subscription_status: "pending",
        })
        .eq(entityCol, entityId);
      if (cfgError) return json({ error: cfgError.message }, 400);

      return json({ success: true, invoice_id: created.id, pay_url: payUrl(created.payfast_token) });
    }



    if (action === "start_subscription") {
      if (openSubscription)
        return json({ success: true, invoice_id: openSubscription.id, pay_url: payUrl(openSubscription.payfast_token) });
      if (!paidStart) return json({ error: "no_billing_start_date" }, 400);
      if (!canStart && !isStaff)
        return json({ error: "too_early", window_opens_on: windowOpensOn }, 400);
      if (fee <= 0) return json({ error: "zero_subscription_amount" }, 400);
      const periodStart = paidStart;
      const periodEnd = addMonth(paidStart);
      const insert: any = {
        amount: fee,
        currency,
        subscription_amount: fee,
        once_off_amount: 0,
        line_items: [
          { kind: "monthly_subscription", description: `Monthly subscription (${periodStart} → ${periodEnd})`, amount: fee },
        ],
        period_start: periodStart,
        period_end: periodEnd,
        status: "pending",
        invoice_kind: "activation",
        owner_id: ownerId,
      };
      insert[entityCol] = entityId;
      const { data: created, error } = await supabase
        .from("subscription_invoices")
        .insert(insert)
        .select("id, payfast_token")
        .single();
      if (error) return json({ error: error.message }, 400);
      await supabase
        .from(cfgTable)
        .update({ billing_enabled: true, subscription_status: "pending" })
        .eq(entityCol, entityId);
      return json({ success: true, invoice_id: created.id, pay_url: payUrl(created.payfast_token) });
    }

    // ---- Subscription lifecycle -------------------------------------------
    // Cancelling never stops service immediately. The account keeps running to
    // the last day already paid for (current_period_end), after which the daily
    // cron suspends it pending reactivation.
    if (action === "cancel_subscription") {
      const status = String(cfg.subscription_status || "pending");
      if (!["active", "past_due"].includes(status))
        return json({ error: "subscription_not_active" }, 400);
      if (cfg.cancel_at_period_end)
        return json({ success: true, already_scheduled: true, cancel_effective_date: cfg.cancel_effective_date });

      const paidThrough = cfg.current_period_end ? String(cfg.current_period_end).slice(0, 10) : today();
      const nowIso = new Date().toISOString();
      const { error } = await supabase
        .from(cfgTable)
        .update({
          cancel_at_period_end: true,
          cancel_effective_date: paidThrough,
          cancelled_at: nowIso,
          subscription_status: "cancelling",
        })
        .eq(entityCol, entityId);
      if (error) return json({ error: error.message }, 400);

      // Notify the owner (and staff) that the account will be suspended.
      try {
        const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
        const { data: staffRoles } = await supabase
          .from("user_roles")
          .select("user_id")
          .in("role", ["admin", "fearless_leader", "dev"]);
        const staffIds = [...new Set((staffRoles ?? []).map((r: any) => r.user_id))];
        const { data: staffProfiles } = staffIds.length
          ? await supabase.from("profiles").select("email").in("id", staffIds)
          : { data: [] as any[] };
        const recipients = [
          ...(ownerEmail ? [ownerEmail] : []),
          ...(staffProfiles ?? []).map((p: any) => p.email).filter(Boolean),
        ];
        if (recipients.length) {
          await resend.emails.send({
            from: FROM_EMAIL,
            to: recipients,
            subject: `Subscription cancellation scheduled - ${entityName}`,
            html: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Type" content="text/html; charset=UTF-8"><title>Subscription cancellation</title></head><body style="font-family:Arial,sans-serif;background:#fff;padding:24px;color:#1A1A2E">
              <div style="max-width:560px;margin:0 auto;border:1px solid #eee;border-radius:8px;padding:24px">
                <h2 style="color:#E91E8C;margin-top:0">Subscription cancellation scheduled</h2>
                <p>The monthly subscription for <strong>${entityName}</strong> has been scheduled for cancellation.</p>
                <p>Your service continues in full until <strong>${paidThrough}</strong> &mdash; the last day already paid for. After that date the account is <strong>suspended pending reactivation</strong>: access and functionality are restricted, although your data is retained.</p>
                <p>You can keep the subscription running at any time before ${paidThrough}, or reactivate later, from your ROL Account.</p>
                <p style="text-align:center;margin:20px 0"><a href="${SITE_URL}/admin/account" style="background:#E91E8C;color:#fff;text-decoration:none;padding:12px 22px;border-radius:6px;display:inline-block;font-weight:600">Open ROL Account</a></p>
              </div></body></html>`,
          });
        }
      } catch (mailErr) {
        console.error("[cancel_subscription] email failed", mailErr);
      }

      return json({ success: true, cancel_effective_date: paidThrough });
    }

    // Undo a scheduled cancellation while the paid period is still running.
    if (action === "resume_subscription") {
      if (!cfg.cancel_at_period_end) return json({ success: true, already_active: true });
      if (cfg.suspended_at) return json({ error: "already_suspended" }, 400);
      const { error } = await supabase
        .from(cfgTable)
        .update({
          cancel_at_period_end: false,
          cancel_effective_date: null,
          cancelled_at: null,
          subscription_status: "active",
        })
        .eq(entityCol, entityId);
      if (error) return json({ error: error.message }, 400);
      return json({ success: true });
    }

    // Lift a suspension: clears the cancellation and raises a fresh monthly invoice.
    if (action === "reactivate_subscription") {
      if (fee <= 0) return json({ error: "zero_subscription_amount" }, 400);
      const periodStart = today();
      const periodEnd = addMonth(periodStart);
      let invoice = openSubscription;
      if (!invoice) {
        const insert: any = {
          amount: fee,
          currency,
          subscription_amount: fee,
          once_off_amount: 0,
          line_items: [
            { kind: "monthly_subscription", description: `Monthly subscription (${periodStart} - ${periodEnd})`, amount: fee },
          ],
          period_start: periodStart,
          period_end: periodEnd,
          status: "pending",
          invoice_kind: "activation",
          owner_id: ownerId,
        };
        insert[entityCol] = entityId;
        const { data: created, error } = await supabase
          .from("subscription_invoices")
          .insert(insert)
          .select("id, payfast_token")
          .single();
        if (error) return json({ error: error.message }, 400);
        invoice = created as any;
      }
      const { error: cfgError } = await supabase
        .from(cfgTable)
        .update({
          cancel_at_period_end: false,
          cancel_effective_date: null,
          cancelled_at: null,
          suspended_at: null,
          billing_enabled: true,
          subscription_status: "pending",
        })
        .eq(entityCol, entityId);
      if (cfgError) return json({ error: cfgError.message }, 400);
      return json({ success: true, invoice_id: invoice!.id, pay_url: payUrl((invoice as any).payfast_token) });
    }

    // Staff-only: suspend right now (used by the daily cron once the paid period lapses).
    if (action === "suspend_now") {
      if (!isStaff) return json({ error: "forbidden" }, 403);
      const { error } = await supabase
        .from(cfgTable)
        .update({ subscription_status: "suspended", suspended_at: new Date().toISOString() })
        .eq(entityCol, entityId);
      if (error) return json({ error: error.message }, 400);
      return json({ success: true });
    }



    if (action === "send_due_reminder") {
      const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
      // Staff copies: admin / fearless leader / dev
      const { data: staffRoles } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("role", ["admin", "fearless_leader", "dev"]);
      const staffIds = [...new Set((staffRoles ?? []).map((r: any) => r.user_id))];
      const { data: staffProfiles } = staffIds.length
        ? await supabase.from("profiles").select("email").in("id", staffIds)
        : { data: [] as any[] };
      const staffEmails = [...new Set((staffProfiles ?? []).map((p: any) => p.email).filter(Boolean))];

      const html = reminderHtml({
        entityName,
        setupAmount: openSetup ? Number(openSetup.amount) : setupTotal,
        setupUrl: payUrl(openSetup?.payfast_token),
        monthlyAmount: openSubscription ? Number(openSubscription.amount) : fee,
        dueBy: paidStart,
        subscriptionUrl: payUrl(openSubscription?.payfast_token),
        currency,
      });
      const subject = `Setup & subscription payment due${paidStart ? ` by ${paidStart}` : ""} - ${entityName}`;
      const recipients = [...new Set([ownerEmail, ...staffEmails].filter(Boolean))] as string[];
      if (!recipients.length) return json({ error: "no_recipients" }, 400);
      const res = await resend.emails.send({ from: FROM_EMAIL, to: recipients, subject, html });
      if (res.error) {
        const msg = (res.error as any)?.message || JSON.stringify(res.error);
        console.error("[subscription-billing-actions] reminder send failed", msg);
        return json({ error: `email_send_failed: ${msg}` }, 400);
      }
      if (openSubscription || openSetup) {
        await supabase
          .from("subscription_invoices")
          .update({ email_sent_at: new Date().toISOString() })
          .in("id", [openSetup?.id, openSubscription?.id].filter(Boolean) as string[]);
      }
      return json({ success: true, sent_to: recipients });
    }

    if (action === "deliver_invoice") {
      const invoiceId = String(body.invoice_id || "");
      const invoice = (invoices ?? []).find((i: any) => i.id === invoiceId);
      if (!invoice || invoice.status !== "paid") return json({ error: "paid_invoice_not_found" }, 404);
      const { data: delivery, error: deliveryError } = await supabase.functions.invoke(
        "generate-subscription-invoice-pdf",
        { body: { invoice_id: invoiceId } },
      );
      if (deliveryError || !delivery?.success) {
        return json({ error: delivery?.error || deliveryError?.message || "invoice_delivery_failed" }, 400);
      }
      return json({ success: true, pdf_url: delivery.pdf_url });
    }

    // Staff-only manual settlement (e.g. PayFast confirmed but the ITN was lost).
    if (action === "mark_invoice_paid") {
      if (!isStaff) return json({ error: "forbidden" }, 403);
      const invoiceId = String(body.invoice_id || "");
      if (!invoiceId) return json({ error: "invoice_id is required" }, 400);
      const { data: inv } = await supabase
        .from("subscription_invoices")
        .select("*")
        .eq("id", invoiceId)
        .maybeSingle();
      if (!inv) return json({ error: "invoice_not_found" }, 404);
      if (inv.status === "paid") return json({ success: true, already_paid: true });

      const now = new Date().toISOString();
      await supabase
        .from("subscription_invoices")
        .update({
          status: "paid",
          paid_at: now,
          payfast_payment_id: body.payment_reference ? String(body.payment_reference) : inv.payfast_payment_id,
          metadata: { ...(inv.metadata ?? {}), manual_settlement: { by: user?.id ?? "system", at: now } },
        })
        .eq("id", invoiceId);

      await supabase
        .from("subscription_charge_items")
        .update({ invoiced_at: now })
        .eq("invoiced_on_invoice_id", invoiceId)
        .is("invoiced_at", null);

      if (String(inv.invoice_kind) !== "once_off") {
        await supabase
          .from(cfgTable)
          .update({ subscription_status: "active", current_period_end: addMonth(inv.period_start), cancelled_at: null, last_invoice_id: invoiceId })
          .eq(entityCol, entityId);
      } else {
        await supabase.from(cfgTable).update({ last_invoice_id: invoiceId }).eq(entityCol, entityId);
      }

      await supabase.from("billing_transactions").insert({
        property_id: inv.property_id,
        owner_id: inv.owner_id,
        type: String(inv.invoice_kind) === "once_off" ? "once_off" : "subscription",
        amount: inv.amount,
        currency: inv.currency,
        reference_id: invoiceId,
        calculated_by: "manual_settlement",
        metadata: { portfolio_id: inv.portfolio_id, period_start: inv.period_start, period_end: inv.period_end },
      });

      return json({ success: true, invoice_id: invoiceId });
    }

    return json({ error: "unknown_action" }, 400);

  } catch (e) {
    console.error("[subscription-billing-actions]", e);
    return json({ error: String(e) }, 500);
  }
});
