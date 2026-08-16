# Health report follow-up: close the open findings

I re-derived the last report's findings from the same sources it reads (channel sync runs and the raw channel call log, last 24–48h). Four are still live today, one looks already fixed and needs confirming, and two are reporting-quality problems rather than real faults.

## Finding 1 — Live notification storm is swamping the channel rate gate (live, biggest)

Confirmed: 1 616 inbound live notifications in 48h, each triggering an immediate corrective read-back. That produced 1 120 failed `lnm_repull` runs (979 of them "Edge Function returned a non-2xx status code"), and in the raw call log the last 24h show **2 434 deferred availability pulls** and **1 446 deferred price pulls**, all `RU_RATE_DEFERRED` from the shared 1-request-per-minute gate. So the pulls are not broken — they are being throttled because we fire two per notification.

Fix:
- Coalesce notifications: instead of pulling per notification, record the change (property + widened date window) and let one debounced read-back per property cover all notifications received inside the gate window.
- Union overlapping windows so a burst becomes a single availability + price pull per property.
- Treat a gate deferral as *deferred*, not failed: the sync run is logged with a distinct deferred outcome and re-armed for the next cycle, so it stops counting as an error in the health report.
- Read the real error body from non-2xx invokes (existing helper) so any genuine failure shows its actual message instead of "non-2xx status code".

## Finding 2 — Static re-push for unmapped listings (live)

113 `lnm_repull` failures are "Unmapped RU property — cannot re-push static content": the channel notified about a listing ROL'OS has no mapping for (retired/test listings). Fix: classify as skipped-not-applicable, not failed, and record the unmapped channel id once per property instead of on every notification.

## Finding 3 — Reservation pull crash (verify, then close)

`pull_reservations` logged 29 failures with `TypeError: Assignment to constant variable.` on 13–15 Aug, and **zero** failures since 06:00 on 15 Aug with 14 clean runs today. Step one is to confirm the offending reassignment is genuinely gone from the reservation cron; if it is, close the finding, if not, fix it.

## Finding 4 — Distribution account prerequisites (live, data not code)

- 3 `ensure_company_details` failures: no usable property-owner email (internal ROL logins are rejected by design).
- 16 failures across static delta / ARI refresh / discount refresh: "No OwnerID linked to this property or its portfolio".
- 7 `list_ru_candidates` failures: sub-user list not returned; 2 `resolve_ru_property_ids` failures: "Invalid session".

These are owner-configuration gaps, not defects. Fix the reporting so they are grouped under a "waiting on owner setup" line naming the properties, separate from pipeline errors, and surface the same list on the Channel Monitor so it is actionable rather than repeated nightly noise.

## Finding 5 — Failures logged with no message (reporting gap)

42 `inventory_push` failures carry a null error message, so the report says a push failed without saying why. Fix: always write a reason on a failed push (unit-level rejection summary, or the transport error), and label channel rate-limit rejections as rate-limited rather than generic failures.

## Finding 6 — Push rate-limit rejections on unit pushes

Remaining "called with the same parameters less than a minute ago" rejections on unit pushes come from the push path not consulting the shared gate before each unit. Fix: route unit pushes through the same gate with per-unit spacing so the channel is never asked twice inside its minute.

## Technical notes

- `supabase/functions/ru-lnm-handler/index.ts`: replace the inline per-notification pull with a coalescing queue (debounce key = property + owner), union date windows, and log `deferred` outcomes distinctly; use `_shared/ruInvokeBody.ts` for error bodies.
- `supabase/functions/_shared/ruRateGate.ts`: expose the remaining wait so callers can defer instead of failing; unit push path consults it.
- `supabase/functions/cron-pull-ru-reservations/index.ts`: verify the const-reassignment fix.
- `supabase/functions/daily-health-report/index.ts`: exclude deferrals and owner-setup gaps from pipeline error counts, add "rate-limit deferrals" and "waiting on owner setup" lines.
- No schema changes beyond a small coalescing/debounce record if the queue needs persistence; no adapter-locked files touched.
