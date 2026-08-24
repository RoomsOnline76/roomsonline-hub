# Exclude detached sub-accounts from Channel reconciliation

## What happens today (verified)

- Reconcile builds its account list from two sources: the live channel roster (`Pull_ListMyUsers`) and our own `ru_owner_accounts` table.
- Any locally bound OwnerID that is **missing from the roster** is added back into the list anyway, so an account that is no longer under the master keeps appearing, keeps being read, and keeps producing "no keys / could not be read / owner violation" noise.
- Retired test accounts already have a clean exclusion path (`ru_retired_accounts`), reported as an explicit exclusion. Detached accounts have no equivalent.
- Right now there is exactly one bound account (OwnerID 741761, portfolio-scoped, keys stored), so this change is about correctness going forward rather than clearing a current mess.

## Change

1. **Detached rule.** When the roster read succeeds, a bound OwnerID that the roster does not return is classified `detached` — excluded from the account table, from listing totals, from orphan/duplicate/stale classification, from owner violations, and from the "unverifiable" list.
2. **Auditable, not silent.** Reconcile returns a `detached_accounts` array (OwnerID, last known login, last known listing count from the previous reconciliation snapshot, first-seen-detached timestamp). The panel shows them in a collapsed "Excluded — no longer under the master account" note, matching how retired accounts read today.
3. **Fail-safe.** If the roster read itself fails (`roster_error` set), nothing is treated as detached — the current fallback behaviour is kept, because "the roster did not answer" must never look like "the account is gone".
4. **Alerts.** The daily reconcile email counts detached accounts as an informational line only; they can no longer raise a disparity alert.

## Your billing question — the honest answer

We cannot prove a detached account holds nothing, and the plan does not pretend otherwise. What the code establishes:

- A sub-account's inventory can only be read **as that sub-account** (`list_properties` authenticates with that account's own key pair). If the account is no longer under our master, our keys no longer authorise a read, so its listings become invisible to us by definition.
- Therefore a detached account **can** still hold live listings we no longer see, and if it were still billable under our master, that would be unwanted cost.
- What limits the exposure: detachment means RU has moved the account out from under the master, which is also what moves its billing off our invoice. That is a statement about RU's side, not something our API can verify.

So the plan treats exclusion as **exclusion from monitoring, not proof of zero**: each detached account keeps its last known live-listing count and gets a "verify with the channel that this account and its listings were transferred off our master invoice" flag in the panel. If the last known count was greater than zero, that flag is shown in amber so it is chased rather than filed away.

## Technical notes

- `supabase/functions/channel-manager-entitlement/index.ts` (`scope === "reconcile"`): stop back-filling the roster from `boundByOwner` when the roster read succeeded; build a `detached` set instead, skip those OwnerIDs in the read loop, and add `detached_accounts` to the response.
- Last known counts come from the most recent stored reconciliation snapshot (the same record the cron already writes), so no new channel calls are made.
- `supabase/functions/cron-channel-reconcile/index.ts`: treat detached accounts as informational; exclude them from `errored_accounts` and from disparity.
- `src/components/admin/channel-monitor/ChannelReconciliationPanel.tsx`: collapsed detached-account block with the verify-with-channel flag.
- No schema change and no extra RU traffic; detached accounts strictly reduce the number of calls per reconcile pass.
