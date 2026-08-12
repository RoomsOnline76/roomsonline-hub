# Channel Monitor refresh: make it reconcile against the channel

## What the refresh does today

The Refresh button on **Channel Manager — Cost, Accounts & Certification** does **not** talk to Rentals United. It re-reads local database records only:

- `properties` (listing id, push enabled, archived/active flags)
- `hostfully_room_types` (unit-level listing ids, active flag)
- portfolios, sync runs, archive events, FX rate, billing defaults, owner accounts

So listing counts, costs and the "Duplicate listings" grouping are all derived from what ROL'OS *believes* is on the channel. Anything created directly in the channel account, or a listing we archived upstream but whose local id was never cleared, will not show up correctly until someone pushes or purges through the app.

## What to add

A true reconciliation pass, so Refresh answers "what is actually on the account?".

1. **Pull the account inventory.** For each RU account (owner / sub-user) mapped to a property or portfolio, call the existing account-wide listing query and collect every listing id plus its name and archived state.
2. **Compare against local records.** Classify each listing id:
   - Matched — present locally and active (billable).
   - Orphan on channel — exists on the account but no local property/unit points at it.
   - Stale locally — local record holds an id the account no longer returns (already removed upstream).
3. **Surface the result in the UI.** New "Channel reconciliation" panel on the page showing counts per class, per property, with the reconciliation timestamp. Orphans get a "Remove from channel" action (reuses the existing purge path); stale ids get a "Clear local id" action.
4. **Keep costs honest.** Cost forecast keeps billing on matched active listings, but flags when the channel holds more listings than we bill for, since the account is what the vendor invoices.
5. **Refresh behaviour.** Local read stays instant; the channel pull runs as a second phase with its own spinner, and results cache so the page is not slow on every visit. A "Reconcile with channel" control triggers it on demand.

## Technical notes

- Reuse `Pull_ListOwnerProp_RQ` already implemented in the `rentalsunited-api` function; no new vendor call is needed.
- Add a server action that loops the accounts in `ru_owner_accounts`, returns `{ ownerId, subUserId, listings: [{ id, name, isArchived }] }`, and logs the raw XML through the existing durable log for audit evidence.
- Extend `useChannelCostMonitor` with `reconciliation` state plus a `reconcile()` call; the existing `refresh()` keeps its local-only semantics.
- No changes to the locked adapter regions — the new action is additive and read-only against the channel.
