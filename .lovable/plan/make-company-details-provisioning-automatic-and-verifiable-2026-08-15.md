# Make company-details provisioning automatic and verifiable

## Confirmed issue

For the active distribution account, the database still records `company_details_status = credentials_verified`, even though the UI reported that company details were sent. The current flow has three defects:

- The backend skips the real company push when the legacy `company_details_sent` flag is true, even if the strict status is not `sent`/`already_set`.
- Key save/verification returns before company provisioning; the browser then starts a separate best-effort call and reduces failures to a warning.
- The button shows success from the wrapper's general `success` value rather than requiring confirmed company-push evidence.

## Implementation

1. **Make key verification and company provisioning one backend workflow**
   - After a key pair is validated, persist it and immediately call `Push_FillCompanyDetails_RQ` with that same sub-account key pair.
   - Apply the same workflow when stored keys are re-verified or updated.
   - Return key verification as successful but company provisioning as incomplete if RU rejects or cannot confirm the company push; include the real RU error for the UI.

2. **Remove the false skip condition**
   - Replace the legacy boolean shortcut with the strict company-details rule: only `sent`/`already_set`, recorded at or after the latest key verification, may skip a push.
   - Never set `company_details_sent`, `company_filled_at`, or a sent status from key verification alone.

3. **Require positive confirmation before showing “Sent”**
   - Treat RU's successful response status as the minimum confirmation and persist its status/timestamp only after that response.
   - Check the RU API specification for a supported company-profile read-back. If available, pull immediately after the push and compare the sub-account identity/profile before marking it confirmed. If RU exposes no read-back endpoint, display “Accepted by Channel Manager” with the response timestamp rather than claiming portal verification.

4. **Keep the UI synchronized**
   - Make Save/Update keys show one combined progress state: validating keys, sending company details, then confirmed or actionable failure.
   - Reload the identity and invalidate onboarding queries only after the combined backend operation finishes.
   - Keep “Send company details” as an explicit retry, but require `company_details_pushed: true` before its success toast and status update.

5. **Repair and verify the current account**
   - Re-run company provisioning for the currently verified owner account after deployment; do not fabricate a sent record.
   - Verify the database status/timestamp, the Step 7 checklist, and the distribution-account panel agree.
   - Test both paths: saving replacement keys automatically provisions company details, and manually retrying refreshes the status without a page reload.

## Technical scope

- Update the onboarding edge workflow, strict company-status helper, owner-account panel, and onboarding query invalidation.
- Add focused tests for stale legacy flags, successful RU acceptance, RU rejection, key replacement, and retry behavior.
- Preserve child-account isolation: company details must authenticate with the selected sub-account's own keys, never master credentials.