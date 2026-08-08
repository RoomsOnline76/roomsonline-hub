import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  computeExpectedBilling,
  invoiceStream,
  type ExpectedBillingConfig,
} from "@/lib/billingExpected";
import { resolveBillingSchedule } from "@/lib/billingSchedule";

export type BillingEntityScope = "property" | "portfolio";

export type BillingEntityStatus =
  | "active"
  | "trial"
  | "pending"
  | "past_due"
  | "cancelled"
  | "reservation_only";

export interface BillingEntityRow {
  key: string;
  id: string;
  scope: BillingEntityScope;
  name: string;
  status: BillingEntityStatus;
  /** Contracted monthly recurring total (ZAR). */
  monthlyExpected: number;
  /** Contracted once-off setup total (ZAR). */
  setupExpected: number;
  invoicedMonthly: number;
  invoicedOnceOff: number;
  paidMonthly: number;
  paidOnceOff: number;
  balance: number;
  overdue: boolean;
  /** First paid billing date (engagement + free period). */
  firstBillingDate: string | null;
  rooms: number;
  requiresCustomFee: boolean;
}

export interface PropertyBillingRevenue {
  rows: BillingEntityRow[];
  totals: {
    /** Recurring total for entities actively billing. */
    monthlyExpected: number;
    /** Recurring total across every configured entity, billing or not. */
    contractedMonthly: number;
    setupExpected: number;
    invoicedMonthly: number;
    invoicedOnceOff: number;
    paidMonthly: number;
    paidOnceOff: number;
    outstanding: number;
    overdue: number;
    activeMrr: number;
    counts: Record<BillingEntityStatus, number>;
  };
}

interface Range {
  start: string;
  end: string;
}

const EMPTY_COUNTS: Record<BillingEntityStatus, number> = {
  active: 0,
  trial: 0,
  pending: 0,
  past_due: 0,
  cancelled: 0,
  reservation_only: 0,
};

const CONFIG_FIELDS = `
  billing_strategy, subscription_fee_monthly, enterprise_custom_fee, tier_pricing_json,
  room_count_override, channel_manager_enabled, channel_manager_per_unit_fee,
  white_label_allowed, white_label_monthly_fee, white_label_setup_fee, white_label_billing_mode,
  branding_addon_enabled, branding_addon_monthly_fee, branding_addon_setup_fee,
  pricelabs_allowed, pricelabs_monthly_fee, pricelabs_setup_fee, byo_gateway_monthly_fee,
  payment_facilitator_enabled, subscription_status, billing_enabled, engagement_date,
  billing_start_date, free_period_days, billing_anchor_day, current_period_end
`;

function resolveStatus(
  cfg: {
    subscription_status?: string | null;
    billing_enabled?: boolean | null;
    current_period_end?: string | null;
  },
  schedule: { paidStart: string | null; inFreePeriod: boolean },
  reservationOnly: boolean,
  today: string,
): BillingEntityStatus {
  const raw = (cfg.subscription_status || "pending").toLowerCase();
  if (raw === "cancelled") return "cancelled";
  if (raw === "past_due") return "past_due";
  if (raw === "active") {
    if (cfg.current_period_end && cfg.current_period_end < today) return "past_due";
    return "active";
  }
  if (reservationOnly) return "reservation_only";
  if (schedule.paidStart && schedule.inFreePeriod) return "trial";
  return "pending";
}

/**
 * Per-property / per-portfolio subscription billing: what each client is
 * contracted to pay monthly, what has been invoiced and settled in the
 * selected period, and what remains outstanding.
 *
 * Properties that belong to a portfolio with its own billing config are rolled
 * into that portfolio row so recurring revenue is never counted twice.
 */
