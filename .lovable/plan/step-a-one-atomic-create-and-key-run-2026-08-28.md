# Step A: one atomic create-and-key run

## What the documentation actually says

The payload you pasted is the full documented `Push_CreateUser_RQ` schema, and it is the same one I read on the live reference page a moment ago:

```text
Authentication (AccessKey + SecretKey)
FirstName        String(50)  mandatory
LastName         String(50)  mandatory
Email            String(50)  mandatory
Password         String(50)  mandatory
PMSId            Integer     optional
ConfigurationString String(150) optional
Locations/LocationId         mandatory (at least one)
```

There is no key element in that request, and the documented response is only `Status` + `ResponseID` — no OwnerID and no AccessKey/SecretKey. Keys come from `Push_CreateApiKey_RQ`, which has no OwnerID field, so it always issues a key for whoever authenticates.

So the "all in one push" behaviour is achievable — but as **one atomic run in ROL**, not one wire call: the password we send in the create push is the credential the key mint authenticates with, in the same run, with no operator step. That is what this plan builds.

## What changes

1. **Per-account compliant password, persisted verbatim.** Step A generates the account password (12+ chars, upper, lower, digit, special, never containing the login email — the documented rule), sends it in `Push_CreateUser_RQ`, and stores exactly that string encrypted before anything else runs. Never re-derive it later, never fall back to a shared literal for a login we created.

2. **Same-run child key mint.** Immediately after the create push resolves the new OwnerID (paced roster read, honouring the one-per-minute throttle), Step A mints the pair with `Push_CreateApiKey_RQ` authenticated as **that sub-user's own login + the password just sent** (`Label`, `Scope=XmlApi`, documented element order). No master-authenticated variant, no `<OwnerID>` injection — those only ever produced master pairs.

3. **Always send the PMS association.** `PMSId` is included whenever configured, positioned between `<Password>` and `<Locations>` per the schema, plus `ConfigurationString` when RU support has given us a value, so the child is created as a PMS-linked account rather than a bare portal user.

4. **Verify before storing.** The issued pair is probed once; if it can list users it is a master pair and is discarded and deleted, never stored or used for inventory writes.

5. **Honest single-screen outcome.** Step A reports one of three verdicts per account, with the exact channel status:
   - keys minted and verified as child-scoped → Step A complete, Step B unblocked;
   - channel throttle → one automatic retry after the cooldown, then a resumable "retry mint" action (account and password already persisted, so no duplicate account is ever created);
   - channel refusal `-4` / key-creation-not-enabled → the account stays bound and parked with the refusal text shown verbatim, and an evidence line (envelope shape, status id, status message) is written to the traffic log for an RU support ticket. No orphan sub-account, no master pair, no silent success.

## Technical notes

- `supabase/functions/rentalsunited-api/index.ts` — `buildCreateUserXml` keeps the documented order and adds `ConfigurationString`; `Push_CreateApiKey_RQ` builder drops any owner-scoped variant so a child mint can only be a child-credential envelope.
- `supabase/functions/ru-cert-portal/index.ts` — Step A becomes one transaction-like sequence (generate password → create user → paced OwnerID resolve → persist login/password → mint → verify → store), each stage recorded so a resume never re-creates the account. `RU_SUB_USER_PASSWORD` stays only as the legacy credential for accounts adopted before this change.
- `supabase/functions/_shared/ruApiKeyXml.ts` and its tests — assert the documented element order and the absence of `OwnerID` on child mints.
- Step A UI shows the stage list live (create → identify → credentials → keys → verify) with the channel's own message on any stop.
