# Retire a bound distribution account (Advanced → Orphan distribution accounts)

Add a second section to the Orphan distribution accounts panel: **Retire a bound
sub-account**. It lets an admin take a distribution account that is still bound to a
property or portfolio and fully decommission it in one guarded action.

## Order of operations (strict, and reported step by step)

1. **Archive the listings first.** For every property bound to the account, and for
   each of its units, the listing is set inactive and archived at the channel
   (listing-status push, owner-scoped credentials). Any listing that the channel
   refuses is reported by name — the run does not pretend it succeeded.
2. **Archive the sub-account.** The OwnerID is written to the retired registry, so
   every roster read, listing count, cost attribution, compliance sweep and health
   check skips it from that moment on.
3. **Disconnect the property.** The binding row is removed and each affected property
   is cleared exactly as the existing unbind does: listing ids on the property and its
   units, verification stamps, readiness snapshot, push flag off.

Afterwards the property has no distribution login, so the Onboard-a-property card
shows it as "To onboard" again and Step A must provision a fresh account before any
push can happen.

## UI

- New collapsible sub-section under the orphan list: a picker of currently bound
  accounts (login email · OwnerID · the property or portfolio it serves).
- Confirm dialog that spells out the three steps, requires typing the OwnerID to
  proceed, and takes an optional reason (stored with the retirement).
- Live progress lines while it runs (listings archived x/y → account archived →
  property disconnected), then a summary toast and refreshed counters.
- If step 1 fails for some listings, the dialog stops before step 2 and offers
  "Retire anyway" so the admin decides knowingly.

## Technical notes

- New `retire_owner_account` action in the `ru-cert-portal` function performing the
  whole sequence server-side (property + unit listing archive via the listing-status
  push, retired-registry upsert, per-property unbind reusing the existing
  `unbind_property_account` logic, `ru_owner_accounts` row delete), returning a
  per-step result array. Writes an audit log entry, and refuses when the account has
  no OwnerID.
- `OrphanSubAccountsPanel.tsx`: new bound-accounts query, picker, confirm dialog,
  progress display; invalidates the same dependent queries as archiving does.
- Step A already recycles logins when the channel refuses a reused email, so a
  retired slug email is regenerated as `slug2@roomsonline.co.za` on the next run.
- No schema change.
