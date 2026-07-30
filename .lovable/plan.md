## What the data shows

I checked the actual rows behind your screenshot. The 8 "Pending" ZAR 950 entries for Dawie Erasmus map to **only 2 bookings** (7 attempts on one booking, 1 on another) — so bookings are *not* being duplicated. The checkout page already reuses an existing pending booking for the same property/dates/email.

What duplicates is the **payment transaction record**: every retry through `payfast-api` inserts a fresh `payment_transactions` row with a new `m_payment_id`, and nothing ever closes the previous pending row. There are three insert sites in that function (hosted redirect, onsite, and the redirect fallback), all doing a plain insert.

## Fix

1. **One open payment row per booking.** Add a `recordPendingTransaction()` helper in `payfast-api` that first looks for the booking's existing `pending` PayFast row:
   - if found: update it in place with the new reference, amount, merchant and credential source, and push the superseded reference into `gateway_response.previous_refs` (plus an `attempts` counter);
   - if not found: insert as today.
   Replace all three insert sites with this helper.

2. **Late-ITN safety.** Because references get rolled forward, the ITN handler gains a fallback lookup: if no row matches `m_payment_id`, search `gateway_response->previous_refs` for that reference. A payment that completes on an older attempt still confirms the correct booking, and the amount guard already in place still applies.

3. **Stale pending cleanup (display).** Pending rows older than the PayFast session window stay in the table but are shown as "Expired" rather than "Pending" in the payments list, so the admin view doesn't imply money is in flight.

## Technical notes

- Files touched: `supabase/functions/payfast-api/index.ts` (helper + 3 call sites + ITN fallback lookup), and the payments list badge mapping in `src/pages/AdminPayments.tsx` for the expired display state.
- No schema change required — `previous_refs` lives inside the existing `gateway_response` JSONB.
- No change to booking creation; the existing dedup there is working correctly.
- Optional (say the word): mark the 7 orphaned Dassiesingel pending rows from 29 Jul as cancelled so the test noise clears out.
