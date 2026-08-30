# Make channel onboarding a surgical, single-pass call sequence

## Verified findings

The live traffic from **14:37:45–14:41:35 Johannesburg time** confirms the problem:

- `Pull_GetLocationByCoordinates_RQ` succeeded at 14:37:45 with status `0`, then was invoked again at 14:37:50 and 14:37:53 and rate-limited.
- The failed coordinate retry fell through to `Pull_GetLocationByName_RQ`; one name failed with status `39`, the next succeeded with status `0`, and both names were attempted again seconds later.
- `Pull_ListOwnerProp_RQ` succeeded at 14:37:48, then was invoked again at 14:40:56.
- The final publish sequence then completed successfully: company, currency, property, availability, prices, one property read, activation, notification setup, and white-label token preparation.
- Status `0` is already logged as `success: true`. The repeats are separate application invocations, not a status-parser failure.

The primary code cause is confirmed in `ru-cert-portal`: `resolveOwnerLocationIds()` runs before the account action is dispatched. Therefore preview, account creation, credential handling, company preview, company submission, and resume calls can each independently resolve the same location. Its fallback also cascades from coordinates to city and country names, multiplying one unnecessary invocation into several calls.

A second confirmed issue is that the manual key verification result and its `Pull_ListOwnerProp_RQ` payload are not reliably carried across the browser resume boundary. The code has a durable owner-listing cache and run-context fields intended for reuse, but the resumed call can re-run verification instead of continuing directly to company details.

## Changes

### 1. Remove location reads from account orchestration

- Stop resolving a channel location at the top of every `ru-cert-portal` account action.
- `plan_owner_account`, key capture/verification, resume, company preview, and listing adoption must perform **zero location API calls**.
- Account creation and company payload construction will use the already-authored local `ru_location_id` / persisted property mapping.
- If no local LocationID exists, stop once with a precise readiness blocker. Do not probe coordinates, then city, then country during onboarding.
- Keep live coordinate/name lookup only as an explicit operator location-resolution action outside the Step A/B run.

### 2. Make A.2 verification durable and consume it once

- On manual AccessKey/SecretKey submission, perform exactly one owner-scoped `Pull_ListOwnerProp_RQ`.
- Treat status `0` as terminal success immediately.
- Persist both the verified credential verdict and the returned listing snapshot, including an empty listing array as a valid result.
- Resume at `company_profile`; never replay credential verification after A.2 has passed.
- Make A.5 consume the A.2 listing snapshot from the existing durable owner-listing cache, so it issues no second listing pull.

### 3. Enforce one result owner for each later task

- Step B review uses local fingerprints plus the cached A.2 listing snapshot; it does not perform another listing read.
- The property push result is authoritative for newly created listing IDs.
- The single post-push `Pull_ListSpecProp_RQ` result supplies listing, location, and currency evidence together. `verify_listings` and `verify_currency` consume that result and make no separate reads.
- Currency writes occur only when the owner-scoped durable verdict proves a mismatch; a status `0` write is accepted and never retried in the same run.
- Entitlement retains `skip_ari_refresh: true`; it must not replay property, availability, pricing, location, or currency calls.
- White-label token preparation remains local/cached when the log says `not_attempted`; it must not trigger an onboarding replay.

### 4. Add a run-level duplicate-call circuit breaker

- Give the complete A→B execution one durable run ID.
- Before every channel invocation, build a call key from `run_id + verb + owner_id + property/listing scope + normalized payload fingerprint`.
- If the same key has already succeeded with status `0`, return that stored result instead of invoking the channel.
- If the same key is already pending/rate-deferred, return the existing pending result and retry time; do not enqueue or invoke a duplicate.
- Retries are permitted only for a transport failure where the request is proven not to have reached the channel. A channel response—including status `0`—is terminal for that call.

### 5. Remove broad internal retry loops

- Remove the multi-attempt company-profile loop from onboarding. One `Push_FillCompanyDetails_RQ` attempt produces one terminal result.
- Remove coordinate/name fallback loops from onboarding.
- Ensure Resume starts at the first incomplete task and carries all earlier passed task evidence; it must never restart Step A or re-run an earlier successful verb.

## Exact clean-run call budget

```text
Preview account       local database only                         0 channel calls
A.1 resolve account   Pull_ListMyUsers_RQ                         once
A.1 create            Push_CreateUser_RQ                          once, only if not adopted
A.2 manual entry      no call until operator submits keys
A.2 verify keys       Pull_ListOwnerProp_RQ                       once
A.4 company           Push_FillCompanyDetails_RQ                  once
A.5 adopt listings    consume A.2 snapshot                        0 new calls

B review              local fingerprints + cached snapshot        0 calls
B currency decision   Push_ChangeCurrency_RQ                       0 or 1, only on proven mismatch
B publish             Push_PutProperty_RQ                          once per required listing
B availability        Push_PutAvbUnits_RQ                          once per required listing/window
B prices              Push_PutPrices_RQ                            once per required listing/window
B evidence            Pull_ListSpecProp_RQ                         once per published listing
B activate            Push_SetPropertiesStatus_RQ                  once
B notifications       each required setup/read verb                once only
B token               cached/local preparation where available     no duplicate wire call
```

There will be **no `Pull_GetLocationByCoordinates_RQ` or `Pull_GetLocationByName_RQ` in a normal onboarding run**.

## Verification

- Add call-budget tests for new-account, adopted-account, empty-listing, multi-unit, resume-after-A.2, and rate-deferred paths.
- Assert duplicate `verb + scope + fingerprint` calls fail the test, even if they originate from different functions.
- Assert every status `0` response advances to the next task without retry, fallback, or queue insertion.
- Run one disposable property end to end and compare `ru_api_log` against the exact budget above.
- Confirm no duplicate location/listing calls, no 429s, no Step A replay, and that the final state is **Configure channels**.

## Technical scope

Expected changes are limited to the onboarding orchestrator, `ru-cert-portal`, the shared RU call-dedupe/evidence helpers, the property push verification handoff, and focused tests. Any edit inside a locked adapter region will be shown and kept to the smallest necessary diff before deployment.
