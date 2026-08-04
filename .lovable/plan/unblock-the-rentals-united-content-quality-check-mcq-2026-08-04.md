# Unblock the Rentals United content-quality check (MCQ)

Michał is right — the method is enabled on our account. RU is not refusing us access; it is refusing the *order* because a prerequisite on our side has never been done.

## What the data shows

Every MCQ attempt so far (4 units of Tidal Pools, 3 Aug 23:43) came back:

```text
<CM_LNM_OrderMinimumContentQualityCheck_RS>
  <Status ID="280">Subscribe to LNM first</Status>
```

Two things follow from that response:

- Status 280 is a business rule, not a permissions error. If the method were outside our scope RU would answer "The XML contains not implemented method". So access is fine, exactly as Michał says.
- The prerequisite is the Live Notification Mechanism subscription: `Push_PutLiveNotificationMechanismSubscriptions_RQ`. Channel-side methods only run for an account that is subscribed to change notifications, and `PropertyMCQEligibilityCheck` is the change type that carries the MCQ result back.

The subscription has never been sent. The notification log holds only `LNM_PutHandlerUrl_RQ` calls (reservations — a different mechanism); there is not a single `Push_PutLiveNotificationMechanismSubscriptions_RQ` call on record for the master account or for sub-user OwnerID 741765. The code to send it only went live earlier today and has not been executed against RU yet.

## Plan

### 1. Register the LNM subscription, then read it back

Run the subscription for the master account and for OwnerID 741765 (Rentals United → Live notifications → "Refresh all accounts"), then read back with `Pull_ListLiveNotificationMechanismSubscriptions_RQ` and confirm RU is holding our handler URL, all six change types (including `PropertyMCQEligibilityCheck`) and the sub-user OwnerID as an observed owner. Nothing else in this plan is meaningful until that read-back is green.

One prerequisite to check while doing this: the master OwnerID is read from a stored setting that may not be configured. If it is missing, the master-level subscription cannot name itself as an observed owner and will be skipped — in that case we store the master OwnerID first.

### 2. Re-order MCQ and let the answer decide the next step

With the subscription confirmed, re-run Phase 4.3 for the Tidal Pools units.

- If RU accepts the order, the result arrives asynchronously as a `PropertyMCQEligibilityCheck` notification. Wire that notification through to the MCQ order record so the certification console shows the outcome instead of just "ordered".
- If RU still answers 280, the remaining variable is *which* credentials order the check. `CM_*` methods are Channel Management methods, and the white-label sub-user is not a channel manager — the master account is. Today we deliberately order MCQ as the sub-user (to avoid the "not the owner of the apartment" error seen on discount pushes). We would then try the order under master credentials with the sub-user's OwnerID observed via the LNM subscription, and keep whichever RU accepts, recording the rule so it is not undone later.

### 3. Escalate with evidence only if both fail

If neither credential path is accepted after a verified subscription, reply to Michał with the exact `ResponseID` values RU returned (e.g. `9753e97a59964a36ba5ba4243fa55931`) plus the confirmed subscription read-back. Those IDs let RU trace the calls on their side in seconds, which is far more useful than another "is it enabled?" round trip.

## Technical notes

- Fix location: `supabase/functions/rentalsunited-api/index.ts` (`order_mcq` credential scope), `supabase/functions/ru-lnm-handler/index.ts` (route `PropertyMCQEligibilityCheck` to `ru_mcq_orders`), `supabase/functions/ru-cert-portal/index.ts` (Phase 4.3 gating and result surfacing).
- `order_mcq` currently sits in `CERT_MASTER_FORBIDDEN_ACTIONS`; if RU requires master credentials for `CM_*` methods, that entry has to be lifted for this action only, with the sub-user still identified by `ObservedOwners`.
- MCQ ordering stays rate-limited like every other RU method (one call per method per sliding minute), so a multi-unit property paces its orders rather than firing four in a row as it did on 3 Aug.
- No database schema changes are needed; `ru_mcq_orders` already stores status, RU property ID and the response preview.
