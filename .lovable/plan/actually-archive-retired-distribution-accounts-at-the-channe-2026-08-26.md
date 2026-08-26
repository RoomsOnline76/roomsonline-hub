# Actually archive retired distribution accounts at the channel

## What's wrong today

Two different "retire" paths exist and neither archives the account at the channel:

- **Advanced → Orphan distribution accounts → Archive** writes a row into the retired registry only. It makes no channel call at all, so the account keeps its listings, its API keys and its billable footprint in the channel portal. That is exactly the behaviour you saw.
- **Retire a bound account** does archive listings, but only listings whose ids ROL'OS already stored. For most of these accounts ROL'OS never stored ids, so nothing was archived and the account itself was never touched.

Of the 17 accounts you listed, 10 still have live API key pairs stored on our side (742091, 742555, 742566, 742568, 742569, 742570, 742572, 742573, 742574, 741761), so those can be worked without any login. The rest have no keys and need a login with the password you supplied to mint a pair first.

## What will be built

### 1. A real channel purge, per account

A new admin-only channel action that runs, per OwnerID, in this order and reports each step:

1. **Authenticate as the sub-account.** Use the stored key pair when present; otherwise mint one using the account's login email and the operator-supplied password (the existing self-healing mint path). If the channel refuses the login, that account is reported "login refused" and left untouched — nothing is faked.
2. **Enumerate what the account actually owns** by listing properties under that sub-account, rather than trusting our stored listing ids. This catches the listings that were missed.
3. **Archive every listing** it owns, one by one, recording each result in the channel archive log.
4. **Rename the portal login** to the `Archived_<email>` form the portal itself uses for archived accounts, so the account is visibly dead in the roster and its email is freed for reuse. If the channel refuses the rename, it is reported as such — the listing archives still stand.
5. **Release the keys** — delete our stored key pair for that account, and stamp the retired registry with when it was archived at the channel, how many listings were archived and what refused.

Nothing is marked as archived-at-channel unless the channel confirmed it.

### 2. Bulk runner in the UI

In Channel Monitor → Advanced, the archived-accounts list gets:

- A per-row **Archive at channel** button, and an **Archive all outstanding** button that walks the list sequentially (rate-limit aware, resuming rather than hammering).
- One password field, used only for the accounts that need a fresh key mint, held in the form for the run and never stored.
- A per-account result line: listings archived, listings refused, login renamed, keys released — plus a badge on rows already confirmed archived at the channel, replacing today's inference from the roster.

The `rooms@roomsonline.co.za` (741761), `ru-test-32` (742577) and `testc@polka.co.za` (742574) rows are still **bound**, so the runner will skip them and say so; retire the binding first if you also want those gone.

### 3. Close the hole that caused this

The orphan-archive button no longer performs a registry-only write. It runs the same channel purge, and only writes the registry entry once the channel side is done (or the operator explicitly overrides after a refusal, which is recorded in the reason).

## Technical notes

- New action `purge_channel_account` in the `ru-cert-portal` edge function, reusing the existing child-scoped auth, key-mint and `set_property_status` paths; every call goes through the normal traffic log so the run is auditable in the live traffic monitor.
- Migration adds `channel_archived_at`, `listings_archived`, and `channel_archive_result` (jsonb) to the retired-account registry; grants and policies stay admin-only as today.
- The login rename uses the existing owner-detail push. Whether the channel accepts a rename on an account with archived listings is not yet proven, so the run treats it as best-effort and reports the channel's own answer instead of assuming success.
- Listing enumeration is a single list call per account, then one archive call per listing; a rate-limit response parks the remainder in the call queue and the panel shows the resume state.
