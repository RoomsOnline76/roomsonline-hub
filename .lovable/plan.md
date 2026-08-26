# Step A stopped instead of recycling — our own rate gate swallowed the refusal

## Confirmed diagnosis

The 14:54 run made exactly two key-creation calls, then stopped:

- `14:54:50` `Push_CreateApiKey_RQ` → `-4 Incorrect login or password` (the child login envelope)
- `14:54:57` `Push_CreateApiKey_RQ` → `RU_RATE_DEFERRED: "Push_CreateApiKey_RQ" was called with the same parameters`

The second line is the propagation retry. It sends a byte-identical payload (same label, same credentials), so the one-call-per-method-with-the-same-parameters window rejects it before it ever reaches the channel. A rate deferral returns immediately from the mint helper, which means:

- the third variant (master, owner-scoped) never ran;
- the mint reported `rateDeferred`, not `authRefused`, so the automatic login-recycling branch was never entered — no new slug login was generated, nothing was rebound;
- Step A ended in the "waiting" state and the preview modal came back.

So the recycling logic added yesterday is correct but unreachable: the refusal is being reclassified as a deferral one step earlier.

## Changes

1. **Make each mint attempt parameter-distinct.** Every variant gets its own key label (`ROLOS`, `ROLOS-r2`, `ROLOS-m`, and `ROLOS-c<attempt>` for recycled accounts) so consecutive attempts are no longer "the same parameters" and the retry plus the master-scoped variant actually reach the channel.

2. **A deferral must not cancel a refusal already seen.** If an earlier variant was refused with an auth error, a later variant hitting the sliding window no longer aborts the mint: the helper keeps walking the remaining variants and, if none succeeds, returns `authRefused` (carrying the real `-4` status) rather than `rateDeferred`. A deferral only wins when nothing has been refused yet — that is a genuine "come back shortly".

3. **Recycling therefore runs.** With the refusal preserved, Step A generates the next slug login, creates that sub-account with a fresh password, rebinds the property, stores the password before minting, and retries — up to two replacement logins, exactly as designed. Each recycled attempt also uses its own label.

4. **Truthful stop.** Only if every variant on the original account and both replacement logins are refused does Step A stop on `RU_KEY_CREATION_NOT_ENABLED`, and the failure-only modal states which logins were created and that the channel is refusing XML key creation. A pure rate-limit still shows the countdown and resumes on its own.

5. **Task lines show the attempts.** The Step A dots report `key pair — child login`, `… retry`, `… master scope`, `… replacement login 1 of 2`, so the run is never a silent dead end.

## Technical notes

- `supabase/functions/ru-cert-portal/index.ts`, `mintChildKeyPair`: per-variant `keyLabel`; replace the early `return { rateDeferred }` with a recorded `deferral` that is only returned when `lastFailure?.authRefused` is false and no variant remains; propagate the recorded `-4` status into the returned `authRefused` result. Recycle loop passes `keyLabel: "ROLOS-c<attempt>"`.
- The key label written to `ru_api_credentials.key_label` / `ru_owner_accounts.ru_api_key_label` becomes whichever variant succeeded; no schema change.
- No change to `_shared/ruApiKeyXml.ts` element ordering (Authentication → Label → Scope) or to the rate gate itself.
- Existing tests in `ruApiKeyXml.test.ts` extended to assert the label is passed through and that variants differ.

## Verification

Deploy `ru-cert-portal`, re-run Step A on the bound property, then read `ru_api_log`: expect three distinct `Push_CreateApiKey_RQ` calls (no "same parameters" rejection), and either a stored pair or a `Push_CreateUser_RQ` for a replacement slug login followed by a further mint attempt — never a stop after two calls.
