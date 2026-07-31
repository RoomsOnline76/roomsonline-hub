## Correct Rentals United Phase 1 authentication

### Confirmed
- RU enabled `Push_CreateUser_RQ` privileges for the RoomsOnline parent account; no further enablement request should be shown.
- The saved-password encryption/decryption and payload handoff are internally consistent.
- The regression is the current assumption that the child portal email/password must authenticate directly on every XML method. That assumption replaced the previously working parent-account/child-scoped flow.
- RU’s White Label guide explicitly defines the parent account as managing child accounts and directs the PMS to create each child, list it, then submit company details for that created child.

### Implementation
1. **Re-check the exact RU method schema**
   - Use the authoritative `Push_FillCompanyDetails_RQ` and User Management request definitions—not inferred behavior from unrelated endpoints.
   - Identify the documented child selector returned by `Push_CreateUser_RQ` / `Pull_ListMyUsers_RQ` (`UserAccountId`, `OwnerID`, or the method-specific field) and use that exact field.

2. **Restore the documented parent-managed child flow**
   - Update the locked `fill_company_details` builder/handler to authenticate with the configured parent API credentials and target the linked child using the documented selector.
   - Do not use the child portal password as an API access key unless the method documentation explicitly requires it.
   - Keep the hard rule that a missing or ambiguous linked child ID fails; never default to the master identity.

3. **Correct verification semantics**
   - Replace `verify_child_login` as the Phase 1 authority with verification that the parent account can list and uniquely resolve the linked child.
   - Treat the saved password as a retained portal credential, not proof of XML API authorization.
   - Remove the incorrect “ask RU to enable child API login” guidance and stop changing company status to `credentials_failed` from an unrelated child-login probe.

4. **Prove the write landed on the correct child**
   - Re-submit Jongensfontein company details for OwnerID `741761` through the corrected flow.
   - Read back/list the child through the parent User Management API and verify the child identity and company completion evidence before marking Phase 1 complete.
   - Do not accept an HTTP/API success alone, and do not mark the master profile as evidence.

5. **Protect the corrected contract**
   - Update the RU adapter-lock wording to match the documented parent-managed child targeting method, replacing the incorrect blanket child-login rule.
   - Add regression coverage for correct child targeting, missing selector, ambiguous child identity, and accidental master targeting.

### Locked scope
This requires the explicitly requested changes to the locked `fill_company_details` authentication builder/handler in `rentalsunited-api`, its Phase 1 orchestration in `ru-cert-portal`, and the corresponding RU adapter-lock documentation. No reservation or booking adapter logic will be changed.