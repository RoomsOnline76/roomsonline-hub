# Step A: keep the created sub-account credential path intact

## Verified current state

- The latest channel log shows `Push_CreateUser_RQ` succeeded for the new sub-account at 12:02 UTC and returned id `742536`.
- The following roster read lists that same id as `OwnerID 742536` for `newjulius@polka.co.za`, so the channel account exists under the master roster.
- The persisted `ru_roster_cache` row still does not contain `742536`, so later code can see a stale roster and behave as if the freshly-created account is not available.
- `ru-cert-portal` already encrypts the generated `SLPafrica247*` password on the non-adopted create path, but the post-create identity handoff can still save an incomplete account when the immediate roster read is stale/throttled.
- The Step A runner currently reports a generic password/key blocker when `key_source` is blocked, even if the account was created and the issue is missing OwnerID resolution or a queued key mint.

## What will change

1. **Normalize create response identity**
   - Treat the id returned by `Push_CreateUser_RQ` as the new sub-account OwnerID when the roster has not caught up yet.
   - Keep `ru_user_id` as best-effort metadata only; Step A’s required identity is the OwnerID used by later account-scoped calls.

2. **Patch the roster cache after successful create**
   - After a successful create, merge the new sub-account into the local roster cache immediately.
   - This avoids waiting for the 10-minute cache TTL or a second rate-limited `Pull_ListMyUsers_RQ` before the rest of Step A can find the account.

3. **Guarantee password retention for ROLOS-created accounts**
   - If Step A created the sub-account, encrypt and save the generated password on the saved account row before any key/company task runs.
   - If an existing local row is updated for the same OwnerID/login, do not blank the password during the update.

4. **Improve blocked messaging without manual key capture**
   - If automatic key creation is blocked because identity is incomplete, show the actual identity/cache issue instead of asking for a password we already generated.
   - Keep rate-limit outcomes as “waiting” with retry timing, not failed.
   - Keep manual AccessKey/SecretKey capture scrubbed from Step A.

5. **Repair the affected local account if needed**
   - Update the local PufferFish / DEMO ACCOUNT binding row to hold `OwnerID 742536`, `newjulius@polka.co.za`, and the encrypted generated password if the row is still incomplete.
   - This is local backend cleanup only; no channel traffic.

## Technical notes

- Primary backend change: `supabase/functions/ru-cert-portal/index.ts` in the Step A `ensure_owner_account` flow.
- Shared cache helper change: `supabase/functions/_shared/ruRosterCache.ts` to add a small merge/upsert helper for one known sub-account.
- Client copy/result change: `src/lib/channelOnboardOrchestrator.ts` only if needed for clearer blocked details.
- No change to channel XML builders or adapter wire method shapes.
- No schema change required.

## Verification

- Confirm the local binding row for PufferFish/DEMO ACCOUNT resolves to `newjulius@polka.co.za` and `OwnerID 742536`.
- Confirm Step A no longer prompts for the generated password after creating a new sub-account.
- Confirm a stale roster cache does not hide a just-created sub-account from the same Step A run.
- Confirm the preview build remains green.
