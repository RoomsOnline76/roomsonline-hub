# Plan: Place a fresh MCQ order on the current published listing set

## Goal

Resolve the finding "MCQ orders last placed 2026-08-04" by ordering a fresh
Minimum Content Quality (MCQ) check on every currently published listing, so
the newest order post-dates the final content push. This is an operational
task — no code changes, only live edge-function invocations against the
channel.

## Current state (verified)

- **MCQ orders are stale:** 14 rows in `ru_mcq_orders`, all from
2026-08-03/04, newest `2026-08-04 13:34 UTC`. **All 14 failed:**
  - `ru_status_id 56` "Property does not exist" — an OwnerID (`741765`) was
  sent as the PropertyID (a bug `resolveMcqTargets` now guards against).
  - `ru_status_id 219` "Invalid ChannelId" — the ChannelID was unresolved then.
  - `ru_status_id 280` "Subscribe to LNM first" — the LNM service was not yet
  subscribed on the account.
- **ChannelID now resolved & stored:** `723231` (LekkeSlaap) in
`ru_platform_settings`, resolved 2026-08-04. The 219 cause is fixed.
- **Target guard in place:** `resolveMcqTargets` rejects an OwnerID used as a
PropertyID, so the 56 cause cannot recur.
- **Current published listing set:** 52 units across 8 active properties
(Dassiesingel 4, Fonteinhutte 9, RU Test Clone A 9, Clone B 4, Clone C 9,
Clone D 4, Seesig 9, Tidal Pools 4).

## Steps

1. **Smoke order (1 listing).** Invoke `ru-cert-portal` → `order_mcq` for one
  Clone B listing (`ru_property_id 5655615`, the one that previously hit
   "Subscribe to LNM first"), with `force: true` to bypass the Phase-4 gate.
   Purpose: confirm the LNM subscription is now active and the order path
   works end-to-end. `order_mcq` self-heals the LNM subscription, so a lingering
   "Subscribe to LNM first" here means RU has not enabled the service on the
   account at all — a platform-side blocker, not a content issue.
  - **If it returns `RU_LNM_NOT_SUBSCRIBED`:** stop and surface that RU must
  enable LNM on the account; do not run the bulk order.
  - **If it returns success / `ordered`:** proceed to step 2.
2. **Bulk order (5 random from 52 active listings).** Invoke `ru-cert-portal` → `order_mcq_all`
  in paced batches (`limit: 12`, follow `next_skip`/`remaining`) until
   `remaining === 0`. The function paces 1.5s per listing to respect RU's
   one-write-per-method-per-minute rate limit (8 minutes total). This is the
   same path the "Order for all listings" button uses. Each order is scoped to
   the correct sub-account via `findOwnerAccount` and uses the stored
   ChannelID 723231.
3. **Verify & report.** Read `ru_mcq_orders` and confirm new rows post-date
  the final content push. Report counts: `ordered` (placed successfully — the
   verdict arrives asynchronously as a `PropertyMCQEligibilityCheck` LNM
   notification), `failed`, and any `RU_LNM_NOT_SUBSCRIBED` /
   `RU_MCQ_INTERNAL_ERROR` outcomes with their ResponseIDs.

## Risk / notes

- MCQ results are **asynchronous**: a successful order returns `ordered`,
not the pass/fail. The verdict lands later as an LNM notification and is then
visible in the Content quality report. "Fresh order placed" is the success
signal for this finding.
- If RU rate-limits the bulk run, `order_mcq_all` records each failure with the
real transport reason; the run can be resumed from `next_skip` without
re-ordering completed listings.
- No schema, RLS, or UI code changes.