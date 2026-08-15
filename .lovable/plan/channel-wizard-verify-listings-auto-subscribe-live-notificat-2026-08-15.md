# Channel wizard: verify listings, auto-subscribe live notifications, push every save

## What is true today (verified)

- The wizard's push and pull actions exist (`push-property-to-ru`, then `resolve_ru_property_ids` in the Rentals-United panel), but nothing is stored to say "this listing was pulled back and confirmed" — there is no verification marker anywhere in the code or the account table.
- Live notifications (RLNM reservations + LNM content/ARI) are only subscribed from the admin **Live notifications** panel or the nightly `ru-rlnm-daily` cron. Neither key verification nor account binding subscribes them, so a freshly onboarded portfolio is unsubscribed until the next cron run.
- Property content and rate saves already fire deltas (`ru-static-delta` / `ru-ari-delta`) from the property editor, room manager, policies, rate plans and restrictions.
- Company/owner details are pushed only from the distribution panel button (`ensure_company_details`) — editing company information elsewhere and saving does not re-push it.

## Changes

### 1. Confirm listings after push + pull

- After a successful push, the pull step compares each expected unit against what the channel actually reports and records the outcome per property: verified units, unmatched names, the account it was read from, and the time.
- The wizard's distribution step shows a single explicit confirmation state — **Listings verified on <account> (n of n units)** — instead of a transient toast. Anything unmatched is listed by unit name with a re-pull action.
- The verified state is what the sign-off step reads, so sign-off can no longer be reached on a push whose listings were never read back.
- Re-pushing or unbinding clears the confirmation so it can never go stale.

### 2. Portfolio auto-subscribes to live notifications

- Once a sub-account's keys verify (the same moment company details are pushed), both subscriptions are registered automatically under that sub-account's own keys: the reservation handler (RLNM) and the content/ARI subscriptions (LNM), followed immediately by the read-back that proves they stored.
- This runs per distribution account for the whole portfolio, in the background, and never fails the verification step — a subscribe failure is reported as a warning and retried by the existing nightly refresh.
- The distribution step gains a small live-notifications line: subscribed / stale / drifted, with a manual re-subscribe behind a disclosure for admins.

### 3. Every company or property save pushes to the channel

- Saving company information re-pushes the owner/company profile to the channel (same path the panel button uses), fire-and-forget, only when the account is bound and the values actually changed.
- Audit the remaining property save surfaces and add the content delta wherever a save persists channel-relevant static data but currently does not queue one.
- The existing gate-parking behaviour is kept: if the listing is not push-ready the delta is parked and re-fires when readiness clears, so no save is ever blocked or silently dropped.

## Technical notes

- New per-property verification fields (verified-at, verified account, unit match counts, unmatched names) written by `ru-cert-portal` during `resolve_ru_property_ids`; the wizard reads them through the existing readiness/identity payload rather than re-probing.
- Auto-subscribe reuses `_shared/ruLnm.ts` (`DEFAULT_LNM_CHANGE_TYPES`, `diffLnmSubscriptions`) and the existing `subscribe_notifications` / `put_lnm_subscriptions` / `list_lnm_subscriptions` actions with the current per-method 61 s pacing, logging to `ru_sync_runs` under the same action keys the freshness checks already use. `put_lnm_subscriptions` stays sub-user-only (master credentials remain forbidden).
- Company re-push goes through `ensure_company_details` with a change fingerprint so a no-op save costs nothing.
- No locked adapter regions are touched.
