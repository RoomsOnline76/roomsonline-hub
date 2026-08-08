/**
 * ROL Account — owner-facing data access.
 *
 * Resolves which properties / portfolios the signed-in user owns, then loads
 * every financial document tied to them: subscription invoices, ROL invoices,
 * payout statements, billing config and booking revenue for analytics.
 *
 * Row-level security scopes each read to the caller, so this hook never filters
 * for security — only for the scope the owner selected on screen.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import {
  buildLedger,
  computeBalances,
  computePendingSettlement,
  expectedSetupFee,

  monthlySeries,
  subscriptionView,
  type OwnerBillingConfig,
  type OwnerPayoutStatement,
  type OwnerRolInvoice,
  type OwnerScope,
  type OwnerSubscriptionInvoice,
  type PendingSettlement,
  type RevenueRow,
  type SettlementBooking,
} from "@/lib/ownerAccount";
import { resolveBookingCommission, type CommissionConfigLike } from "@/lib/commissionResolver";
import { DEFAULT_VAT_SETTINGS, type VatSettings } from "@/lib/payoutStatement";


interface ScopeRow {
  id: string;
  name: string;
}

export function useOwnerScopes() {
  const { user } = useAuth();
  const [scopes, setScopes] = useState<OwnerScope[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!user) return;
      setLoading(true);
      try {
        const { data: props } = await supabase
          .from("properties")
          .select("id, name")
          .is("permanently_deleted_at", null)
          .eq("is_active", true)
          .order("name");

        const propertyIds = (props || []).map((p) => p.id);

        const { data: members } = propertyIds.length
          ? await supabase
              .from("property_portfolio_members")
              .select("portfolio_id, property_id, property_portfolios(id, name)")
              .in("property_id", propertyIds)
          : { data: [] as unknown[] };

        const portfolios = new Map<string, OwnerScope>();
        for (const m of (members || []) as unknown as {
          portfolio_id: string;
          property_id: string;
          property_portfolios: { id: string; name: string } | null;
        }[]) {
          if (!m.property_portfolios) continue;
          const existing = portfolios.get(m.portfolio_id);
          if (existing) existing.propertyIds.push(m.property_id);
          else
            portfolios.set(m.portfolio_id, {
              kind: "portfolio",
              id: m.portfolio_id,
              name: m.property_portfolios.name,
              propertyIds: [m.property_id],
            });
        }

        const propertyScopes: OwnerScope[] = ((props || []) as ScopeRow[]).map((p) => ({
          kind: "property",
          id: p.id,
          name: p.name,
          propertyIds: [p.id],
        }));

        if (!cancelled) setScopes([...portfolios.values(), ...propertyScopes]);
      } catch (err) {
        console.error("[owner-account] scope load failed", err);
        toast.error("Could not load your properties");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  return { scopes, loading };
}

export interface OwnerAccountData {
  config: OwnerBillingConfig | null;
  subscriptionInvoices: OwnerSubscriptionInvoice[];
  rolInvoices: OwnerRolInvoice[];
  payouts: OwnerPayoutStatement[];
  revenue: RevenueRow[];
  unitCount: number;
  /** True when any property in scope settles through its own payment gateway. */
  byoGateway: boolean;
  /** ROL-held booking funds not yet covered by a payout statement. */
  pendingSettlement: PendingSettlement;
  vat: VatSettings;
}

const EMPTY_PENDING: PendingSettlement = { amount: 0, gross: 0, commission: 0, bookings: 0 };

const EMPTY: OwnerAccountData = {
  config: null,
  subscriptionInvoices: [],
  rolInvoices: [],
  payouts: [],
  revenue: [],
  unitCount: 0,
  byoGateway: false,
  pendingSettlement: EMPTY_PENDING,
  vat: DEFAULT_VAT_SETTINGS,
};


