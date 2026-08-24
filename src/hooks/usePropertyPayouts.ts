import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ALL_REVENUE_PAYMENT_STATUSES } from "@/lib/revenueStatuses";
import {
  CommissionType,
  resolveBookingCommission,
  CommissionConfigLike,
  CommissionGlobalsLike,
  pickGlobals,
} from "@/lib/commissionResolver";

/** Where the money figure came from: a settled gateway transaction, or the booking record itself. */
export type PayoutSource = "gateway" | "booking";

/** Who actually received the guest's money. */
export type SettlementRoute = "rol" | "byo";
export type SettlementMode = "payout" | "invoice" | "mixed";

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
  /** Dominant commission origin across the property's bookings in the period. */
  commission_type: CommissionType;
  has_banking: boolean;
  banking_verified: boolean;
  billing_strategy: string;
  billing_scope: "property" | "portfolio";
  white_label_fee: number;
  subscription_fee: number;
  /** Monthly fees invoiced separately — reported for context, never netted off payouts. */
  monthly_fees: number;
  pf_enabled: boolean;


  /** Settlement split — funds ROL actually held vs funds that landed in the owner's own account. */
  rol_gross: number;
  byo_gross: number;
  rol_commission: number;
  byo_commission: number;
  /** ROL-as-payment-provider recovery, charged on ROL-processed value only. */
  pf_fee: number;
  pf_fee_rate: number;
  /** Cash we actually pay out to the owner (never negative). */
  net_payout: number;
  /** Cash the owner owes us (BYO commission + anything the payout could not absorb). */
  invoiced_amount: number;
  settlement_mode: SettlementMode;
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
  settlement: SettlementRoute;
}


// payment_transactions.status is written as 'paid' by the gateway handlers;
// older/other providers may write 'completed'/'succeeded'. Accept all of them.
const SETTLED_TX_STATUSES = ['paid', 'completed', 'succeeded', 'success'];
// Cancelled/refunded stays are never paid out to the property.
const EXCLUDED_BOOKING_STATUSES = ['cancelled', 'canceled', 'refunded', 'no_show'];
// Booking-level paid markers used when no gateway transaction exists.
const PAID_BOOKING_STATUSES = ALL_REVENUE_PAYMENT_STATUSES;

/**
 * Processed refunds are money returned to the guest — they must come off the
 * gross before commission and payout are computed. Refunds still awaiting
 * approval/execution are reported so the funds can be withheld.
 */
async function loadRefundsByBooking(bookingIds: string[]) {
  const processed: Record<string, number> = {};
  const held: Record<string, number> = {};
  if (bookingIds.length === 0) return { processed, held };
  const { data } = await supabase
    .from('rolos_refunds')
    .select('booking_id, amount, status')
    .in('booking_id', bookingIds);
  (data || []).forEach((r: any) => {
    if (!r.booking_id) return;
    const amount = Number(r.amount) || 0;
    const status = String(r.status || '').toLowerCase();
    if (status === 'processed') processed[r.booking_id] = (processed[r.booking_id] || 0) + amount;
    else if (status === 'pending' || status === 'approved') held[r.booking_id] = (held[r.booking_id] || 0) + amount;
  });
  return { processed, held };
}



const BOOKING_ORIGIN_FIELDS =
  'id, property_id, guest_name, check_in_date, check_out_date, total_price, status, payment_status, payment_method, payment_reference, integration_type, booking_channel, source_url, calculated_commission, commission_rate_applied, commission_type';


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

/**
 * Properties whose guest payments land in the owner's own merchant account
 * (bring-your-own gateway), either configured on the property or inherited
 * from its portfolio. Used when a booking has no gateway transaction row to
 * read `credential_source` from.
 */
async function loadByoProperties(propertyIds: string[]): Promise<Set<string>> {
  const byo = new Set<string>();
  if (propertyIds.length === 0) return byo;

  const [{ data: props }, { data: members }] = await Promise.all([
    supabase.from('properties').select('id, allow_custom_payment_provider').in('id', propertyIds),
    supabase.from('property_portfolio_members').select('property_id, portfolio_id').in('property_id', propertyIds),
  ]);

  (props || []).forEach((p: any) => { if (p.allow_custom_payment_provider) byo.add(p.id); });

  const portfolioByProperty: Record<string, string> = {};
  (members || []).forEach((m: any) => { portfolioByProperty[m.property_id] = m.portfolio_id; });
  const portfolioIds = Array.from(new Set(Object.values(portfolioByProperty)));

  if (portfolioIds.length > 0) {
    const { data: pfConfigs } = await supabase
      .from('portfolio_payment_configs' as any)
      .select('portfolio_id, allow_custom_payment_provider, credentials')
      .in('portfolio_id', portfolioIds);
    const allowed = new Set(
      (pfConfigs || [])
        .filter((c: any) => c.allow_custom_payment_provider && c.credentials)
        .map((c: any) => c.portfolio_id as string),
    );
    Object.entries(portfolioByProperty).forEach(([pid, pfId]) => {
      if (allowed.has(pfId)) byo.add(pid);
    });
  }

  return byo;
}

