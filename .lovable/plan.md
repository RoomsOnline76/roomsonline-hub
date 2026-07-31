## Confirmed diagnosis

The binding and stored record are correct: the portfolio account is bound to **OwnerID 741761 / rooms@roomsonline.co.za**, the encrypted password was updated immediately before the test, and Phase 1 sent that decrypted value to Rentals United using both the email and OwnerID identities. Rentals United returned **`-4 Incorrect login or password`** for both. This is no longer an account-selection or stale-password lookup bug.

## Implementation plan

1. **Validate credentials when saving them**
   - Change the RU account password action from “save only” to “verify, then save.”
   - Normalize accidental leading/trailing whitespace from copied credentials.
   - Test the selected OwnerID/email and password against Rentals United before replacing the encrypted value.
   - If Rentals United rejects it, leave the prior encrypted password untouched and show that the password was **not saved as verified**.

2. **Use one canonical child identity for Phase 1**
   - Persist the identity Rentals United accepts during verification.
   - Make `Push_FillCompanyDetails_RQ` use that verified identity first instead of repeatedly trying unrelated identities and the master access-key envelope.
   - Keep OwnerID as the binding key; do not infer identity from the portfolio owner email.

3. **Correct error handling and UI state**
   - Replace the current misleading “password we hold is the one RU accepted at creation” message for manually reset/adopted accounts.
   - Show separate states: **stored**, **verified by RU**, and **rejected by RU**.
   - Prevent “Save password” from reporting success when only local encryption succeeded.

4. **Verify end to end**
   - Deploy the updated RU functions.
   - Run the non-destructive credential verification for OwnerID 741761.
   - Re-run Phase 1 company details once, confirm RU success, and verify `company_details_status`, `company_details_sent`, and the Phase 1 button all update together.

If the newly entered value is still rejected during the new verification step, the app will now prove immediately that Rentals United has not applied that password to child account 741761, rather than falsely accepting it locally.