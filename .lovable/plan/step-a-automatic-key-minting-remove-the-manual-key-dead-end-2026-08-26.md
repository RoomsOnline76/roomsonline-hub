# Step A automatic key minting: remove the manual-key dead end

## Verified current state

- The DEMO/PufferFish distribution account is bound to OwnerID `742536` and `newjulius@polka.co.za` with a stored password, but no stored API key pair.
- The latest backend traffic shows `Push_CreateApiKey_RQ` is being sent with a username/password authentication envelope, and the channel returns Status `-4` / `Incorrect login or password`.
- The adapter lock notes this exact channel behaviour: portal login can work while the XML API surface rejects the same child login until API access is enabled for that sub-account.
- Some current messages still imply a manual first-key process or password reset, which is misleading for accounts created by Step A.

## What will change

1. **Stop showing “generate the first pair manually” anywhere in Step A.**
   - Replace backend and UI copy that says to generate keys in the channel dashboard.
   - Replace “reset the password” guidance when a stored/generated password is already present.

2. **Keep Step A automatic and honest.**
   - When Step A has a stored password and the XML API rejects `Push_CreateApiKey_RQ`, show an amber blocked state:
     - password retained
     - OwnerID/login shown
     - API key creation is waiting on channel-side XML API enablement for that sub-account
     - retry action stays available

3. **Use a specific failure code for this case.**
   - Preserve the channel status details from the key-mint response.
   - Map `RU_CREATE_KEY_API_REJECTED` to a clear Step A remedy instead of collapsing it into generic `RU_CREATE_KEY_FAILED` or `NO_STORED_PASSWORD`.

4. **Keep the credentials card useful.**
   - If no password is stored, ask for the portal password so Step A can attempt automatic minting.
   - If a password is already stored and the XML API rejects it, do not ask for the same password again unless the operator chooses to replace it.

5. **Verify against the affected property.**
   - Re-run the Step A preview/check for PufferFish.
   - Confirm the UI no longer instructs manual key generation.
   - Confirm the backend response retains OwnerID/login/status detail and classifies the stop as recoverable, not failed.

## Technical notes

- Update `src/config/channelStepARemedies.ts` copy and add/handle `RU_CREATE_KEY_API_REJECTED` explicitly.
- Update `src/lib/channelOnboardOrchestrator.ts` so `api_keys` reports the specific blocked reason from key provisioning instead of defaulting to `NO_STORED_PASSWORD` when a stored password exists.
- Update `src/components/admin/channel-monitor/StepAccountDialog.tsx` so the credential section distinguishes “password missing” from “password stored but XML API refused key creation”.
- Update non-locked `ru-cert-portal` response mapping if needed so the client receives the specific code and status detail.
- Avoid changing locked `rentalsunited-api` child-authentication code unless you explicitly approve that adapter-lock scope.
