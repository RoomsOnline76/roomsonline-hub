import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  CommissionType,
  resolveBookingCommission,
  CommissionConfigLike,
  CommissionGlobalsLike,
} from "@/lib/commissionResolver";

/** Where the money figure came from: a settled gateway transaction, or the booking record itself. */
export type PayoutSource = "gateway" | "booking";

export interface PropertyPayout {
  property_id: string;
  property_name: string;
  owner_email: string | null;
  gross_amount: number;
  /** Blended effective rate across the property's bookings (commission ÷ gross). */
  commission_rate: number;
  commission_amount: number;
  fees: number;
  net_amount: number;
  booking_count: number;
  /** Of booking_count, how many were counted off the booking record (no gateway transaction). */
  booking_recorded_count: number;
  has_banking: boolean;
  banking_verified: boolean;
  billing_strategy: string;
  billing_scope: "property" | "portfolio";
  white_label_fee: number;
  subscription_fee: number;
  pf_enabled: boolean;
}

export interface PayoutBookingDetail {
  id: string;
  guest_name: string;
  check_in_date: string;
  check_out_date: string;
  total_price: number;
  status: string;
  payment_status: string | null;
  gross_paid: number;
  commission_amount: number;
  commission_rate: number;
  commission_type: CommissionType;
  source: PayoutSource;
}

// payment_transactions.status is written as 'paid' by the gateway handlers;
// older/other providers may write 'completed'/'succeeded'. Accept all of them.
const SETTLED_TX_STATUSES = ['paid', 'completed', 'succeeded', 'success'];
// Cancelled/refunded stays are never paid out to the property.
const EXCLUDED_BOOKING_STATUSES = ['cancelled', 'canceled', 'refunded', 'no_show'];
// Booking-level paid markers used when no gateway transaction exists.
const PAID_BOOKING_STATUSES = ['paid', 'settled', 'completed'];


const BOOKING_ORIGIN_FIELDS =
  'id, property_id, guest_name, check_in_date, check_out_date, total_price, status, payment_status, integration_type, booking_channel, source_url, calculated_commission, commission_rate_applied, commission_type';

interface ResolvedBillingScope {
  config: (CommissionConfigLike & Record<string, any>) | null;
  scope: "property" | "portfolio";
}

/**
 * Load billing configs for a set of properties, portfolio-first:
 * a member property is billed off its portfolio config, otherwise its own row.
 */
async function loadBillingScopes(propertyIds: string[]): Promise<Record<string, ResolvedBillingScope>> {
  const out: Record<string, ResolvedBillingScope> = {};
  if (propertyIds.length === 0) return out;

  const [{ data: members }, { data: propertyConfigs }] = await Promise.all([
    supabase.from('property_portfolio_members').select('property_id, portfolio_id').in('property_id', propertyIds),
    supabase.from('property_billing_configs').select('*').in('property_id', propertyIds),
  ]);

  const propertyConfigMap: Record<string, any> = {};
  (propertyConfigs || []).forEach((c: any) => { propertyConfigMap[c.property_id] = c; });

  const portfolioByProperty: Record<string, string> = {};
  (members || []).forEach((m: any) => { portfolioByProperty[m.property_id] = m.portfolio_id; });

  const portfolioIds = Array.from(new Set(Object.values(portfolioByProperty)));
  const portfolioConfigMap: Record<string, any> = {};
  if (portfolioIds.length > 0) {
    const { data: pfConfigs } = await supabase
      .from('portfolio_billing_configs' as any)
      .select('*')
      .in('portfolio_id', portfolioIds);
    (pfConfigs || []).forEach((c: any) => { portfolioConfigMap[c.portfolio_id] = c; });
  }

  propertyIds.forEach((pid) => {
    const pfId = portfolioByProperty[pid];
    const pfConfig = pfId ? portfolioConfigMap[pfId] : null;
    if (pfConfig) out[pid] = { config: pfConfig, scope: "portfolio" };
    else out[pid] = { config: propertyConfigMap[pid] || null, scope: "property" };
  });

  return out;
}

/** Active commercial term rate per property + commission type. */
async function loadCommercialTerms(propertyIds: string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  if (propertyIds.length === 0) return out;
  const { data } = await supabase
    .from('property_commercial_terms')
    .select('property_id, commission_type, revenue_share_percent, effective_from, contract_status')
    .in('property_id', propertyIds)
    .eq('contract_status', 'active')
    .order('effective_from', { ascending: false });
  (data || []).forEach((t: any) => {
    const key = `${t.property_id}:${t.commission_type || 'listing'}`;
    if (out[key] == null && t.revenue_share_percent != null) out[key] = Number(t.revenue_share_percent);
  });
  return out;
}

