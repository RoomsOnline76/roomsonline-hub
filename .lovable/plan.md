# Restore the verified RU white-label key-mint flow

## Confirmed diagnosis

The current Step A implementation is wrong for this white-label master account:

- `mintChildKeyPair` now sends only the sub-account username/password (or an already-existing child key), so a new account can never reach the working white-label mint path.
- The live history shows those child-password requests repeatedly return RU status `-4`.
- The same history proves the previous master-authenticated request with the target child `<OwnerID>` succeeded for OwnerIDs 742555, 742566, 742568, 742569, 742570, 742572, 742573, and 742574.
- The adapter still supports `owner_scoped_mint`, but no caller sends it. The regression is the removal of that variant, not missing white-label enablement.
- Leopard OwnerID 742612 is therefore being given a false `RU_KEY_CREATION_NOT_ENABLED` diagnosis.

## Changes

1. **Restore the white-label owner-scoped mint as the primary Step A.2 path**
   - Send `Push_CreateApiKey_RQ` using the master AccessKey/SecretKey plus the selected child `OwnerID`.
   - Preserve RU’s required XML order: `Authentication → OwnerID → Label → Scope`.
   - Use one deterministic request, respecting the one-minute RU method limit; do not fire child-password retries first.

2. **Verify before storing or using the returned pair**
   - Immediately test the returned pair against the selected OwnerID.
   - Reject and discard it if it can enumerate the master roster, resolves to another OwnerID, or cannot read the selected child account.
   - Store it only when it is proven usable for the selected child account; keep inventory writes blocked until that proof succeeds.

3. **Correct Step A outcomes**
   - Stop translating child-login `-4` into “API key creation not enabled” for this white-label flow.
   - Report separate outcomes for master key-limit status `387`, RU throttling, owner mismatch, master-pair detection, and verification failure.
   - Keep the full attempt trail visible in Step A and the traffic monitor.

4. **Apply the same path everywhere keys are generated**
   - Route Step A, “Generate key” in Master Account Roster, recovery, and close-account preparation through the same verified owner-scoped mint helper.
   - Remove competing child-password-first behavior so different screens cannot regress independently.

5. **Regression coverage and live verification with Leopard**
   - Add tests asserting the exact owner-scoped XML and that no child-password request precedes it.
   - Run Step A for Leopard / OwnerID 742612.
   - Confirm one successful mint, child-owner verification, encrypted storage against 742612, completion of A.2/A.3, and no property/ARI write under the master footprint.

## Technical scope

- `supabase/functions/ru-cert-portal/index.ts`: restore and centralize the owner-scoped variant in `mintChildKeyPair`; correct result classification and all callers.
- `supabase/functions/rentalsunited-api/index.ts`: retain the existing gated `owner_scoped_mint` handler and tighten verification/error reporting if required.
- `supabase/functions/_shared/ruApiKeyXml.ts` and focused tests: protect `Authentication → OwnerID → Label → Scope` ordering.
- Update the project’s Step A key-mint rule so future work does not remove the confirmed white-label flow again.

Approval explicitly permits the narrowly scoped RU adapter-lock changes above. It does not permit master-authenticated property, content, rate, or availability writes.
