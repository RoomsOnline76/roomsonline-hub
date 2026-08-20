/**
 * Settlement of a modified booking.
 *
 * A stay that is shortened, lengthened or repriced changes what the guest owes, but the money
 * already received does not move on its own. This module compares the new total against what was
 * actually received and turns the difference into a real, reviewable action:
 *
 *  - overpaid  → a pending refund in the Refund Register (nothing leaves the account without approval)
 *  - underpaid → `balance_due` on the booking plus a tokenised payment request the guest can settle
 *
 * The amounts are stored on the booking (`amount_paid`, `amount_paid_source`, `balance_due`) so
 * owners, accounts and the Command Centre all read the same figures.
 */

// deno-lint-disable-next-line no-explicit-any
type Db = any;

const SETTLED_STATUSES = ["complete", "completed", "paid", "success"];
const PAID_PAYMENT_STATUSES = ["paid", "complete", "completed", "success", "paid_externally"];

export const round2 = (n: number): number => Math.round((Number(n) || 0) * 100) / 100;

/** How an overpayment is handled once the stay is repriced downwards. */
export type OverpaymentMode = "refund" | "credit" | "guest_choice";

/**
 * What the booking's payment_status must read once total and received are known. Keeps the card,
 * the invoice and accounts from disagreeing after a stay is lengthened or shortened.
 */
export function derivePaymentStatus(
  current: string | null | undefined,
  total: number,
  paid: number,
  source: ResolvedPayment["source"],
): string {
  const cur = String(current ?? "").toLowerCase();
  // Refund states are owned by the Refund Register — never overwrite them here.
  if (["refunded", "partially_refunded"].includes(cur)) return cur;
  if (source === "channel" && paid + 0.01 >= total) return cur === "paid_externally" ? cur : "paid_externally";
  if (paid <= 0.01) return total > 0.01 ? "unpaid" : cur || "unpaid";
  if (paid + 0.01 >= total) return "paid";
  return "partially_paid";
}


export interface ResolvedPayment {
  amount: number;
  source: "gateway" | "channel" | "manual" | "none";
}

/**
 * What has actually been received for this booking.
 *
 * Gateway transactions are authoritative. Channel reservations (Rentals United and friends) are
 * paid at the channel, so a booking flagged paid without a local transaction counts its
 * pre-modification total as received. A previously stored `amount_paid` wins over inference.
 */
export async function resolveAmountPaid(
  supabase: Db,
  booking: {
    id: string;
    amount_paid?: number | null;
    amount_paid_source?: string | null;
    payment_status?: string | null;
    total_price?: number | null;
    booking_channel?: string | null;
    deposit_amount?: number | null;
  },
  oldTotal: number,
): Promise<ResolvedPayment> {
  const { data: rows } = await supabase
    .from("payment_transactions")
    .select("amount, status")
    .eq("booking_id", booking.id);

  const gatewayPaid = round2(
    ((rows ?? []) as Array<{ amount: number | null; status: string | null }>)
      .filter((r) => SETTLED_STATUSES.includes(String(r.status ?? "").toLowerCase()))
      .reduce((sum, r) => sum + (Number(r.amount) || 0), 0),
  );

  if (gatewayPaid > 0) return { amount: gatewayPaid, source: "gateway" };

  const stored = Number(booking.amount_paid ?? 0);
  if (stored > 0) {
    const source = (booking.amount_paid_source as ResolvedPayment["source"]) ?? "manual";
    return { amount: round2(stored), source };
  }

  const status = String(booking.payment_status ?? "").toLowerCase();
  const isChannelBooking = !!booking.booking_channel &&
    !["direct", "walk_in", "phone", "email", "rolos"].includes(String(booking.booking_channel).toLowerCase());

  // A stay settled at the channel carries no local transaction: the pre-modification total is what
  // the guest has actually paid, so shortening it produces a real credit instead of silence.
  if (PAID_PAYMENT_STATUSES.includes(status) && oldTotal > 0) {
    return { amount: round2(oldTotal), source: isChannelBooking || status === "paid_externally" ? "channel" : "manual" };
  }

  // Deposit-only stays: the deposit is money received even when nothing else is recorded.
  const deposit = round2(Number(booking.deposit_amount ?? 0));
  if (["partially_paid", "deposit_paid", "partial"].includes(status) && deposit > 0) {
    return { amount: deposit, source: "manual" };
  }

  return { amount: 0, source: "none" };
}