export interface PayoutPeriod {
  /** Inclusive ISO start of the payment window. Omit for "all time". */
  from?: string;
  /** Exclusive ISO end of the payment window. */
  to?: string;
}

/** Accepts a { from, to } range, or a legacy "YYYY-MM" month string. */
function normalisePeriod(period?: PayoutPeriod | string): PayoutPeriod {
  if (!period) return {};
  if (typeof period === 'string') {
    const startDate = new Date(`${period}-01T00:00:00Z`);
    const end = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth() + 1, 1));
    return { from: startDate.toISOString(), to: end.toISOString() };
  }
  return period;
}

export function usePropertyPayouts(period?: PayoutPeriod | string) {
  const [payouts, setPayouts] = useState<PropertyPayout[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const { from, to } = normalisePeriod(period);

  const loadPayouts = async () => {
    try {
      setLoading(true);

      // Get settled payment transactions with booking + property info
      let query = supabase
        .from('payment_transactions')
        .select(`
          amount,
          status,
          created_at,
          bookings!inner(
            ${BOOKING_ORIGIN_FIELDS},
            properties!bookings_property_id_fkey!inner(id, name, owner_email)
          )
        `)
        .in('status', SETTLED_TX_STATUSES)
        .order('created_at', { ascending: false });

      if (from) query = query.gte('created_at', from);
      if (to) query = query.lt('created_at', to);

      const { data: transactions, error: txError } = await query;


      if (txError) throw txError;

      // Group gross per booking first — commission is resolved per booking origin.
      const bookingGross: Record<string, { booking: any; gross: number; source: PayoutSource }> = {};
      (transactions || []).forEach((tx: any) => {
        const booking = tx.bookings;
        if (!booking?.properties) return;
        if (EXCLUDED_BOOKING_STATUSES.includes(String(booking.status || '').toLowerCase())) return;
        if (!bookingGross[booking.id]) bookingGross[booking.id] = { booking, gross: 0, source: 'gateway' };
        bookingGross[booking.id].gross += Number(tx.amount) || 0;
      });

      // Second pass: bookings flagged paid on the booking record but with no settled
      // gateway transaction (manual capture, folio settlement, imported PMS stays).
      let bookingQuery = supabase
        .from('bookings')
        .select(`${BOOKING_ORIGIN_FIELDS}, created_at, properties!bookings_property_id_fkey!inner(id, name, owner_email)`)
        .in('payment_status', PAID_BOOKING_STATUSES)
        .order('created_at', { ascending: false });
      if (from) bookingQuery = bookingQuery.gte('created_at', from);
      if (to) bookingQuery = bookingQuery.lt('created_at', to);

      const { data: paidBookings } = await bookingQuery;
      (paidBookings || []).forEach((b: any) => {
        if (!b?.properties) return;
        if (bookingGross[b.id]) return; // already counted from a settled transaction
        if (EXCLUDED_BOOKING_STATUSES.includes(String(b.status || '').toLowerCase())) return;
        const gross = Number(b.total_price) || 0;
        if (gross <= 0) return;
        bookingGross[b.id] = { booking: b, gross, source: 'booking' };
      });

      const propertyIds = Array.from(
        new Set(Object.values(bookingGross).map((b) => b.booking.properties.id as string)),
      );


      const [scopes, terms, bankRes, globalsRes] = await Promise.all([
        loadBillingScopes(propertyIds),
        loadCommercialTerms(propertyIds),
        supabase.from('property_bank_details').select('property_id, is_verified').in('property_id', propertyIds),
        supabase.from('billing_global_defaults').select('*'),
      ]);

      const bankMap: Record<string, { exists: boolean; verified: boolean }> = {};
      (bankRes.data || []).forEach((b: any) => { bankMap[b.property_id] = { exists: true, verified: b.is_verified }; });

      const globalsByStrategy: Record<string, CommissionGlobalsLike & Record<string, any>> = {};
      (globalsRes.data || []).forEach((g: any) => { globalsByStrategy[g.strategy] = g; });

      const propertyMap: Record<string, {
        property_name: string;
        owner_email: string | null;
        gross: number;
        commission: number;
        bookingIds: Set<string>;
        bookingRecorded: number;
      }> = {};

      Object.values(bookingGross).forEach(({ booking, gross, source }) => {
        const pid = booking.properties.id as string;
        const resolved = scopes[pid];
        const config = resolved?.config || null;
        const globals = globalsByStrategy[String(config?.billing_strategy || 'default')] || null;

        if (!propertyMap[pid]) {
          propertyMap[pid] = {
            property_name: booking.properties.name,
            owner_email: booking.properties.owner_email,
            gross: 0,
            commission: 0,
            bookingIds: new Set<string>(),
            bookingRecorded: 0,
          };
        }

        const type = booking.commission_type || undefined;
        const termKey = `${pid}:${type === 'pms' ? 'pms' : 'listing'}`;
        const commission = resolveBookingCommission(booking, gross, config, globals, terms[termKey] ?? null);

        propertyMap[pid].gross += gross;
        propertyMap[pid].commission += commission.amount;
        propertyMap[pid].bookingIds.add(booking.id);
        if (source === 'booking') propertyMap[pid].bookingRecorded += 1;
      });

      const result: PropertyPayout[] = Object.entries(propertyMap).map(([pid, p]) => {
        const resolved = scopes[pid];
        const billing: any = resolved?.config || null;
        const commAmount = p.commission;
        const effectiveRate = p.gross > 0 ? (commAmount / p.gross) * 100 : 0;
        const wlFee = billing?.white_label_allowed ? (billing.white_label_monthly_fee || 0) : 0;
        const subFee = billing?.subscription_fee_monthly || 0;
        const pfEnabled = billing?.payment_facilitator_enabled || false;
        const txFee = pfEnabled ? p.gross * ((billing?.transaction_fee_percentage || 0) / 100) : 0;
        const totalFees = wlFee + subFee + txFee;

        return {
          property_id: pid,
          property_name: p.property_name,
          owner_email: p.owner_email,
          gross_amount: p.gross,
          commission_rate: effectiveRate,
          commission_amount: commAmount,
          fees: totalFees,
          net_amount: p.gross - commAmount - totalFees,
          booking_count: p.bookingIds.size,
          booking_recorded_count: p.bookingRecorded,
          has_banking: !!bankMap[pid]?.exists,
          banking_verified: !!bankMap[pid]?.verified,
          billing_strategy: billing?.billing_strategy || 'default',
          billing_scope: resolved?.scope || 'property',
          white_label_fee: wlFee,
          subscription_fee: subFee,
          pf_enabled: pfEnabled,
        };
      });

      result.sort((a, b) => b.gross_amount - a.gross_amount);
      setPayouts(result);
      setLastUpdated(new Date());
    } catch (error) {
      console.error('Error loading property payouts:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadPayouts(); }, [from, to]);


  const stats = useMemo(() => ({
    totalDue: payouts.reduce((s, p) => s + p.net_amount, 0),
    totalCommission: payouts.reduce((s, p) => s + p.commission_amount, 0),
    totalGross: payouts.reduce((s, p) => s + p.gross_amount, 0),
    propertiesCount: payouts.length,
  }), [payouts]);

  const fetchBookingDetails = async (propertyId: string): Promise<PayoutBookingDetail[]> => {
    const { data } = await supabase
      .from('payment_transactions')
      .select(`amount, bookings!inner(${BOOKING_ORIGIN_FIELDS})`)
      .in('status', SETTLED_TX_STATUSES)
      .eq('bookings.property_id', propertyId)
      .order('created_at', { ascending: false });

    const grouped: Record<string, { booking: any; gross: number }> = {};
    (data || []).forEach((tx: any) => {
      const b = tx.bookings;
      if (!b?.id) return;
      if (EXCLUDED_BOOKING_STATUSES.includes(String(b.status || '').toLowerCase())) return;
      if (!grouped[b.id]) grouped[b.id] = { booking: b, gross: 0 };
      grouped[b.id].gross += Number(tx.amount) || 0;
    });

    const [scopes, terms, globalsRes] = await Promise.all([
      loadBillingScopes([propertyId]),
      loadCommercialTerms([propertyId]),
      supabase.from('billing_global_defaults').select('*'),
    ]);
    const config = scopes[propertyId]?.config || null;
    const globals =
      (globalsRes.data || []).find((g: any) => g.strategy === (config?.billing_strategy || 'default')) || null;

    return Object.values(grouped).map(({ booking, gross }) => {
      const termKey = `${propertyId}:${booking.commission_type === 'pms' ? 'pms' : 'listing'}`;
      const commission = resolveBookingCommission(booking, gross, config, globals as any, terms[termKey] ?? null);
      return {
        id: booking.id,
        guest_name: booking.guest_name,
        check_in_date: booking.check_in_date,
        check_out_date: booking.check_out_date,
        total_price: booking.total_price,
        status: booking.status,
        payment_status: booking.payment_status,
        gross_paid: gross,
        commission_amount: commission.amount,
        commission_rate: commission.rate,
        commission_type: commission.type,
      };
    });
  };

  return { payouts, loading, stats, refresh: loadPayouts, fetchBookingDetails };
}
