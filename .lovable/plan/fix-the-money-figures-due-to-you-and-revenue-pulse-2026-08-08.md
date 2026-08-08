# Fix the money figures: "Due to you" and Revenue Pulse

I checked the actual data for Jongensfontein. The figures are wrong for four separate, confirmed reasons — not one bug.

## What the data actually says

Confirmed, revenue-bearing bookings (all three properties sit in the Jongensfontein.com portfolio):

| Reference | Property | Total | Payment | Arrival |
|---|---|---|---|---|
| ROL-WEB-B-DAS-00008 | Dassiesingel | R2,800 | paid (no gateway transaction row) | 12 Aug |
| ROL-EMB-B-FON-00005 | Fonteinhutte | R700 | paid (gateway transaction, ROL credentials) | 28 Aug |
| ROL-RU-R-TID-00001 | Tidal Pools | R3,760 | paid_externally (channel collected) | 11 Aug |

Gross = R7,260. A payout statement already exists for August with gross R7,260 and **net payable R6,935.90** — but its status is `draft`.

## Confirmed causes

1. **"Due to you" shows nothing** — the balance builder only counts payout statements with status `finalised` as due to the owner. The only statement is `draft`, so R6,935.90 is invisible.
2. **GBV / ROL Revenue = R0 in Pulse** — the revenue function filters bookings by *arrival date* inside the selected period. The period ends 8 Aug; all three paid stays arrive 11–28 Aug, so they fall outside. Separately, `calculated_commission` is null on every booking, so commission would compute as R0 even inside the window.
3. **Total Collected = R700** — that card reads `payment_transactions` only, and there is exactly one such row (R700). The R2,800 booking is flagged paid without a transaction row, and the R3,760 RU stay was collected by the channel. Neither is counted.
4. **Due to properties = R236 / Recoverable = R956** — the payout maths subtracts the portfolio's monthly white-label fee (R450) from booking cash, and any shortfall becomes "recoverable". Since subscriptions and white-label fees are now billed as their own invoices, this double-charges and collapses the payout. Also, because all three properties have "allow custom payment provider" on, bookings without a gateway row are classed as owner-collected (BYO) even when ROL actually took the money.

## What I will change

**Owner account / statement**
- Treat every payout statement that is not yet `paid` (draft, finalised, approved) as money owed, so "Due to you" reflects R6,935.90 with a small status note ("awaiting release" vs "approved for payment").
- Keep "Pending settlement" for paid bookings not yet on any statement, so nothing is counted twice.

**Revenue Pulse — Revenue tab**
- Select bookings by **booking date** (created_at) instead of arrival date, matching the settlement cards on the same screen, so the period selector means one thing across all eight tiles.
- Fall back to the commission resolver (portfolio/property config → commercial terms → global default) whenever `calculated_commission` is null, instead of treating it as zero.
- Rebuild **Total Collected** from all money actually received: settled gateway transactions **plus** bookings marked paid without a transaction row, with channel-collected value (`paid_externally`) shown as its own line so ROL-held cash stays distinguishable.

**Payout maths**
- Stop deducting monthly subscription and white-label fees from booking payouts; those are invoiced separately. Payouts deduct commission and, where ROL is the payment facilitator, the transaction fee only.
- "Recoverable (BYO)" becomes strictly commission on owner-collected/channel-collected value — no more phantom shortfall from monthly fees.
- Route classification: a booking with no gateway row is only treated as owner-collected when its payment evidence says so (`paid_externally`, or an owner-gateway reference); otherwise it counts as ROL-held.

## Technical notes

- `supabase/functions/revenue-pulse-api/index.ts` — date field, commission fallback (reuse the shared resolver logic), keep RLS/role gate as is.
- `src/hooks/usePropertyPayouts.ts` — remove `monthlyFees` from `payoutBeforeInvoice`/`invoiced`, refine `settlement` inference, expose `channelGross`.
- `src/components/dashboard/PulseSettlementRow.tsx` — collected total from combined sources.
- `src/lib/ownerAccount.ts` — statement status handling in `computeBalances`; no schema change needed.
- No database migration required.
