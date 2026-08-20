# Booking lifecycle simulation — RU Test Clone A (2026-08-20)

Run against the deployed functions with channel calls paced to the 1-per-sliding-minute limit;
deferred responses were retried, never counted as failures.

| # | Scenario | Result | Observed |
|---|----------|--------|----------|
| 1 | Direct unpaid: create 2n → extend 4n → shorten 1n → cancel | PASS | 2020 → 4040 → 1010, balance always equals total; cancel left no stale balance |
| 2 | Fully paid → shorten, mode = refund | PASS | Pending refund of 1010 in the Refund Register, balance 0, paid untouched |
| 3 | Fully paid → shorten, mode = retain on account | PASS | `credit_held = 1010` plus a −1010 folio line; re-extending to 3030 consumed the credit and left balance 0 |
| 4 | Paid → extend → settle balance | PASS | Balance 3030, status partially_paid, balance pay link issued; after payment total = paid, balance 0, paid |
| 5 | Pax-only change (2 → 4 adults) | PASS | Pax stored, total re-derived from the rate plan, balance = total |
| 6 | Move to another unit + channel sync | PARTIAL | Unit moved locally; `channel-booking-sync` hit the 150s request timeout while waiting out the channel rate limit — the delta still went to the call queue |
| 7 | Deposit-only stay → extend | PASS | Paid stays 500, balance = new total − 500, partially_paid |
| 8 | No-show, then mark paid → re-derive | PASS | Status no_show; after mark-paid balance 0 and status paid |
| 9 | Channel-held request (RU lead) → extend | PASS | Refused with `RU_RATE_DEFERRED` after paced retries; local row untouched |
| 10 | Channel reservation ROL-2F5-0015 → extend | PASS | Channel refused (`only modify stay in confirmed reservation`); nothing written locally |
| 10 | Channel reservation → cancel (guest cancel type) | PASS | Cancelled and withdrawn at the channel; money re-derived, no stale balance |

## Defect found and fixed

Retained-on-account credit never landed: the folio insert used `transaction_type: "credit"`, which the
`validate_rolos_transaction_type` trigger rejects. The overpayment now posts as a negative
`adjustment` (`supabase/functions/_shared/bookingSettlement.ts`), and scenario 3 passes end to end.

## Note

Scenario 6's timeout is a transport-level wait, not a lost change — the move is queued for the
channel. Worth moving that sync onto the background queue rather than holding the request open.