export interface SettlementResult {
  amount_paid: number;
  amount_paid_source: ResolvedPayment["source"];
  new_total: number;
  /** Positive = guest still owes, negative = guest overpaid. */
  delta: number;
  balance_due: number;
  refund_amount: number;
  refund_raised: boolean;
  refund_error: string | null;
  balance_requested: boolean;
  balance_token: string | null;
  /** Token for the guest's credit-or-refund choice page. */
  credit_token: string | null;
  credit_requested: boolean;
  /** How the overpayment was handled. */
  overpayment_mode: OverpaymentMode | null;
  /** Amount held on the booking folio as guest credit. */
  credit_held: number;
  payment_status: string;
}

/** Post the overpayment to the stay's folio as guest credit and hold it on the booking. */
async function retainOnAccount(
  supabase: Db,
  booking: { id: string; property_id?: string | null; guest_name?: string | null },
  amount: number,
  note: string,
): Promise<{ ok: boolean; error: string | null }> {
  try {
    let folioId: string | null = null;
    const { data: folio } = await supabase
      .from("rolos_folios")
      .select("id, balance")
      .eq("booking_id", booking.id)
      .maybeSingle();

    if (folio?.id) {
      folioId = folio.id as string;
    } else {
      const { data: created, error } = await supabase
        .from("rolos_folios")
        .insert({
          booking_id: booking.id,
          property_id: booking.property_id ?? null,
          guest_name: booking.guest_name ?? null,
          balance: 0,
          status: "open",
        })
        .select("id")
        .single();
      if (error) return { ok: false, error: error.message };
      folioId = created?.id as string;
    }

    const { error: txError } = await supabase.from("rolos_folio_transactions").insert({
      folio_id: folioId,
      // `credit` is not an accepted folio type — a retained overpayment posts as a negative adjustment.
      transaction_type: "adjustment",
      description: note,
      amount: -Math.abs(amount),
      reference: `credit:${booking.id}`,
    });
    if (txError) return { ok: false, error: txError.message };
    return { ok: true, error: null };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}


async function raisePendingRefund(
  supabase: Db,
  booking: { id: string; guest_name?: string | null },
  amount: number,
  reason: string,
  holdForGuestChoice: boolean,
): Promise<{ ok: boolean; error: string | null }> {
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const response = await fetch(`${url}/functions/v1/refunds-api`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        action: "request_refund",
        booking_id: booking.id,
        amount,
        reason,
        reason_category: "date_change",
        hold_for_guest_choice: holdForGuestChoice,
        internal_notes: holdForGuestChoice
          ? "Raised by a booking modification — the guest is choosing between credit and a refund."
          : "Raised automatically by a booking modification — awaiting approval.",
      }),
    });
    const text = await response.text();
    if (!response.ok) return { ok: false, error: `refunds-api ${response.status}: ${text.slice(0, 300)}` };
    const parsed = JSON.parse(text || "{}");
    if (parsed?.error) return { ok: false, error: JSON.stringify(parsed.error).slice(0, 300) };
    return { ok: true, error: null };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Fresh 30-day token the guest uses to settle a balance or choose credit vs refund. */
async function createGuestToken(
  supabase: Db,
  booking: { id: string; guest_email?: string | null },
  usedFor: "balance" | "settlement",
): Promise<string | null> {
  const email = (booking.guest_email ?? "").trim();
  if (!email.includes("@")) return null;

  await supabase
    .from("guest_portal_tokens")
    .delete()
    .eq("booking_id", booking.id)
    .eq("used_for", usedFor);

  const { data, error } = await supabase
    .from("guest_portal_tokens")
    .insert({
      booking_id: booking.id,
      guest_email: email,
      used_for: usedFor,
      expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
    })
    .select("token")
    .single();

  if (error) {
    console.error(`[settlement] ${usedFor} token failed:`, error.message);
    return null;
  }
  return (data?.token as string) ?? null;
}