/** Settlement route for a gateway transaction row (older rows have no marker → ROL). */
function routeFromCredentialSource(source: unknown): SettlementRoute {
  return String(source ?? '').toLowerCase() === 'byo' ? 'byo' : 'rol';
}

/** Payment methods that mean ROL's own gateway processed the money. */
const ROL_GATEWAY_METHODS = ['payfast', 'yoco', 'stripe', 'paygate', 'ozow', 'peach', 'card', 'gateway'];
/** Payment methods that mean the money landed outside ROL (owner bank / cash / channel). */
const OWNER_COLLECTED_METHODS = ['eft', 'bank', 'bank_transfer', 'cash', 'manual', 'invoice', 'offline'];

/**
 * Route for a booking with no settled gateway transaction. Payment evidence wins:
 * channel-settled and owner-banked stays never reached us, gateway references did.
 * Only with no evidence at all do we fall back to the property's configured route.
 */
function inferSettlementFromBooking(booking: any, propertyIsByo: boolean): SettlementRoute {
  const paymentStatus = String(booking?.payment_status || '').toLowerCase();
  if (paymentStatus === 'paid_externally') return 'byo';

  const method = String(booking?.payment_method || '').toLowerCase();
  if (method) {
    if (ROL_GATEWAY_METHODS.some((m) => method.includes(m))) return 'rol';
    if (OWNER_COLLECTED_METHODS.some((m) => method.includes(m))) return 'byo';
  }
  if (booking?.payment_reference) return 'rol';

  return propertyIsByo ? 'byo' : 'rol';
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
          credential_source,
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
      const bookingGross: Record<string, {
        booking: any; gross: number; source: PayoutSource; settlement: SettlementRoute;
      }> = {};
      (transactions || []).forEach((tx: any) => {
        const booking = tx.bookings;
        if (!booking?.properties) return;
        if (EXCLUDED_BOOKING_STATUSES.includes(String(booking.status || '').toLowerCase())) return;
        if (!bookingGross[booking.id]) {
          bookingGross[booking.id] = {
            booking, gross: 0, source: 'gateway', settlement: routeFromCredentialSource(tx.credential_source),
          };
        }
        // A single BYO leg means the money never reached us.
        if (routeFromCredentialSource(tx.credential_source) === 'byo') bookingGross[booking.id].settlement = 'byo';
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
        bookingGross[b.id] = { booking: b, gross, source: 'booking', settlement: 'rol' };
      });

      // Net processed refunds off the gross, and drop bookings fully refunded.
      const refundMaps = await loadRefundsByBooking(Object.keys(bookingGross));
      Object.entries(bookingGross).forEach(([bookingId, entry]) => {
        const refunded = refundMaps.processed[bookingId] || 0;
        if (refunded <= 0) return;
        entry.gross = Math.max(0, entry.gross - refunded);
        if (entry.gross <= 0.01) delete bookingGross[bookingId];
      });

      const propertyIds = Array.from(
        new Set(Object.values(bookingGross).map((b) => b.booking.properties.id as string)),
      );


      const [scopes, terms, byoProperties, bankRes, globalsRes, schedules, gwRes] = await Promise.all([
        loadBillingScopes(propertyIds),
        loadCommercialTerms(propertyIds),
        loadByoProperties(propertyIds),
        supabase.from('property_bank_details').select('property_id, is_verified').in('property_id', propertyIds),
        supabase.from('billing_global_defaults').select('*'),
        listGatewaySchedules(),
        supabase
          .from('property_billing_configs')
          .select('property_id, gateway_billing_config_id, gateway_percentage_override, gateway_fixed_fee_override')
          .in('property_id', propertyIds),
      ]);


      // Bookings with no gateway record: read the payment evidence first, and only
      // fall back to the property's configured route when there is none.
      Object.values(bookingGross).forEach((entry) => {
        if (entry.source !== 'booking') return;
        entry.settlement = inferSettlementFromBooking(
          entry.booking,
          byoProperties.has(entry.booking.properties.id),
        );
      });


      const bankMap: Record<string, { exists: boolean; verified: boolean }> = {};
      (bankRes.data || []).forEach((b: any) => { bankMap[b.property_id] = { exists: true, verified: b.is_verified }; });

      const globalRows = (globalsRes.data || []) as any[];

      const propertyMap: Record<string, {
        property_name: string;
        owner_email: string | null;
        gross: number;
        commission: number;
        rolGross: number;
        byoGross: number;
        rolCommission: number;
        byoCommission: number;
        bookingIds: Set<string>;
        bookingRecorded: number;
        typeCounts: Record<string, number>;
      }> = {};

      Object.values(bookingGross).forEach(({ booking, gross, source, settlement }) => {
        const pid = booking.properties.id as string;
        const resolved = scopes[pid];
        const config = resolved?.config || null;
        const globals = pickGlobals(globalRows, config?.billing_strategy);

        if (!propertyMap[pid]) {
          propertyMap[pid] = {
            property_name: booking.properties.name,
            owner_email: booking.properties.owner_email,
            gross: 0,
            commission: 0,
            rolGross: 0,
            byoGross: 0,
            rolCommission: 0,
            byoCommission: 0,
            bookingIds: new Set<string>(),
            bookingRecorded: 0,
            typeCounts: {} as Record<string, number>,
          };
        }

        const type = booking.commission_type || undefined;
        const termKey = `${pid}:${type === 'pms' ? 'pms' : 'listing'}`;
        const commission = resolveBookingCommission(booking, gross, config, globals, terms[termKey] ?? null);

        propertyMap[pid].gross += gross;
        propertyMap[pid].commission += commission.amount;
        if (settlement === 'byo') {
          propertyMap[pid].byoGross += gross;
          propertyMap[pid].byoCommission += commission.amount;
        } else {
          propertyMap[pid].rolGross += gross;
          propertyMap[pid].rolCommission += commission.amount;
        }
        propertyMap[pid].bookingIds.add(booking.id);
        if (source === 'booking') propertyMap[pid].bookingRecorded += 1;
        propertyMap[pid].typeCounts[commission.type] = (propertyMap[pid].typeCounts[commission.type] || 0) + 1;
      });


      const globalTxFee = Number(
        (globalRows.find((r: any) => r.default_transaction_fee != null)?.default_transaction_fee) ?? 0,
      ) || 0;


      const result: PropertyPayout[] = Object.entries(propertyMap).map(([pid, p]) => {
        const resolved = scopes[pid];
        const billing: any = resolved?.config || null;
        const commAmount = p.commission;
        const effectiveRate = p.gross > 0 ? (commAmount / p.gross) * 100 : 0;
        const wlFee = billing?.white_label_allowed ? (billing.white_label_monthly_fee || 0) : 0;
        const subFee = billing?.subscription_fee_monthly || 0;
        const pfEnabled = billing?.payment_facilitator_enabled || false;
        // ROL-as-payment-provider recovery only applies to value we actually processed.
        const pfRate = pfEnabled
          ? Number(billing?.transaction_fee_percentage ?? globalTxFee) || 0
          : 0;
        const pfFee = p.rolGross * (pfRate / 100);
        // Monthly subscription / white-label fees are billed as their own invoices —
        // they are reported here for context but never deducted from booking cash.
        const monthlyFees = wlFee + subFee;
        const totalFees = pfFee;

        // Cash we hold for the owner, after our commission and the transaction fee on that cash.
        const payoutBeforeInvoice = p.rolGross - p.rolCommission - pfFee;
        const netPayout = Math.max(0, payoutBeforeInvoice);
        // Commission on money that never reached us is invoiced to the owner.
        const invoiced = p.byoCommission + Math.max(0, -payoutBeforeInvoice);


        const settlementMode: SettlementMode =
          p.byoGross > 0 && p.rolGross > 0 ? 'mixed' : p.byoGross > 0 ? 'invoice' : 'payout';

        return {
          property_id: pid,
          property_name: p.property_name,
          owner_email: p.owner_email,
          gross_amount: p.gross,
          commission_rate: effectiveRate,
          commission_amount: commAmount,
          fees: totalFees,
          net_amount: netPayout,
          booking_count: p.bookingIds.size,
          booking_recorded_count: p.bookingRecorded,
          commission_type: (Object.entries(p.typeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'pms') as CommissionType,
          has_banking: !!bankMap[pid]?.exists,
          banking_verified: !!bankMap[pid]?.verified,
          billing_strategy: billing?.billing_strategy || 'default',
          billing_scope: resolved?.scope || 'property',
          white_label_fee: wlFee,
          subscription_fee: subFee,
          monthly_fees: monthlyFees,

          pf_enabled: pfEnabled,
          rol_gross: p.rolGross,
          byo_gross: p.byoGross,
          rol_commission: p.rolCommission,
          byo_commission: p.byoCommission,
          pf_fee: pfFee,
          pf_fee_rate: pfRate,
          net_payout: netPayout,
          invoiced_amount: invoiced,
          settlement_mode: settlementMode,
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
    totalDue: payouts.reduce((s, p) => s + p.net_payout, 0),
    totalCommission: payouts.reduce((s, p) => s + p.commission_amount, 0),
    totalGross: payouts.reduce((s, p) => s + p.gross_amount, 0),
    /** Guest money that landed in ROL's own account. */
    totalRolGross: payouts.reduce((s, p) => s + p.rol_gross, 0),
    /** Guest money collected by the owner's gateway or a sales channel. */
    totalByoGross: payouts.reduce((s, p) => s + p.byo_gross, 0),

    totalInvoiced: payouts.reduce((s, p) => s + p.invoiced_amount, 0),
    totalPfFees: payouts.reduce((s, p) => s + p.pf_fee, 0),
    propertiesCount: payouts.length,
  }), [payouts]);

  const fetchBookingDetails = async (propertyId: string): Promise<PayoutBookingDetail[]> => {
    let txQuery = supabase
      .from('payment_transactions')
      .select(`amount, created_at, credential_source, bookings!inner(${BOOKING_ORIGIN_FIELDS})`)
      .in('status', SETTLED_TX_STATUSES)
      .eq('bookings.property_id', propertyId)
      .order('created_at', { ascending: false });
    if (from) txQuery = txQuery.gte('created_at', from);
    if (to) txQuery = txQuery.lt('created_at', to);

    const { data } = await txQuery;

    const grouped: Record<string, {
      booking: any; gross: number; source: PayoutSource; settlement: SettlementRoute;
    }> = {};
    (data || []).forEach((tx: any) => {
      const b = tx.bookings;
      if (!b?.id) return;
      if (EXCLUDED_BOOKING_STATUSES.includes(String(b.status || '').toLowerCase())) return;
      if (!grouped[b.id]) {
        grouped[b.id] = { booking: b, gross: 0, source: 'gateway', settlement: routeFromCredentialSource(tx.credential_source) };
      }
      if (routeFromCredentialSource(tx.credential_source) === 'byo') grouped[b.id].settlement = 'byo';
      grouped[b.id].gross += Number(tx.amount) || 0;
    });

    let paidQuery = supabase
      .from('bookings')
      .select(`${BOOKING_ORIGIN_FIELDS}, created_at`)
      .eq('property_id', propertyId)
      .in('payment_status', PAID_BOOKING_STATUSES)
      .order('created_at', { ascending: false });
    if (from) paidQuery = paidQuery.gte('created_at', from);
    if (to) paidQuery = paidQuery.lt('created_at', to);

    const { data: paidBookings } = await paidQuery;
    (paidBookings || []).forEach((b: any) => {
      if (!b?.id || grouped[b.id]) return;
      if (EXCLUDED_BOOKING_STATUSES.includes(String(b.status || '').toLowerCase())) return;
      const gross = Number(b.total_price) || 0;
      if (gross <= 0) return;
      grouped[b.id] = { booking: b, gross, source: 'booking', settlement: 'rol' };
    });

    const propertyRefunds = await loadRefundsByBooking(Object.keys(grouped));
    Object.entries(grouped).forEach(([bookingId, entry]) => {
      const refunded = propertyRefunds.processed[bookingId] || 0;
      if (refunded <= 0) return;
      entry.gross = Math.max(0, entry.gross - refunded);
      if (entry.gross <= 0.01) delete grouped[bookingId];
    });

    const [scopes, terms, byoProperties, globalsRes] = await Promise.all([
      loadBillingScopes([propertyId]),
      loadCommercialTerms([propertyId]),
      loadByoProperties([propertyId]),
      supabase.from('billing_global_defaults').select('*'),
    ]);
    const config = scopes[propertyId]?.config || null;
    const globals = pickGlobals((globalsRes.data || []) as any[], config?.billing_strategy);
    const propertyIsByo = byoProperties.has(propertyId);

    return Object.values(grouped).map(({ booking, gross, source, settlement }) => {
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
        source,
        settlement: source === 'booking' ? inferSettlementFromBooking(booking, propertyIsByo) : settlement,
      };
    });
  };


  return { payouts, loading, stats, lastUpdated, refresh: loadPayouts, fetchBookingDetails };
}

