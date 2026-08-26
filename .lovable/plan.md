# Fix Step A.3 failing on a freshly created distribution account

## What actually happened

The run for `tidal-pools-self-cateri@channels.roomsonline.co.za` (OwnerID 742566) did the hard part correctly, then failed on a bookkeeping bug:

- A.1 Confirm/create account — passed, created OwnerID 742566.
- A.2 Account credentials — passed: key pair minted (child attempt refused twice, master owner-scoped mint issued the pair) and stored, verified.
- A.3 Verify credentials — **failed with "No sub-account is bound yet"**, which stopped the chain.

The recorded ledger row and the channel call log confirm the account, its key pair and even the company profile push all succeeded at the channel — the company profile went out on the account's own credentials. So A.3's verdict is wrong, not the account.

## Root cause

The step runner reads the gate snapshot **once**, before the first task runs. For a brand-new account that snapshot has an empty binding (no OwnerID, no stored keys, no account id). Every later task in the chain keeps reading that stale snapshot, so:

- A.3 sees `ru_owner_id` empty and returns "No sub-account is bound yet" before it ever reaches the "already proven when minted" shortcut.
- A.4 (company profile) and A.5 (adopt listings) would read the same stale binding if the chain had continued.

This only bites on the first run for a new account. A second run passes because the binding then exists up front — which matches the pattern of Step A "failing once then working".

## The fix

1. **Live binding for the whole chain.** Keep a mutable binding in the run context. When A.1 succeeds, merge the account it returns (account id, OwnerID, login email, scope) plus the credential outcome from A.2 into that binding, and have all later tasks read the live binding instead of the snapshot's frozen copy. Refresh from the backend gate after A.1 when the task did not return a full account payload, so the binding is never guessed.
2. **Order the guards in A.3 correctly.** Check "credentials already proven in this run" before the "is anything bound" refusal, so a successful mint in the same run can never be reported as an unbound account.
3. **Downgrade the unbound case.** When nothing is bound and nothing was minted, A.3 should report a blocked step that names the missing binding, not a hard failure — the recoverable-code path already exists for that.
4. **Recover this property.** With the fix in place, re-run Step A for RU Test Clone B / OwnerID 742566: A.1 adopts the existing account, A.2 reports the stored pair, A.3 verifies against the real OwnerID, and the step should reach passed so Step B unlocks.

## Technical notes

- `src/lib/channelOnboardOrchestrator.ts`: `runOnboardStep` fetches `fetchOnboardGate` once at line ~938 and passes that same object to every runner; the `RUNNERS.verify_keys`, `company_profile` and `adopt_listings` bodies read `snapshot.binding.*`. Introduce a `binding` field on `RunContext` seeded from the snapshot, updated after `owner_account`, and switch those runners to it.
- The account payload `ensure_owner_account` already returns (`account.id`, `ru_owner_id`, `ru_login_email`, `scope`) plus `key_source`/`access_key` covers everything the later tasks need; `company_details_pushed` is already carried this way, so this follows the existing pattern.
- No edge-function or database change is needed — the channel side is already correct for this account.