/**
 * Compare the new total with what was received and persist the outcome.
 *
 * `raiseRefund` / `requestBalance` are the operator's choices from the modify dialog: the money
 * side of a change is never silently automated beyond raising a record for review.
 */
export async function applyBookingSettlement(
  supabase: Db,
  booking: {
    id: string;
    property_id?: string | null;
    guest_name?: string | null;
    guest_email?: string | null;
    payment_status?: string | null;
    amount_paid?: number | null;
    amount_paid_source?: string | null;
    booking_channel?: string | null;
    deposit_amount?: number | null;
    credit_held?: number | null;
  },
  params: {
    oldTotal: number;
    newTotal: number;
    raiseRefund: boolean;
    requestBalance: boolean;
    reasonNote?: string | null;
    /** refund = raise for approval, credit = retain on account, guest_choice = let the guest pick. */
    overpaymentMode?: OverpaymentMode;
  },
): Promise<SettlementResult> {
  const newTotal = round2(params.newTotal);
  const received = await resolveAmountPaid(supabase, { ...booking, total_price: params.oldTotal }, params.oldTotal);
  const heldCredit = round2(Number(booking.credit_held ?? 0));
  // Credit already sitting on the stay counts towards the new total before anything is asked of
  // the guest — that is the whole point of retaining it.
  const appliedCredit = heldCredit > 0 ? Math.min(heldCredit, Math.max(0, round2(newTotal - received.amount))) : 0;
  const delta = round2(newTotal - received.amount - appliedCredit);
  const balanceDue = delta > 0.01 ? delta : 0;
  const overpaid = delta < -0.01 ? round2(Math.abs(delta)) : 0;
  const mode: OverpaymentMode = params.overpaymentMode ??
    (params.raiseRefund ? "guest_choice" : "credit");

  const paymentStatus = derivePaymentStatus(
    booking.payment_status,
    newTotal,
    received.amount + appliedCredit,
    received.source,
  );

  const result: SettlementResult = {
    amount_paid: received.amount,
    amount_paid_source: received.source,
    new_total: newTotal,
    delta,
    balance_due: balanceDue,
    refund_amount: overpaid,
    refund_raised: false,
    refund_error: null,
    balance_requested: false,
    balance_token: null,
    credit_token: null,
    credit_requested: false,
    overpayment_mode: overpaid > 0 ? mode : null,
    credit_held: round2(heldCredit - appliedCredit),
    payment_status: paymentStatus,
  };

  const reason = params.reasonNote?.trim()
    ? `Booking modified — ${params.reasonNote.trim()}`
    : "Booking modified: the new total is lower than the amount received.";

  if (overpaid > 0 && received.amount > 0) {
    if (mode === "credit") {
      const outcome = await retainOnAccount(supabase, booking, overpaid, reason);
      if (outcome.ok) {
        result.credit_held = round2(result.credit_held + overpaid);
      } else {
        result.refund_error = outcome.error;
      }
    } else if (mode === "refund") {
      const outcome = await raisePendingRefund(supabase, booking, overpaid, reason, false);
      result.refund_raised = outcome.ok;
      result.refund_error = outcome.error;
    } else {
      // The guest decides: hold the difference as credit for the stay, or take the refund now. The
      // refund is recorded straight away but held out of the approval queue until they answer.
      const creditToken = await createGuestToken(supabase, booking, "settlement");
      const outcome = await raisePendingRefund(supabase, booking, overpaid, reason, !!creditToken);
      result.refund_raised = outcome.ok;
      result.refund_error = outcome.error;
      result.credit_token = creditToken;
      result.credit_requested = outcome.ok && !!creditToken;
    }
  }

  // One write: total-derived paid, balance, credit and payment status never disagree.
  await supabase
    .from("bookings")
    .update({
      amount_paid: received.amount,
      amount_paid_source: received.source === "none" ? null : received.source,
      balance_due: balanceDue,
      credit_held: result.credit_held,
      payment_status: paymentStatus,
    })
    .eq("id", booking.id);

  if (balanceDue > 0 && params.requestBalance) {
    const token = await createGuestToken(supabase, booking, "balance");
    result.balance_token = token;
    result.balance_requested = !!token;
  }


  return result;
}
