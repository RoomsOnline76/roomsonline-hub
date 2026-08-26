# Leopard 5948442 on the master account — cause and clean-up

## What happened (confirmed)

Leopard's listing was created while we were authenticated as our **master** channel account, so the channel filed it in the master account's footprint. The payload did name the sub-account, which is why a sub-account read still shows the listing.

The chain:

1. Step A creates the sub-account (OwnerID 742574), then asks the channel for its API key pair.
2. The sub-account's own login envelope is refused for freshly created accounts, so Step A falls back to a **master-authenticated** key request that names the sub-account.
3. The channel ignores the named sub-account when issuing keys and hands back a key pair belonging to the **master** account.
4. That pair was stored as the sub-account's "own keys". Every later push for Leopard therefore authenticated as master → listing created on the master account.
5. The old ownership check could not catch this, because a master pair can legitimately read the sub-account's inventory.

Proof: the pair stored for 742574 can list all 23 sub-accounts under our master account — only a parent account can do that.

## Already in place (shipped earlier this session)

- Scope probe: a key pair that can enumerate the roster is classed as a master pair.
- Stored credentials now carry a proven scope (child / master pair / unverified); the 8 pairs minted through the master-authenticated route are flagged as master pairs.
- Every sub-account write on a master pair is refused and logged instead of sent.
- Step A discards a minted pair that probes as a master pair rather than storing it.

## Remaining work in this plan

### 1. Clean up the master account's footprint

Listings pushed on master credentials on 26 Aug (8 sub-accounts, ~12 pushes) still sit in the master account, including Leopard 5948442.

- Add an "Master-footprint audit" section in Channel Monitor → Advanced that lists every listing created while a master pair was in use, with the property, sub-account and listing ID.
- Per row: **Archive at channel** (reuses the existing archive path, master-authenticated, which is correct here because the listing genuinely belongs to the master account) and record the archival against the property.
- Clear the property's channel listing ID and mark it "needs re-push" so nothing points at a dead listing.

### 2. Unblock Step A properly

Since master-pair keys are now refused, these sub-accounts cannot push until they hold real keys.

- Step A surfaces an explicit blocker: "the channel must enable API key creation for this sub-account" with the OwnerID and login shown for escalation.
- Add a **Re-mint keys** action that retries the sub-account's own login envelope (the only envelope that yields a genuine child pair) and stores the result only when it probes as child-scoped.
- Onboarding readiness shows the account as not ready to sell while the scope is unverified or a master pair.

### 3. Guard the ongoing paths

- Nightly health report counts credentials whose scope is `master_pair` or `unverified` and lists the affected accounts.
- A one-off scope sweep over all stored pairs so the flags come from a real probe, not the key label.

## Technical notes

- Scope probe verb: `Pull_ListMyUsers_RQ`; any OwnerID other than the account's own proves a parent pair.
- Scope cached on the stored-credentials row (`key_scope`, `key_scope_verified_at`, `key_scope_detail`).
- Write refusal code: `RU_KEYS_ARE_MASTER_PAIR`, logged as not-attempted for certification evidence.
- Affected sub-accounts: 742555, 742566, 742568, 742569, 742570, 742572, 742573, 742574.
