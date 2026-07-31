## Confirmed diagnosis

- The current database record is bound to **OwnerID 741761** with `rooms@roomsonline.co.za`, has an encrypted password, and is marked `auth_failed`.
- **Reset password** does not reset anything in Rentals United. It first runs the same failing API verification and only saves locally if that probe succeeds.
- Both **Verify stored** and **Verify & save** test portal credentials by sending `<UserName>/<Password>` in `Pull_ListOwnerProp_RQ`. A successful browser portal login does not prove that this XML API endpoint accepts portal credentials in that authentication envelope.
- Phase 1 repeats the same assumption for `Push_FillCompanyDetails_RQ`, then misleadingly reports a correct portal password as incorrect.
- The UI also collapses the function’s structured 422 response into “non-2xx,” hiding the useful RU status.

## Implementation plan

1. **Fix verification before saving**
   - Change the verification probe to test the RU-supported parent/child API authentication shapes explicitly, beginning with the configured master API credentials scoped to the bound OwnerID.
   - Keep portal username/password verification separate and only label it verified if RU’s XML API genuinely accepts that envelope.
   - Never overwrite or discard the encrypted password when an API envelope is unsupported.

2. **Correct Phase 1 company-details authentication**
   - Update `Push_FillCompanyDetails_RQ` to use the authentication/scoping shape proven by the verification probe.
   - Pass the bound OwnerID explicitly where supported instead of treating the portal email as an API key.
   - Remove misleading retries with email, numeric OwnerID, and child credentials in incompatible XML fields.

3. **Make reset/save behavior accurate**
   - Rename the action in the UI to reflect that it stores a password reset in the RU portal rather than changing the RU password itself.
   - Save the encrypted portal password independently from API capability, while recording separate states for portal credentials stored and API access verified.
   - Preserve the existing binding and stored password during reconciliation failures.

4. **Expose the real failure**
   - Use the existing structured function-error extractor for Verify and Save so the UI shows the RU status/code instead of “non-2xx.”
   - Add sanitized diagnostics for the attempted auth style, bound OwnerID, RU status ID, and operation—never the password.

5. **Deploy and verify in order**
   - Deploy `rentalsunited-api` first, then `ru-cert-portal`.
   - Test the non-destructive credential/API probe for the bound account.
   - Save the portal password, re-run Phase 1 company details, and confirm `company_details_sent`, `company_details_status`, and the Phase 1 UI advance together.

No locked reservation/availability adapter is involved; changes are limited to RU account onboarding/authentication and its admin UI.