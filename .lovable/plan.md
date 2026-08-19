# Error taxonomy review — what is actually still happening

Short answer: **no, not all of these are dealt with, and "guaranteed non-repeat" is not honest for most of them.** I queried the last 7 days of `ru_sync_runs` failures. Three groups are still producing failures tonight (19 Aug, 18:00–21:31 UTC).

## What the 33 "Unclassified" rows really are

The panel's classifier only recognises seven signatures, so anything else falls into "Unclassified failure". The real content of that bucket:

| Actual failure | Recent count | Still happening? | True nature |
| --- | --- | --- | --- |
| `push_confirmed_reservation` — "channel has no listing 5842266 / 5842270 / 5842506" | 9 | Yes, until 18:50 | Stale unit → listing mapping; retried every ~1 min in a loop |
| `modify_stay` — "Unexpected error, contact IT or try again" (listing 5833147) | 7 | Yes, until 18:40 | Opaque channel error, no diagnostic captured |
| `cancel_reservation` — "Reservation does not exist." | 3 | Yes, 18:53 | Should be an idempotent no-op success, not a failure |
| `wizard_sync_blocked` — wizard not complete | 4 | Yes, 21:31 | Expected behaviour, should not be logged as a failure at all |
| `ensure_company_details` — connect@ email already registered | 5 | Yes, 13:29 | Known account-level setup gap (not a code defect) |
| `lnm_repull` — "Unmapped RU property" | 1200 (13–16 Aug) | No | Already fixed by mapping work |
| `pull_reservations` — "Assignment to constant variable" | 30 (to 18 Aug) | No | Code defect, already fixed |
| `resolve_ru_property_ids` — "Invalid session" | 26 | No new since 08:39 | Auth/session, self-heals |

So the "Advisory" badge on that bucket is misleading: it hides two blockers and one bug-shaped item.

## The 5 "Rate limited" rows

Genuine RU throttle on `Push_PutAvbUnits_RQ` / `Push_PutProperty_RQ`. Self-healing and expected — but the run is still marked **failed**, which is why `refresh_ari` shows red (`1/9 target(s) failed after retries`) when nothing is actually wrong. One of those ARI runs failed on "Failed to send a request to the Edge Function", which is transport, not rate limit, and is also mis-bucketed.

## The 2 "Payload validation" rows

Old (15 Aug, `ensure_company_details` on RU Test Clone A). No repeat since. Effectively closed.

## What I propose to fix

1. **Stop the reservation retry storm.** When the channel reports the listing is missing, mark that unit's mapping stale once, raise a single actionable notification ("republish unit, then resend stay"), and stop re-firing the push every minute.
2. **Make cancel idempotent.** "Reservation does not exist" on cancel = already gone on the channel → record the run as success with a `no_op` reason, and lift local blocks as usual.
3. **Capture real detail for `modify_stay`.** Store the request verb, listing id and raw channel response on the run so "Unexpected error, contact IT" becomes diagnosable instead of a dead end.
4. **Stop logging expected states as failures.** `wizard_sync_blocked` becomes an informational run (not counted in the error taxonomy or health report), since local availability did save correctly.
5. **Fix classifier coverage** so nothing meaningful lands in "Unclassified": new buckets for listing-missing (blocker), channel-side opaque error (needs investigation), account/setup conflict (setup gap, not a defect), edge-transport failure (self-healing), and session expiry (self-healing).
6. **Add honesty to the panel.** Each row gets a "last seen" age chip — *Recurring* (seen in the last 24 h), *Cooling* (1–7 days), *Cleared* (nothing new since the fix). That is the only defensible form of "non-repeat": evidence, not a promise.

## On "guaranteed non-repeat"

Achievable for items 2, 3 and 4 (our own code paths). **Not** achievable for RU throttling, RU upstream errors, or account-level conflicts like the duplicate `connect@` email — those originate outside our system. For those, the goal is correct classification and self-healing, not zero occurrences.

## Technical notes

- Reservation push/cancel/modify paths in `supabase/functions` (`push_confirmed_reservation`, `cancel_reservation`, `modify_stay` handlers) plus the shared reservation ingest/retry ladder.
- Classifier and panel: `src/components/integrations/RuErrorHandlingTab.tsx` (`classifyRuError`), consumed by the Channel Manager → Cert Status & Logs rail.
- `wizard_sync_blocked` logging site in the availability save path.
- No schema change required; the recurrence chip is derived from `ru_sync_runs.created_at`.
