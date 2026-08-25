# Step A / Step B call sequence clean-up

Reviewed every wire call the onboarding steps make. The buildings read you saw is real, and it is not the only call that either runs too early or asks the channel something we already know.

## What is actually wrong

**1. The password check probes the buildings list (the failure in your screenshot).**
`verify_login_password` in the cert portal calls `verify_child_login` with the login email and
password. With no key pair stored, that path builds `Pull_ListBuildings_RQ` — an account-level read
with no OwnerID, and the single most rate-limited method we call. Since the channel's API-keys
rollout, password-only envelopes are refused there, so this probe returns "Incorrect login or
password" whether or not the password is right. That refusal then gets shown as a credential error
and the key mint that follows fails for the same reason.

Fix: stop probing before a key pair exists. Saving a password stores it and no longer touches the
wire. `Push_CreateApiKey_RQ` becomes the only password verdict — it is the call that must
authenticate as the sub-user anyway. Its refusal maps to the existing password remedy card, so the
operator is still told exactly what to fix, with one call instead of two doomed ones.

**2. Keys are verified twice.**
`mintChildKeyPair` stores the pair with `verified_at` already stamped — the mint itself proves it.
The `verify_keys` task then runs `verify_api_keys`, which spends another owner-scoped read on the
same question. Same for a pasted pair: `save_api_keys` already runs `verify_child_key_owner`.

Fix: `verify_keys` reports the mint/save verdict when the pair was proven in this run or was verified
recently, and only goes to the wire when the stored stamp is missing or stale.

**3. The company profile can be pushed twice.**
Key provisioning already calls `provisionCompanyAfterKeyVerification()`, which sends
`Push_FillCompanyDetails_RQ`. The `company_profile` task can then send it again in the same run
because it only reads the pre-run snapshot flag.

Fix: carry the "company sent" result from the account/keys tasks into the run context and skip the
task when it already fired this run.

**4. The listings roster is read three times per run.**
`adopt_listings` (Step A) runs `resolve_ru_property_ids`; `review_listings` reads the published state
again through `plan_push_scope`; `verify_listings` (Step B) runs `resolve_ru_property_ids` a third
time. All three read the same owner-scoped listing roster.

Fix: cache the roster on the run context with a short TTL. `review_listings` reuses the Step A read,
and `verify_listings` reuses the IDs the push itself returned per unit, going to the wire only when
the push did not confirm every unit.

**5. Ordering guard.**
Add a single precondition helper so no task that needs child authentication runs before a usable key
pair exists. Today the ordering is implicit; when a task is retried out of order it can fire
child-auth calls with nothing to authenticate with.

## Not changed

- `verify_currency` stays. It reads the live listing's location/currency, which the push does not
  return, and it is the gate that catches a wrong published currency.
- `entitlement` stays as the final activation.
- Rate-limit deferral behaviour, remedy cards and the countdown UI are untouched.

## Technical notes

- `supabase/functions/ru-cert-portal/index.ts` — `verify_login_password` becomes store-and-report
  (no `verify_child_login` invoke); return `password_stored: true` with `api_access_verified: null`.
  Map `Push_CreateApiKey_RQ` auth refusals to code `RU_CREATE_KEY_BAD_LOGIN` so the dialog opens the
  password field. `verify_api_keys` short-circuits on a fresh `verified_at`.
- `supabase/functions/rentalsunited-api/index.ts` — `verify_child_login` refuses password-mode
  probes with `RU_PASSWORD_PROBE_UNSUPPORTED` instead of falling back to `Pull_ListBuildings_RQ`;
  keys mode keeps the owner-scoped `Pull_ListOwnerProp_RQ` probe.
- `src/lib/channelOnboardOrchestrator.ts` — add `ctx.listingRoster`, `ctx.companyPushed` and a
  `requiresChildAuth` precondition; rewire `verify_keys`, `company_profile`, `review_listings`,
  `verify_listings` per above.
- `src/components/admin/channel-monitor/StepAccountDialog.tsx` — relabel the password action to
  "Save password" and surface the mint result as the verification outcome.
- `src/config/channelStepARemedies.ts` — add the new codes.
- Then deploy `ru-cert-portal` and `rentalsunited-api` and confirm a run logs one
  `Push_CreateApiKey_RQ`, no `Pull_ListBuildings_RQ`, and a single roster read.
