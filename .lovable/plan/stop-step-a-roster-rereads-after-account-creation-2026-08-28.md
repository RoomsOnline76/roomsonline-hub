# Stop Step A roster rereads after account creation

## Verified cause

The live traffic for the new account shows this exact sequence:

```text
19:39:22  Pull_ListMyUsers_RQ          roster:step-a              success
19:39:24  Push_CreateUser_RQ                                        success; UserAccountId 742620
19:39:24  Pull_ListMyUsers_RQ          roster:step-a-create-readback throttled
19:39:48  Pull_ListMyUsers_RQ          roster:step-a-create-readback throttled
19:40:23  Pull_ListMyUsers_RQ          roster:step-a-create-readback success
19:40:23  Pull_ListMyUsers_RQ          roster:step-a              throttled
19:41:23  Pull_ListMyUsers_RQ          roster:step-a              success
```

The database now has the account bound to OwnerID `742620`, and the roster cache includes that owner. The create response itself returned `<UserAccountId>742620</UserAccountId>`.

The running backend is not aligned with the current repository: `roster:step-a-create-readback` does not exist in the current Step A source, but the deployed function is still executing its old paced read-back loop. The subsequent `roster:step-a` calls are the old run being parked and automatically resumed after those deferrals.

## Fix

1. **Use the successful create response immediately.** In the channel API wrapper, retain the parsed positive `UserAccountId` from `Push_CreateUser_RS`. In Step A, persist that value as the new account's OwnerID and bind the account immediately. Do not call the roster after create.

2. **Keep the one required A.0 roster read only.** Account selection/adoption may perform one `roster:step-a` read before creation. Every later A.1 branch must reuse that in-run result; no `forceFresh`, polling loop, timer, or create read-back is allowed.

3. **Support the response-without-ID edge case without polling.** If a future create response omits `UserAccountId`, save the account as pending and pause at A.2. Resolve its OwnerID once when the operator submits the key pair, then perform the existing owner-scoped key verification. Never poll between A.1 and A.2.

4. **Prevent Step A from replaying because of a roster deferral.** A roster deferral during A.0 must return a single parked result based on the shared cache/backoff state; it must not schedule repeated `owner_account` runs. Once create succeeds, A.1 is terminal and cannot be replayed by the generic auto-resume timer.

5. **Preserve forward-only continuation.** After key save/verification, resume at `company_profile`, then `adopt_listings`. Keep `owner_account`, `api_keys`, and `verify_keys` as passed in the ledger; do not run them again.

6. **Deploy the corrected functions.** Redeploy `rentalsunited-api` and `ru-cert-portal` together so the live runtime matches the source. No changes to locked listing, inventory, reservation, or child-authentication regions.

## Verification

- Add focused tests for create responses with and without `UserAccountId`, and for the forward-only A.2 continuation.
- Run Step A against one fresh test account and inspect live traffic.
- Acceptance sequence:

```text
Pull_ListMyUsers_RQ   exactly once before create
Push_CreateUser_RQ   exactly once
(no roster read after create)
(wait for manual AccessKey/SecretKey)
verify key pair      exactly once
company profile      exactly once
pull listings        exactly once
```

- Confirm there are zero `roster:step-a-create-readback` entries, zero `RU_RATE_DEFERRED` roster entries, and no automatic replay of `ensure_owner_account` after create.
