# Channel traffic: counters, live log, and closing the open error loops

The counters, the live traffic log and the error taxonomy already exist (endpoint counter table, live traffic frame, pulse strip, and the error-handling panel with its cause → handling → fix taxonomy). So this work is not "build observability" — it is **verify what the log is actually reporting right now, close the loops that are still failing, and prove each fixed call succeeds live afterwards**.

## What the log says today (read from the live channel records this morning)

Verified from the channel call log and the sync-run trail:

Still failing now — needs a fix:

1. **Accept-request loop on Sealion.** `Push_ConfirmReservation_RQ` answers "Property is not available for a given dates — there is no space to add this apartment", most recently 07:33 today, 81 failed runs over 30 days. The reopen-then-retry ladder fires, the retry is handed to the next rate window, and it refuses again. The one-per-minute channel rule then adds its own rate-deferred rows for the same call.
2. **Nightly rate/availability refresh times out on Seesig Self-Catering Chalets.** Every 12-hourly cycle ends in "Request idle timeout limit (150s) reached" (00:02 and 12:02, ten times in the last week). 13 units, each needing an availability and a price call plus throttle spacing, cannot finish inside one run. The same property also produced one "ran out of time before every unit was pushed".
3. **Self-inflicted duplicate calls.** 42 rate-deferred refusals in a week for identical calls repeated inside a minute — reservation-by-ID reads, availability pushes, price pushes and accept-request. Plus six of the channel's own "maximum requests for this method" refusals on the reservation list pull today.
4. **Two channel answers nothing in the code recognises:** "Warning! Look at Notifs collection" on price pushes (45 rows) and "We have confirmed reservation for those dates" on availability pushes (14 rows, last 06:01 today). Neither is classified, so both land in the panel as unclassified failures and nobody can tell whether the prices actually stuck.
5. **One sub-user token refusal today** (403 when minting the sub-account token) — single event, currently invisible in the taxonomy.

Already handled correctly (leave alone, they are recorded refusals, not defects): reservation-does-not-exist on cancel, stay-modification-on-unconfirmed-request, wizard and onboarding gate refusals, read-back refusals.

## The fixes

**1. Stop the accept-request loop and tell the truth about it.**
Detect the repeat: when the same reservation has been refused for closed nights twice, stop reopening and re-queueing. Mark the request as needing manual acceptance at the channel, with the nights and the listing named, and surface it as an action item on the monitor instead of a nightly refusal. Before giving up, verify against the channel's own availability read-back for those nights (declared purpose: availability repair) so the trail records whether the channel really shows no space, or whether our reopen never applied.

**2. Make the rate/availability refresh finish.**
Refresh per unit-batch instead of per property in one shot: the cron enqueues unit-scoped work for large properties and the queue drain works through it, so no single run approaches the platform's time limit. The run record becomes "in progress / completed after N batches" rather than a timeout, and a property is only reported failed when a batch genuinely refuses. Seesig is the test case.

**3. Remove the duplicate calls.**
Trace each rate-deferred verb back to its caller and deduplicate at source: one reservation-by-ID read per reservation per cycle (reuse the reservation already read in the same run), one availability and one price call per unit per delta, and no accept-request retry inside the same rate window. Space the reservation-list poll per distribution account so the channel's own per-method ceiling is not hit.

**4. Classify and act on the two unrecognised answers.**
- Price push warning: read the notification collection the channel points at, record what it reports on the run, and re-verify the affected price span with a purpose-declared price read-back before the push is called successful.
- Availability push refusal on sold nights: recognise it as an expected refusal (the channel is protecting a real reservation), keep the rest of the span, and never retry the sold night.
- Add both, plus the sub-user token refusal, to the taxonomy with cause / automatic handling / manual fix, so the panel stops showing them as unclassified.

**5. Observability gaps worth closing while in there.**
- Counters gain a per-verb "refused by channel" column split from transport failures, so a healthy verb with expected refusals no longer reads as broken.
- The error panel gains an "open items" section listing only patterns still active in the last 6 hours with no successful call of the same verb since — that is the list the user asked to be able to confirm as resolved.
- Each fixed pattern gets a stored resolution marker (verb, what changed, date verified) shown next to the bucket, so a cleared loop stays visibly cleared.

## Verification — every changed call is proven live again

No change is called done until the same call succeeds against the channel afterwards:

| Change | Live proof required |
| --- | --- |
| Accept-request | One accept attempt reaching either a confirmed reservation or a recorded, non-repeating manual-action item; no new refusal rows for the same reservation |
| Rate/availability refresh | A full Seesig cycle with every unit's availability and price call recorded, zero timeout rows |
| Duplicate calls | Zero rate-deferred rows for the touched verbs across a full cycle |
| Price push warning | A purpose-declared price read-back showing the pushed rates on the channel |
| Availability push on sold nights | Refusal recorded as expected; the rest of the span confirmed applied |

Results are recorded in the traffic log and summarised back to you with the verb, timestamp and outcome.

## Technical notes

- Files in scope: `_shared/ruBookingSync.ts` (accept/reopen ladder, confirm suppression), `_shared/ruAriDelta.ts` + `cron-refresh-ru-ari` + `cron-ru-call-queue-drain` (batching), `_shared/ruApiLog.ts` (status classification), `push-property-to-ru` (refresh_ari batching entry), `RuErrorHandlingTab.tsx` (taxonomy, open items), `useRuLiveTraffic.ts` + `EndpointCounterTable.tsx` (refused vs failed split).
- Read-backs stay purpose-declared per the existing gateway rule; no undeclared availability or price reads are added.
- Batching reuses the existing `ru_call_queue` (method_key, not_before, attempts) rather than a new mechanism.
- A small table (or a details key on the run) holds the per-pattern resolution marker.
- Backend changes go live on publish; verification runs after that.
