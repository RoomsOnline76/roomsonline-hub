import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface PropertyPayout {
  property_id: string;
  property_name: string;
  owner_email: string | null;
  gross_amount: number;
  commission_rate: number;
  commission_amount: number;
  fees: number;
  net_amount: number;
  booking_count: number;
  has_banking: boolean;
  banking_verified: boolean;
  billing_strategy: string;
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
}

export function usePropertyPayouts(periodMonth?: string) {
  const [payouts, setPayouts] = useState<PropertyPayout[]>([]);
  const [loading, setLoading] = useState(true);

  const loadPayouts = async () => {
    try {
      setLoading(true);

      // Get completed payment transactions with booking + property info
      const { data: transactions, error: txError } = await supabase
        .from('payment_transactions')
        .select(`
          amount,
          status,
          created_at,
          bookings!inner(
            id,
            property_id,
            guest_name,
            check_in_date,
            check_out_date,
            total_price,
            status,
            payment_status,
            properties!inner(id, name, owner_email)
          )
        `)
        .eq('status', 'completed')
        .order('created_at', { ascending: false });

      if (txError) throw txError;

      // Get billing configs for all properties
      const { data: billingConfigs } = await supabase
        .from('property_billing_configs')
        .select('property_id, commission_rate, billing_strategy, white_label_allowed, white_label_monthly_fee, subscription_fee_monthly, payment_facilitator_enabled, transaction_fee_percentage');

      // Get bank details
      const { data: bankDetails } = await supabase
        .from('property_bank_details')
        .select('property_id, is_verified');

      const billingMap: Record<string, any> = {};
      (billingConfigs || []).forEach((c: any) => { billingMap[c.property_id] = c; });

      const bankMap: Record<string, { exists: boolean; verified: boolean }> = {};
      (bankDetails || []).forEach((b: any) => { bankMap[b.property_id] = { exists: true, verified: b.is_verified }; });

      // Group by property
      const propertyMap: Record<string, {
        property_name: string;
        owner_email: string | null;
        gross: number;
        count: number;
      }> = {};

      (transactions || []).forEach((tx: any) => {
        const booking = tx.bookings;
        if (!booking?.properties) return;
        const pid = booking.properties.id;
        if (!propertyMap[pid]) {
          propertyMap[pid] = {
            property_name: booking.properties.name,
            owner_email: booking.properties.owner_email,
            gross: 0,
            count: 0,
          };
        }
        propertyMap[pid].gross += tx.amount || 0;
        propertyMap[pid].count += 1;
      });

      const result: PropertyPayout[] = Object.entries(propertyMap).map(([pid, p]) => {
        const billing = billingMap[pid];
        const commRate = billing?.commission_rate || 0;
        const commAmount = p.gross * (commRate / 100);
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
          commission_rate: commRate,
          commission_amount: commAmount,
          fees: totalFees,
          net_amount: p.gross - commAmount - totalFees,
          booking_count: p.count,
          has_banking: !!bankMap[pid]?.exists,
          banking_verified: !!bankMap[pid]?.verified,
          billing_strategy: billing?.billing_strategy || 'default',
          white_label_fee: wlFee,
          subscription_fee: subFee,
          pf_enabled: pfEnabled,
        };
      });

      result.sort((a, b) => b.gross_amount - a.gross_amount);
      setPayouts(result);
    } catch (error) {
      console.error('Error loading property payouts:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadPayouts(); }, [periodMonth]);

  const stats = useMemo(() => ({
    totalDue: payouts.reduce((s, p) => s + p.net_amount, 0),
    totalCommission: payouts.reduce((s, p) => s + p.commission_amount, 0),
    totalGross: payouts.reduce((s, p) => s + p.gross_amount, 0),
    propertiesCount: payouts.length,
  }), [payouts]);

  const fetchBookingDetails = async (propertyId: string): Promise<PayoutBookingDetail[]> => {
    const { data } = await supabase
      .from('payment_transactions')
      .select(`
        bookings!inner(
          id, guest_name, check_in_date, check_out_date, total_price, status, payment_status
        )
      `)
      .eq('status', 'completed')
      .order('created_at', { ascending: false });

    return (data || [])
      .filter((tx: any) => tx.bookings?.id)
      .map((tx: any) => tx.bookings)
      .filter((b: any, i: number, arr: any[]) => arr.findIndex((x: any) => x.id === b.id) === i);
  };

  return { payouts, loading, stats, refresh: loadPayouts, fetchBookingDetails };
}