export function usePropertyBillingRevenue(range: Range) {
  return useQuery<PropertyBillingRevenue>({
    queryKey: ["property-billing-revenue", range.start, range.end],
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const rangeStartTs = `${range.start}T00:00:00.000Z`;
      const rangeEndTs = `${range.end}T23:59:59.999Z`;

      const [propCfgRes, portCfgRes, membersRes, portfoliosRes, invoicesRes] = await Promise.all([
        supabase
          .from("property_billing_configs")
          .select(`property_id, ${CONFIG_FIELDS}`),
        supabase
          .from("portfolio_billing_configs")
          .select(`portfolio_id, ${CONFIG_FIELDS}`),
        supabase.from("property_portfolio_members").select("property_id, portfolio_id"),
        supabase.from("property_portfolios").select("id, name"),
        supabase
          .from("subscription_invoices")
          .select(
            "id, property_id, portfolio_id, amount, status, invoice_kind, paid_at, created_at, period_end",
          )
          .gte("created_at", rangeStartTs)
          .lte("created_at", rangeEndTs),
      ]);

      for (const res of [propCfgRes, portCfgRes, membersRes, portfoliosRes, invoicesRes]) {
        if (res.error) throw res.error;
      }

      const propertyCfgs = (propCfgRes.data ?? []) as Array<Record<string, unknown>>;
      const portfolioCfgs = (portCfgRes.data ?? []) as Array<Record<string, unknown>>;
      const propertyIds = propertyCfgs.map((c) => String(c.property_id)).filter(Boolean);

      const [propsRes, roomsRes, hostfullyRes] = await Promise.all([
        propertyIds.length
          ? supabase
              .from("properties")
              .select("id, name, is_active, allow_custom_payment_provider, payment_mode")
              .in("id", propertyIds)
          : Promise.resolve({ data: [], error: null } as never),
        propertyIds.length
          ? supabase.from("rolos_rooms").select("property_id").in("property_id", propertyIds)
          : Promise.resolve({ data: [], error: null } as never),
        propertyIds.length
          ? supabase
              .from("hostfully_room_types")
              .select("property_id, total_units")
              .in("property_id", propertyIds)
          : Promise.resolve({ data: [], error: null } as never),
      ]);

      const propertyMeta = new Map<
        string,
        { name: string; byo: boolean; reservationOnly: boolean; active: boolean }
      >();
      for (const p of (propsRes.data ?? []) as Array<Record<string, unknown>>) {
        propertyMeta.set(String(p.id), {
          name: String(p.name ?? "Unnamed property"),
          byo: !!p.allow_custom_payment_provider,
          reservationOnly: p.payment_mode === "reservation_only",
          active: p.is_active !== false,
        });
      }

      const unitCount = new Map<string, number>();
      for (const r of (roomsRes.data ?? []) as Array<{ property_id: string }>) {
        unitCount.set(r.property_id, (unitCount.get(r.property_id) ?? 0) + 1);
      }
      for (const r of (hostfullyRes.data ?? []) as Array<{
        property_id: string;
        total_units: number | null;
      }>) {
        if (unitCount.has(r.property_id)) continue;
        unitCount.set(
          r.property_id,
          (unitCount.get(r.property_id) ?? 0) + (Number(r.total_units) || 0),
        );
      }

      const portfolioOf = new Map<string, string>();
      const membersOf = new Map<string, string[]>();
      for (const m of (membersRes.data ?? []) as Array<{
        property_id: string;
        portfolio_id: string;
      }>) {
        portfolioOf.set(m.property_id, m.portfolio_id);
        membersOf.set(m.portfolio_id, [...(membersOf.get(m.portfolio_id) ?? []), m.property_id]);
      }
      const portfolioName = new Map<string, string>();
      for (const p of (portfoliosRes.data ?? []) as Array<{ id: string; name: string | null }>) {
        portfolioName.set(p.id, p.name || "Unnamed portfolio");
      }

      // Invoice aggregation keyed by entity
      type Agg = {
        invoicedMonthly: number;
        invoicedOnceOff: number;
        paidMonthly: number;
        paidOnceOff: number;
        balance: number;
        overdue: boolean;
      };
      const agg = new Map<string, Agg>();
      const bump = (key: string): Agg => {
        const existing = agg.get(key);
        if (existing) return existing;
        const fresh: Agg = {
          invoicedMonthly: 0,
          invoicedOnceOff: 0,
          paidMonthly: 0,
          paidOnceOff: 0,
          balance: 0,
          overdue: false,
        };
        agg.set(key, fresh);
        return fresh;
      };

      for (const inv of (invoicesRes.data ?? []) as Array<Record<string, unknown>>) {
        const amount = Number(inv.amount ?? 0);
        if (!Number.isFinite(amount) || amount === 0) continue;
        const status = String(inv.status ?? "pending");
        if (status === "cancelled") continue;
        const key = inv.portfolio_id
          ? `portfolio:${inv.portfolio_id}`
          : `property:${inv.property_id}`;
        const row = bump(key);
        const stream = invoiceStream(inv.invoice_kind as string | null);
        if (stream === "once_off") row.invoicedOnceOff += amount;
        else row.invoicedMonthly += amount;

        if (status === "paid") {
          const paidAt = String(inv.paid_at ?? inv.created_at ?? "").slice(0, 10);
          if (paidAt >= range.start && paidAt <= range.end) {
            if (stream === "once_off") row.paidOnceOff += amount;
            else row.paidMonthly += amount;
          }
        } else {
          row.balance += amount;
          const periodEnd = String(inv.period_end ?? "").slice(0, 10);
          if (periodEnd && periodEnd < today) row.overdue = true;
        }
      }

      const rows: BillingEntityRow[] = [];

      // Portfolio-level rows (roll up member room counts / units)
      const portfolioBilled = new Set<string>();
      for (const cfg of portfolioCfgs) {
        const portfolioId = String(cfg.portfolio_id);
        portfolioBilled.add(portfolioId);
        const memberIds = membersOf.get(portfolioId) ?? [];
        const units = memberIds.reduce((sum, id) => sum + (unitCount.get(id) ?? 0), 0);
        const byo = memberIds.some((id) => propertyMeta.get(id)?.byo);
        const reservationOnly =
          memberIds.length > 0 && memberIds.every((id) => propertyMeta.get(id)?.reservationOnly);
        const expected = computeExpectedBilling(cfg as ExpectedBillingConfig, {
          units,
          rooms: units,
          byoGateway: byo,
        });
        const schedule = resolveBillingSchedule(cfg as never, undefined, today);
        const a = agg.get(`portfolio:${portfolioId}`);
        rows.push({
          key: `portfolio:${portfolioId}`,
          id: portfolioId,
          scope: "portfolio",
          name: portfolioName.get(portfolioId) ?? "Unnamed portfolio",
          status: resolveStatus(cfg as never, schedule, reservationOnly, today),
          monthlyExpected: expected.monthly,
          setupExpected: expected.setup,
          invoicedMonthly: a?.invoicedMonthly ?? 0,
          invoicedOnceOff: a?.invoicedOnceOff ?? 0,
          paidMonthly: a?.paidMonthly ?? 0,
          paidOnceOff: a?.paidOnceOff ?? 0,
          balance: a?.balance ?? 0,
          overdue: a?.overdue ?? false,
          firstBillingDate: schedule.paidStart,
          rooms: units,
          requiresCustomFee: expected.requiresCustomFee,
        });
      }

      // Property-level rows (skipped when the parent portfolio carries the billing)
      for (const cfg of propertyCfgs) {
        const propertyId = String(cfg.property_id);
        const parent = portfolioOf.get(propertyId);
        if (parent && portfolioBilled.has(parent)) continue;
        const meta = propertyMeta.get(propertyId);
        const units = unitCount.get(propertyId) ?? 0;
        const expected = computeExpectedBilling(cfg as ExpectedBillingConfig, {
          units,
          rooms: units,
          byoGateway: !!meta?.byo,
        });
        const schedule = resolveBillingSchedule(cfg as never, undefined, today);
        const a = agg.get(`property:${propertyId}`);
        rows.push({
          key: `property:${propertyId}`,
          id: propertyId,
          scope: "property",
          name: meta?.name ?? "Unnamed property",
          status: resolveStatus(cfg as never, schedule, !!meta?.reservationOnly, today),
          monthlyExpected: expected.monthly,
          setupExpected: expected.setup,
          invoicedMonthly: a?.invoicedMonthly ?? 0,
          invoicedOnceOff: a?.invoicedOnceOff ?? 0,
          paidMonthly: a?.paidMonthly ?? 0,
          paidOnceOff: a?.paidOnceOff ?? 0,
          balance: a?.balance ?? 0,
          overdue: a?.overdue ?? false,
          firstBillingDate: schedule.paidStart,
          rooms: units,
          requiresCustomFee: expected.requiresCustomFee,
        });
      }

      const counts = { ...EMPTY_COUNTS };
      const totals = rows.reduce(
        (acc, row) => {
          counts[row.status] += 1;
          if (row.status !== "cancelled") acc.contractedMonthly += row.monthlyExpected;
          if (row.status === "active" || row.status === "past_due") {
            acc.monthlyExpected += row.monthlyExpected;
            acc.activeMrr += row.monthlyExpected;
          }
          acc.setupExpected += Math.max(0, row.setupExpected - row.invoicedOnceOff);
          acc.invoicedMonthly += row.invoicedMonthly;
          acc.invoicedOnceOff += row.invoicedOnceOff;
          acc.paidMonthly += row.paidMonthly;
          acc.paidOnceOff += row.paidOnceOff;
          acc.outstanding += row.balance;
          if (row.overdue) acc.overdue += row.balance;
          return acc;
        },
        {
          monthlyExpected: 0,
          contractedMonthly: 0,
          setupExpected: 0,
          invoicedMonthly: 0,
          invoicedOnceOff: 0,
          paidMonthly: 0,
          paidOnceOff: 0,
          outstanding: 0,
          overdue: 0,
          activeMrr: 0,
          counts,
        },
      );

      rows.sort((a, b) => b.balance - a.balance || b.monthlyExpected - a.monthlyExpected);

      return { rows, totals: { ...totals, counts } };
    },
  });
}
