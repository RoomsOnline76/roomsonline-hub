# Confirm sub-user creation entitlement, then settle the key-mint refusal

Michał's mail confirms one thing precisely: the master account `sleepinafrica@roomsonline.co.za` now has the **create sub-user** privilege. That matches what we see — `Push_CreateUser_RQ` succeeds and accounts appear on the roster.

It says nothing about **API key creation for the created sub-user**, which is where Step A currently stops (channel status `-4` on `Push_CreateApiKey_RQ` authenticated as the sub-user). Step A was just rebuilt as one atomic run (generate compliant password → create user → resolve OwnerID → persist password encrypted → mint with that child login), and that new flow has not yet been proven end-to-end on a fresh account. So the next move is evidence, not more code changes.

## Steps

1. **Prove the atomic run on a brand-new account.** Create one fresh sub-account through Step A (new slug login, freshly generated compliant password) and let the same run mint its first key pair. A brand-new login is the only clean test: existing accounts (Leopard / 742612 included) may have a password the channel never accepted, so their `-4` is ambiguous.

2. **Record the exact wire evidence for that run.** From the live traffic monitor, capture for each call: method, envelope element order, status id and the channel's verbatim status message, timestamp. Specifically the `Push_CreateUser_RQ` (with the password we sent, redacted in the report) and the immediately following `Push_CreateApiKey_RQ` for the same login.

3. **Branch on the result.**
   - Mint succeeds → Step A completes, keys verified as child-scoped, Step B unblocked. Then re-run the same flow for the parked accounts using their persisted passwords, and roll it through the roster's "Generate missing keys" runner.
   - Mint still returns `-4` → the refusal is either a wrong-credential path on our side or a missing key-creation entitlement on the sub-user. The evidence from step 2 distinguishes them: if the same login/password pair authenticates a plain read (e.g. a sub-user-scoped listing pull) but only the key call fails, it is an entitlement question for Michał.

4. **If it is an entitlement question, send it with evidence.** Draft the reply to Michał in that case: confirm sub-user creation is working, name one example OwnerID and login, quote the `Push_CreateApiKey_RQ` request shape and the verbatim `-4` response, and ask whether XML API key creation must also be enabled for accounts created under our master — and whether we should instead be issued keys via a white-label provisioning path.

5. **Ask RU for the two optional create fields while we are in the thread.** `PMSId` and `ConfigurationString` are supported by `Push_CreateUser_RQ` and we currently send `PMSId` only if `RU_PMS_ID` is configured. Ask Michał for our PMS id (and any configuration string) so children are created as PMS-linked accounts rather than bare portal users — a plausible contributor to the key refusal.

## Technical scope

- No new adapter behaviour is planned in step 1–2; it exercises the code already in `supabase/functions/ru-cert-portal/index.ts` (atomic Step A) and `supabase/functions/rentalsunited-api/index.ts` (`buildCreateUserXml`, `create_child_api_key`).
- Only if the fresh-account mint succeeds do we touch code: extend the parked-account recovery to reuse persisted passwords, and surface the outcome verbatim in Step A and the roster runner.
- If RU supplies a PMS id, it is stored as the `RU_PMS_ID` setting — no schema change.
- No master-authenticated key mint is reintroduced under any branch.
