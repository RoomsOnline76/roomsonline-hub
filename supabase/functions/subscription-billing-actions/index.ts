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
        items: setupCharges.map((c) => ({ description: c.description, amount: c.amount })),
        invoice: openSetup
          ? { id: openSetup.id, number: openSetup.invoice_number, amount: Number(openSetup.amount), pay_url: payUrl(openSetup.payfast_token) }
          : null,
        paid_invoice: paidSetup
          ? { id: paidSetup.id, number: paidSetup.invoice_number, amount: Number(paidSetup.amount), pdf_url: paidSetup.pdf_url }
          : null,
      },
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
      },
      cancelled_count: cancelled.length,
    });

    // Contracted setup fees are payable on signature, so the once-off invoice is
    // raised automatically the first time the account is read — no manual step.
    const ensureSetupInvoice = async () => {
      if (openSetup) return openSetup;
      if (setupTotal <= 0) return null;
      // A setup fee is once-off. A paid invoice satisfying the current
      // contracted amount must never be raised again merely because the
      // account summary is refreshed. A later increase/new fee still creates
      // an invoice for the additional amount through its queued charge item.
      const paidSetupAmount = (invoices ?? [])
        .filter((i: any) => i.invoice_kind === "once_off" && i.status === "paid")
        .reduce((max: number, i: any) => Math.max(max, Number(i.amount) || 0), 0);
      if (paidSetupAmount >= setupTotal && pendingSetupItems.length === 0) return null;
      const insert: any = {
        amount: setupTotal,
        currency,
        subscription_amount: 0,
        once_off_amount: setupTotal,
        line_items: setupCharges.map((c) => ({
          kind: c.kind,
          description: c.description,
          amount: c.amount,
          charge_item_id: c.itemIds[0] ?? null,
        })),
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