export function useOwnerAccount(scope: OwnerScope | null) {
  const [data, setData] = useState<OwnerAccountData>(EMPTY);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!scope) {
      setData(EMPTY);
      return;
    }
    setLoading(true);
    try {
      const keyCol = scope.kind === "property" ? "property_id" : "portfolio_id";
      const cfgTable = scope.kind === "property" ? "property_billing_configs" : "portfolio_billing_configs";

      const [cfgRes, subRes, invRes, payRes, bookRes, unitRes, propRes] = await Promise.all([
        (supabase as any).from(cfgTable).select("*").eq(keyCol, scope.id).maybeSingle(),
        (supabase as any)
          .from("subscription_invoices")
          .select(
            "id, invoice_number, amount, subscription_amount, once_off_amount, currency, status, invoice_kind, period_start, period_end, pdf_url, payfast_token, paid_at, created_at, line_items",
          )
          .eq(keyCol, scope.id)
          .order("created_at", { ascending: false })
          .limit(200),
        (supabase as any)
          .from("rol_property_invoices")
          .select("*")
          .eq(keyCol, scope.id)
          .neq("status", "void")
          .order("created_at", { ascending: false })
          .limit(200),
        (supabase as any)
          .from("property_payout_statements")
          .select("*")
          .eq(keyCol, scope.id)
          .in("status", ["finalised", "paid"])
          .order("period_end", { ascending: false })
          .limit(200),
        supabase
          .from("bookings")
          .select(
            "id, total_price, check_in_date, status, payment_status, property_id, calculated_commission, commission_rate_applied, commission_type, integration_type, booking_channel, source_url, created_at",
          )
          .in("property_id", scope.propertyIds)
          .limit(2000),
        supabase
          .from("rolos_rooms")
          .select("id", { count: "exact", head: true })
          .in("property_id", scope.propertyIds),
        supabase
          .from("properties")
          .select("allow_custom_payment_provider")
          .in("id", scope.propertyIds),
      ]);

      const bookings = ((bookRes.data || []) as unknown as SettlementBooking[]).filter(Boolean);
      const bookingIds = bookings.map((b) => b.id);

      const [lineRes, txRes] = bookingIds.length
        ? await Promise.all([
            (supabase as any)
              .from("property_payout_statement_lines")
              .select("booking_id")
              .in("booking_id", bookingIds)
              .limit(4000),
            (supabase as any)
              .from("payment_transactions")
              .select("booking_id, credential_source, status")
              .in("booking_id", bookingIds)
              .limit(4000),
          ])
        : [{ data: [] }, { data: [] }];

      const statementedBookingIds = new Set(
        ((lineRes?.data || []) as { booking_id: string | null }[])
          .map((l) => l.booking_id)
          .filter((id): id is string => !!id),
      );
      const byoBookingIds = new Set(
        ((txRes?.data || []) as { booking_id: string | null; credential_source: string | null }[])
          .filter((t) => String(t.credential_source || "").toLowerCase() === "byo" && t.booking_id)
          .map((t) => t.booking_id as string),
      );

      const config = (cfgRes?.data || null) as OwnerBillingConfig | null;

      const revenueMap = new Map<string, RevenueRow>();
      const CONFIRMED = ["confirmed", "completed", "checked_in", "checked_out"];
      for (const b of bookings) {
        if (!b.check_in_date) continue;
        if (!CONFIRMED.includes(String(b.status || "").toLowerCase())) continue;
        const month = b.check_in_date.slice(0, 7);
        const row = revenueMap.get(month) || { month, gross: 0, bookings: 0 };
        row.gross += Number(b.total_price || 0);
        row.bookings += 1;
        revenueMap.set(month, row);
      }

      const pendingSettlement = computePendingSettlement(bookings, {
        statementedBookingIds,
        byoBookingIds,
        resolveCommission: (booking, gross) =>
          resolveBookingCommission(booking, gross, config as unknown as CommissionConfigLike).amount,
      });

      setData({
        config,
        subscriptionInvoices: (subRes?.data || []) as OwnerSubscriptionInvoice[],
        rolInvoices: (invRes?.data || []) as OwnerRolInvoice[],
        payouts: (payRes?.data || []) as OwnerPayoutStatement[],
        revenue: [...revenueMap.values()].sort((a, b) => a.month.localeCompare(b.month)),
        unitCount: unitRes?.count || 0,
        byoGateway: ((propRes?.data || []) as { allow_custom_payment_provider: boolean | null }[]).some(
          (p) => !!p.allow_custom_payment_provider,
        ),
        pendingSettlement,
      });

    } catch (err) {
      console.error("[owner-account] load failed", err);
      toast.error("Could not load your account");
    } finally {
      setLoading(false);
    }
  }, [scope]);

  useEffect(() => {
    void load();
  }, [load]);

  const derived = useMemo(() => {
    const ledger = buildLedger({
      subscriptionInvoices: data.subscriptionInvoices,
      rolInvoices: data.rolInvoices,
      payouts: data.payouts,
    });

    // Once-off (setup) is payable on signature. Only count it as invoiced when a
    // live (non-cancelled/void) invoice carries it.
    const contractedSetup = expectedSetupFee(data.config, data.unitCount, data.byoGateway);
    const invoicedSetup = data.subscriptionInvoices
      .filter((inv) => !["cancelled", "canceled", "void"].includes(String(inv.status)))
      .reduce(
        (sum, inv) =>
          sum +
          Number(
            inv.once_off_amount || (inv.invoice_kind === "once_off" || inv.invoice_kind === "setup" ? inv.amount : 0) || 0,
          ),
        0,
      );
    const uninvoicedSetupDue = data.config?.billing_enabled === false ? 0 : Math.max(0, contractedSetup - invoicedSetup);

    return {
      balances: computeBalances({
        subscriptionInvoices: data.subscriptionInvoices,
        rolInvoices: data.rolInvoices,
        payouts: data.payouts,
        uninvoicedSetupDue,
        setupDueDate: data.config?.engagement_date || null,
        pendingSettlement: data.pendingSettlement.amount,

      }),
      ledger,
      subscription: subscriptionView(data.config),
      series: monthlySeries(data.revenue, ledger),
    };
  }, [data]);


  return { ...data, ...derived, loading, refresh: load };
}
