# Rentals United MCQ / LNM compliance: verification and the gaps to close

Verified against the live account and the code, not assumed.

## Where we stand

**1. Subscribe each client to `PropertyMCQEligibilityCheck` — COMPLIANT**
`Push_PutLiveNotificationMechanismSubscriptions_RQ` is implemented (`put_lnm_subscriptions`) and is refreshed daily per account by `cron-ru-rlnm-refresh`. Last night's run: subscription pushed and read back successfully for both the master account and sub-user OwnerID 741765 (02:00–02:01 today), with the MCQ change type in the subscribed set. It is account-scoped and blocked from running on master credentials for a sub-user.

**2. Handler for `PropertyMCQEligibilityCheck` notifications — COMPLIANT**
`ru-lnm-handler` answers GET within the 3-second window, logs every hit, tolerates duplicate delivery, and closes out the newest matching `ru_mcq_orders` row to passed/failed. 205 LNM notifications received to date, including one `PropertyMCQEligibilityCheck`.

**3. Order the check for all properties before channel onboarding — NOT COMPLIANT**
`CM_LNM_OrderMinimumContentQualityCheck_RQ` exists, but it is only a manual, single-property button in Phase 4.3 of the RU console. There is no run-for-all-properties path and no onboarding gate. Worse, every order on record failed (14 of 14):

```text
5655615-5655618  status 280  "Subscribe to LNM first"   (3 Aug, before the subscription existed)
741765           status 219  "Invalid ChannelId"
741765           status  56  "Property does not exist."
```

The last two were ordered against `741765` — the sub-user OwnerID, not an RU property ID — so the target selection is wrong on that path. No order has been placed since the LNM subscription went live, so the 280 blocker is untested-but-likely-resolved.

**4. Show results to owners / aggregated report for account managers — NOT COMPLIANT**
MCQ status appears only in admin-only surfaces (RU console Phase 4 line, `RuLnmStatusChips`, `PropertyRuOwnerPanel`). Owners see nothing, and there is no cross-property roll-up for account managers.

## What gets built

### A. Fix and harden the order path
- Order only against real RU listing IDs resolved from the property's mappings/unit listings; never fall back to an OwnerID. If no listing ID exists, report "not yet published" instead of calling RU.
- Require a valid resolved sales-channel ID before ordering (the 219 cause); resolve it first, or order without the channel parameter if RU allows, rather than sending a stale ID.
- Re-order for the four Tidal Pools listings now that the subscription is confirmed, so the 280 result is retested. Keep the existing status-17 escalation handling (RU-side fault, surfaced with the ResponseID).

### B. Order for all properties before onboarding
- A bulk action in the RU console: order the quality check for every publishable listing across the master account and each sub-user, paced by the existing one-call-per-method-per-minute limiter, logged per listing to `ru_sync_runs` and `ru_mcq_orders`.
- Automatic order on first publish: when a property is pushed to the channel manager, queue its quality check so onboarding never starts without one.
- The onboarding phase gate reads the newest MCQ result per listing and reports pending / passed / failed / blocked-upstream. Blocked-upstream stays informational (as today) so an RU-side fault cannot stall onboarding.

### C. Owner-facing prompts
- On the property's channel readiness surface, failed data points from the MCQ result are rendered as actionable prompts pointing at the field or tab that needs attention, in owner-safe language (no vendor naming, per the channel vocabulary rules).
- A passed check shows as a simple confirmation chip.

### D. Aggregated account-manager report
- A "Content quality" section on the Rentals United admin page: one row per listing with property, account, last ordered, result, failing data points and RU ResponseID, plus counts (passed / failed / pending / never ordered) and a re-order action per row and for the whole account.

## Technical notes

- Changes are additive in `supabase/functions/ru-cert-portal/index.ts` (target resolution, bulk order action, gate reads) and `supabase/functions/rentalsunited-api/index.ts` (`order_mcq` argument validation only). `ru-lnm-handler` needs a small extension to persist the failing data points from the notification into `ru_mcq_orders.response_preview`; no locked adapter region is touched.
- No schema change: `ru_mcq_orders` already carries status, RU property ID, RU status and the response document.
- New UI: an MCQ report component on `AdminRentalsUnited.tsx` and owner prompts inside the existing readiness checklist component; both read through the cert portal, not RU directly.
