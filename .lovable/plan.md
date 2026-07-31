## Rentals United white-label correction

### Confirmed problems
- **Phase 3 is marked complete from stored RU IDs alone**, before a successful inventory push.
- **Phase 4 is marked complete from any recent `ru_sync_runs.success=true` row**, not from verified property, availability, and price read-back.
- `Push_FillCompanyDetails_RQ` first tries the linked sub-user but then **falls back to the master account**. That fallback can report success while leaving the linked sub-user’s company profile blank.
- Property pushes use the linked OwnerID, but the low-level adapter still has a dangerous **`OwnerID || 1` master fallback**.
- Building creation currently authenticates with the master credentials and has no OwnerID scope, so the building can be created under the master account even when its units carry the child OwnerID.
- Existing stored property/building IDs may therefore reference master-owned objects and cannot be trusted without owner-scoped verification.

## Implementation

1. **Enforce strict child-account isolation**
   - Remove the parent/master fallback from company-details submission.
   - Require the linked sub-user username and securely stored password for `Push_FillCompanyDetails_RQ`; fail clearly if either is unavailable.
   - Remove the `OwnerID || 1` fallback from property XML and reject every property push without a positive linked OwnerID.
   - Remove the force/master OwnerID escape hatch for white-label property pushes so no UI, cron, or direct adapter call can silently write inventory to the master account.

2. **Make building creation sub-user scoped**
   - Add linked-account authentication support to the RU building create/update/list calls, because those requests do not carry an OwnerID.
   - Resolve credentials from the same `ru_owner_accounts` record selected by the portfolio/property phase gate.
   - Hard-fail if the linked account cannot authenticate; never retry a building request with master credentials.
   - Keep property content scoped with the explicit linked OwnerID and ARI scoped through the resulting child-owned PropertyIDs.

3. **Repair and verify existing RU identity mappings**
   - Before reusing a stored PropertyID or BuildingID, verify it is visible to the linked sub-user/OwnerID.
   - If an ID belongs to the master account or is not visible to the linked sub-user, invalidate the local mapping and recreate the object under the linked account.
   - Do not consider a master-owned object a valid recovery candidate based only on a matching name.

4. **Correct Phase 3 semantics**
   - Keep Phase 3 pending until the current linked sub-user has a successful property/building push plus successful availability and price pushes for every required unit.
   - Treat skipped ARI, missing RU IDs, partial unit failures, availability errors, or price errors as failure—not success.
   - Record each manual push in `ru_sync_runs` with linked OwnerID, account scope, per-unit results, and explicit content/availability/pricing outcomes.

5. **Correct Phase 4 semantics**
   - Require owner-scoped read-back verification that the pushed properties exist under the linked OwnerID and that availability/prices can be read back successfully.
   - Stop using an unrelated or inflated recent sync row as proof of Phase 4 completion.
   - Only enable **Order quality check** after this linked-account verification succeeds.

6. **Improve recovery feedback**
   - Return explicit errors such as `RU_CHILD_AUTH_REQUIRED`, `RU_OWNER_SCOPE_MISMATCH`, and `RU_VERIFICATION_FAILED` instead of a generic successful push.
   - Show the linked OwnerID and verification result in the onboarding pipeline, without exposing credentials.

7. **Validate the full flow against the affected portfolio**
   - Re-send company details and confirm they appear on the linked RU sub-user profile.
   - Re-push the property and units, confirm they are listed under that sub-user rather than the master account, and verify availability/prices by read-back.
   - Confirm P3 remains pending before the push and P4 remains pending until verification completes.
   - Add regression coverage for missing OwnerID, child-auth failure, master-owned stale IDs, partial ARI failures, and false P3/P4 completion.

## Scope and safety
- Update `rentalsunited-api`, `ru-cert-portal`, `push-property-to-ru`, the shared RU phase gate, and the onboarding status UI.
- Do not modify the locked `ru-reservation-handler` or booking-orchestrator regions.
- Add the critical RU OwnerID/authentication regions to the adapter lock list after the correction to prevent future master-account fallback regressions.