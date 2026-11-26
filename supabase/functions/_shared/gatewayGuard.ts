// Shared checkout safety for payment gateways.
// - A checkout may only start for a real, unpaid booking of the named property,
//   for no more than what is still owed.
// - Settlement trusts only the transaction recorded at initiation: the booking,
//   property and expected amount come from our own record, never from the caller
//   or from gateway metadata, and the booking is only marked paid when the
//   confirmed amount covers what is owed.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { trustedReturnUrl } from "./authGuard.ts";

export class CheckoutError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export interface CheckoutBooking {
  id: string;
  property_id: string;
  total_price: number;
  amount_paid: number;
  outstanding: number;
}

const FALLBACK_RETURN = "https://sleepinafrica.roomsonline.co.za/";

export async function loadCheckoutBooking(
  supabase: SupabaseClient,
  bookingId: string | null | undefined,
  propertyId: string | null | undefined,
  amount: number | null | undefined,
): Promise<CheckoutBooking> {
  if (!bookingId) throw new CheckoutError("booking_id is required");
  const { data: b } = await supabase
    .from("bookings")
    .select("id, property_id, total_price, amount_paid, status, payment_status")
    .eq("id", bookingId)
    .maybeSingle();
  if (!b) throw new CheckoutError("Booking not found", 404);
  if (propertyId && b.property_id !== propertyId) throw new CheckoutError("Booking does not belong to this property", 403);
  if (b.status === "cancelled") throw new CheckoutError("Booking is cancelled");
  const total = Number(b.total_price) || 0;
  const paid = Number(b.amount_paid) || 0;
  const outstanding = Math.max(0, Math.round((total - paid) * 100) / 100);
  if (outstanding <= 0) throw new CheckoutError("Nothing outstanding on this booking");
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) throw new CheckoutError("Invalid amount");
  if (amt > outstanding + 0.01) throw new CheckoutError("Amount exceeds the balance owed");
  return { id: b.id, property_id: b.property_id, total_price: total, amount_paid: paid, outstanding };
}

export async function safeGatewayReturn(url: string | null | undefined): Promise<string> {
  return await trustedReturnUrl(url, FALLBACK_RETURN);
}

export async function recordPendingTransaction(
  supabase: SupabaseClient,
  args: { bookingId: string; amount: number; currency: string; provider: string; transactionRef: string },
): Promise<void> {
  await supabase.from("payment_transactions").insert({
    booking_id: args.bookingId,
    amount: args.amount,
    currency: args.currency,
    payment_provider: args.provider,
    transaction_ref: args.transactionRef,
    status: "pending",
  });
}

export interface StoredTransaction {
  id: string;
  booking_id: string;
  property_id: string;
  transaction_ref: string;
  amount: number;
  currency: string;
  status: string;
}

/** Find the transaction we recorded at initiation. */
export async function findStoredTransaction(
  supabase: SupabaseClient,
  provider: string,
  transactionRef: string | null | undefined,
): Promise<StoredTransaction | null> {
  if (!transactionRef) return null;
  const { data: t } = await supabase
    .from("payment_transactions")
    .select("id, booking_id, transaction_ref, amount, currency, status")
    .eq("payment_provider", provider)
    .eq("transaction_ref", transactionRef)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!t?.booking_id) return null;
  const { data: b } = await supabase.from("bookings").select("property_id").eq("id", t.booking_id).maybeSingle();
  if (!b?.property_id) return null;
  return { id: t.id, booking_id: t.booking_id, transaction_ref: t.transaction_ref, property_id: b.property_id, amount: Number(t.amount) || 0, currency: t.currency, status: t.status };
}

/**
 * Apply a gateway-confirmed payment. Idempotent: a transaction already completed
 * is never applied twice. The booking only becomes "paid" when the confirmed
 * amount covers the outstanding balance; otherwise it is recorded as partial.
 */
export async function settleStoredTransaction(
  supabase: SupabaseClient,
  txn: StoredTransaction,
  confirmedAmount: number,
  reference: string,
): Promise<{ applied: boolean; payment_status: string | null }> {
  if (txn.status === "completed") return { applied: false, payment_status: null };
  const confirmed = Number(confirmedAmount);
  if (!Number.isFinite(confirmed) || confirmed + 0.01 < txn.amount) {
    await supabase.from("payment_transactions").update({ status: "amount_mismatch" }).eq("id", txn.id);
    return { applied: false, payment_status: null };
  }
  const { data: claimed } = await supabase
    .from("payment_transactions")
    .update({ status: "completed" })
    .eq("id", txn.id)
    .neq("status", "completed")
    .select("id");
  if (!claimed?.length) return { applied: false, payment_status: null };
  const { data: b } = await supabase.from("bookings").select("total_price, amount_paid").eq("id", txn.booking_id).maybeSingle();
  const total = Number(b?.total_price) || 0;
  const newPaid = Math.round(((Number(b?.amount_paid) || 0) + txn.amount) * 100) / 100;
  const status = newPaid + 0.01 >= total ? "paid" : "partial";
  await supabase
    .from("bookings")
    .update({ payment_status: status, amount_paid: newPaid, payment_reference: reference, paid_at: new Date().toISOString() })
    .eq("id", txn.booking_id);
  return { applied: true, payment_status: status };
}
