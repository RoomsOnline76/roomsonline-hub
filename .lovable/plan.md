

## Plan: Execute RU Sub-Account Management Test Suite (Milestone 2)

Run the 5-step sub-account test sequence against the live `rentalsunited-api` edge function, capture pass/fail per criterion, and produce a markdown test report artifact.

### Test sequence

Each step uses `curl_edge_functions` against `/rentalsunited-api`. Results are validated against the documented pass criteria, and a unique timestamp-suffixed email avoids collisions with prior test runs.

| Step | Action | What we verify |
|------|--------|----------------|
| 2.1 | `create_user` with fresh `test-owner-{ts}@example.com` | `success=true`, numeric `user_account_id` captured as `$USER_ACCOUNT_ID` |
| 2.2 | `list_users` | New user appears in list; capture `owner_id` as `$OWNER_ID` |
| 2.3 | `fill_company_details` with `ru_property_id=$USER_ACCOUNT_ID` | `success=true`, no RU error |
| 2.4 | `create_user` again with same email | Document RU's actual idempotency behaviour (error vs same ID returned); ensure no 500 |
| 2.5 | `create_user` with empty `last_name`/`email`/`password` | Local rejection with `error.code = "VALIDATION"` (no RU round-trip) |

### Deliverable

A markdown report written to `/mnt/documents/ru-subaccount-test-results.md` containing, for each step:
- Request payload sent
- Raw edge function response (truncated to first 1KB if XML is huge)
- Pass/fail checkbox per criterion from the test spec
- Captured IDs (`$USER_ACCOUNT_ID`, `$OWNER_ID`) for downstream milestones
- Final milestone verdict (PASS / PARTIAL / FAIL) with rationale

### Failure handling

- If 2.1 fails → halt and report; 2.2/2.3/2.4 depend on it.
- If 2.2 succeeds but `owner_id` is missing → flag as PARTIAL and inspect raw XML to determine whether RU's `Pull_ListMyUsers_RS` shape includes `OwnerID` under a different tag.
- If 2.4 returns 500 → mark FAIL and capture full response for debugging `extractUserAccountId` / `handleRUStatus`.
- If 2.5 hits RU instead of failing locally → flag as code bug (validation order issue at line 1535).

### Out of scope
- No edge function code changes unless a bug is discovered during 2.5 validation.
- No DB writes — sub-account IDs returned by RU are reported but not persisted to any owner record yet (that's a later milestone).
- No cleanup of created RU sub-accounts (RU has no delete-user API; test emails are timestamped to avoid pollution).

