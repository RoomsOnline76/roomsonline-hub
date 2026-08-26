# Sub-account creation: stop the double account and the double identity

## What I checked

- The distribution account rows stored locally: `RU Test Clone B` and `PufferFish` both hold the **same value twice** — owner id `742566` / sub id `742566`, and `742555` / `742555`. That is why the Channel Monitor line reads "Owner: 742566 · Sub: 742566" and looks like an account nested under an account.
- The live channel roster currently lists 8 sub-accounts and only one created today (`742566`), so there is no nested account sitting at the channel right now.
- The sub-account creation call always authenticates as the **master** account, so a create can never place a child under a child.
- There is, however, a real path that creates **more than one** sub-account in a single Step A run.

## What is actually happening

1. **Duplicate identity in the UI (cosmetic).** When the channel creates a sub-account it returns a usable account id but reports `0` for the separate "user account" id. Step A fills the sub-user id with the owner id as a fallback, so both fields carry the same number and every screen prints the identity twice — reading as two accounts.

2. **Extra sub-accounts created for real (behavioural).** If the channel refuses automatic API-key creation for the freshly created sub-account, Step A "recycles": it generates the next slug login (`slug2@…`, then `slug3@…`), **creates another sub-account at the channel**, rebinds the property to it and retries the key mint — up to two extra accounts per run. The refused first account stays behind under the master account with nothing bound to it. Today's key mints were refused repeatedly, which is exactly the condition that triggers this.

## The fix

### 1. One account per Step A run

- Remove the "create a replacement sub-account" behaviour from the key-mint recovery path. A refused key mint is a channel-side entitlement problem, not an account problem, so Step A must keep the account it just created and report the blocker (the existing `RU_KEY_CREATION_NOT_ENABLED` state) instead of provisioning new logins.
- Keep the retry ladder that is safe: child credentials → retry after propagation → master owner-scoped mint. Only the account-creating recycle step goes away.
- Login recycling stays available for the one case it is legitimate: the channel rejecting the login itself as taken/archived **before** an account exists.

### 2. Stop printing one account as two

- Store the sub-user id only when the channel actually returns one; never mirror the owner id into it.
- Channel Monitor shows a single identity line ("Sub-account 742566"), with a distinct sub-user id shown only when the channel reports a different value.

### 3. Clean up what already exists

- One-time tidy of local rows where the sub-user id merely duplicates the owner id (clears the mirrored value; no channel traffic, no unbinding).
- Add an "orphan sub-accounts" line to the Advanced view of Channel Monitor: channel sub-accounts under our master account that no property or portfolio is bound to, so any account left behind by an earlier recycled run is visible and can be retired using the existing retirement list.

## Technical notes

- `supabase/functions/ru-cert-portal/index.ts` — Step A (`ensure_owner_account`): delete the `authRefused` recycle block that calls `create_user` again; keep `mintChildKeyPair`'s ordered variants and the `RU_KEY_CREATION_NOT_ENABLED` verdict. Stop the `ru_user_id: userAccountId ?? ruOwnerId` fallback in the saved row and in `mergeRuRosterUser`.
- `src/lib/channelOnboardOrchestrator.ts` — drop the `recycled_login` handling that assumes a replacement account.
- `src/components/admin/channel-monitor/ChannelPropertyTable.tsx` / `useChannelCostMonitor.ts` — render one identity, plus the orphan-account summary.
- Data tidy: `update ru_owner_accounts set ru_user_id = null where ru_user_id = ru_owner_id`.
- No schema change required.
