# Automatic sub-account key minting in Step A

Today Step A creates the sub-account and stores the password we generated, but the AccessKey/SecretKey pair is minted by a *separate* task that fails outright when no password is on file — which is what the screenshot shows ("Generate the first pair in the channel portal"). The wire method we need is already implemented (`Push_CreateApiKey_RQ`, exposed as `create_child_api_key`), it is simply not called at creation time.

## What changes

1. **Key pair is minted as part of account creation.** Immediately after the channel accepts the new sub-user, the same run authenticates as that sub-user with the email + password we just set, calls `Push_CreateApiKey_RQ` (`Scope: XmlApi`, label `ROLOS`), and stores the returned pair encrypted before returning. The secret is only ever returned once, so it is written in the same step — no separate manual action, no portal visit.

2. **Step A reports what was used.** The "Account credentials" line becomes informative instead of a dead end:
   - created and minted: "Key pair minted for OwnerID 742xxx · login · AccessKey 82VOPL…"
   - already stored: skipped, naming the account.
   - adopted account with a usable credential (stored keys or retained password): minted/renewed the same way.

3. **Nothing stalls the flow.** If the channel rate-limits the key call, the task reports the existing "waiting, retry in Ns" state and resumes, exactly like the other Step A tasks — it is never marked failed for a rate limit.

4. **The one case we cannot automate is handled honestly.** An *adopted* account whose password we never held (renamed login, or an account created outside ROL'OS) has no credential to authenticate the key call with — the channel offers no master-authenticated way to mint or reset a child key. That task then reports as blocked (amber, not red) with two inline choices: save the account's portal password (existing action, after which minting runs automatically), or create the account under a fresh login. Every account created by ROL'OS from now on never reaches this state.

5. **Later writes use the child keys.** Company profile, listing pushes, ARI and reservation reads already prefer the stored key pair over the password; once minting runs at creation, that path is the default from the first write.

## Technical notes

- `supabase/functions/ru-cert-portal/index.ts`, `ensure_owner_account`: after the `create_user` success branch and after the password is encrypted, invoke `rentalsunited-api` `create_child_api_key` with `auth_username`/`auth_password`, then `encrypt_sensitive_text` the secret and upsert `ru_api_credentials` (`ru_owner_id`, `login_email`, `access_key`, `secret_enc`, `key_label`, `verified_at`) plus `ru_api_access_key`/`ru_api_secret_enc` on the `ru_owner_accounts` row. Reuse the existing `create_api_key` logic by extracting it into a shared local helper so both entry points behave identically.
- Return `keys_minted`, `access_key` prefix and `key_source` (`minted` | `existing` | `blocked`) in the `ensure_owner_account` response.
- `src/lib/channelOnboardOrchestrator.ts`, `api_keys` runner: skip when the account step already minted or a pair is stored; drop the hard failure text and emit the blocked outcome with the two remedies; keep `pending`/`retryAfterMs` pass-through for rate limits.
- Rate-limit and status handling stays inside `rentalsunited-api`; no new endpoint or secret is required (master keys keep doing user management only).
