# Make Step A singular and resumable

## Verified problems

- After `Push_CreateUser_RQ` succeeds, `ensure_owner_account` runs an 80-second `step-a-create-readback` loop against `Pull_ListMyUsers_RQ`, then can run another roster read later. The create response only contains status/response ID, but OwnerID is not required until the key pair is verified.
- Saving the key pair already performs the A.3 owner-scoped verification, but the dialog only marks local component state and its “Continue Step A” button calls the whole chain from A.1 again.
- `save_api_keys` also pushes the company profile internally, while the orchestrator separately owns A.4. This hides two stages in one call and makes task state misleading.
- The preview still returns/renders the retired automatic fallback login, and the old “Sub-account credentials” password card remains below the required manual key-pair card.

## Changes

1. **A.0/A.1: one roster read, one create**
   - Keep the roster read performed when the account preview/run resolves the selected property.
   - On successful `Push_CreateUser_RQ`, persist the created login and encrypted password immediately with a pending OwnerID.
   - Do not call `Pull_ListMyUsers_RQ` after create and do not wait/retry inside the request. Return the successful A.1 result and pause at A.2.
   - Existing roster matches remain adoption paths and never call create.

2. **A.2/A.3: save, verify, then resume forward**
   - When the operator submits AccessKey/SecretKey, resolve the pending OwnerID once from the roster if necessary, then perform the existing single owner-scoped key verification.
   - Persist the verified pair and binding in that call.
   - Have the dialog notify the parent of successful verification; resume Step A at `company_profile`, never `owner_account` or `api_keys`.
   - Preserve completed A.1–A.3 task results in the ledger/UI while A.4–A.5 run.

3. **A.4/A.5 stay separate**
   - Remove the hidden company-profile push from `save_api_keys`.
   - Let the orchestrator run exactly one company-profile push, followed by exactly one listing pull.
   - Keep all live-notification work out of Step A.

4. **Remove obsolete artifacts**
   - Stop returning and rendering `fallback_login` for submitted emails.
   - Delete the “If this login is already taken…” message.
   - Delete the entire “Sub-account credentials” password card and its automatic-key-mint state/actions.
   - Update key-entry copy so successful save/verification automatically continues from A.4; remove the generic button that restarts Step A.

## Expected call sequence

```text
A.0  Pull_ListMyUsers_RQ             once, when resolving selected property
A.1  Push_CreateUser_RQ              only if no existing account is adopted
A.2  no channel call                 operator enters AccessKey/SecretKey
A.3  Pull_ListMyUsers_RQ             once only if the new OwnerID is still pending
     Pull_ListOwnerProp_RQ           once to verify the supplied pair
A.4  Push_FillCompanyDetails_RQ      once
A.5  Pull_ListOwnerProp_RQ           once to adopt listings
END  wait for Step B
```

## Verification

- Run a new-account path and confirm no roster call occurs after create until keys are submitted.
- Confirm key submission never replays account creation and the task trail remains passed through A.3.
- Confirm an existing roster account is adopted and pauses directly for keys without `Push_CreateUser_RQ`.
- Confirm the preview has no fallback-login note or password card.
- Confirm Step A ends after one company push and one listing pull, with no notification calls and no rate-limit retry loop.
