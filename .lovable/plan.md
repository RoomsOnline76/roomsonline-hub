

## Plan: Step 15 — Error Handling & Edge Cases

### Context
Step 14 (Owner Workspace) appears to have been skipped/jumped — user is moving to Step 15. Prior milestones confirmed orchestrator (Step 12), cron (Step 13), RLNM handler (Step 9), polling (Steps 10-11) all functional. Step 15 is a defensive verification pass: confirm every error path returns gracefully, logs to `sync_logs`, never crashes the handler, and RLNM webhook always returns HTTP 200 to RU (mandatory per RU spec — non-200 triggers exponential retry storms).

Per project policy: **rate limiting will NOT be added to backend code**. 15.8 will be a pure observation test (rapid sequential calls, verify no crashes / no shared-state corruption) rather than implementing throttling.

### Test matrix

| # | Scenario | Method | Expected |
|---|----------|--------|----------|
| 15.1 | Invalid property ID | Invoke `push-property-to-ru` with bogus UUID `00000000-0000-0000-0000-000000000000` | `{success: false, error: "Property not found"}`, HTTP 4xx, sync_logs row written |
| 15.2 | Missing property ID | Invoke `push-property-to-ru` with empty body / no `property_id` | `{success: false, error: "property_id required"}`, HTTP 400 |
| 15.3 | Property with <10 images | Re-test Tidal Pools (0 images) per-unit failure path | Per-unit `success: false, error: "Needs ≥10 images"`; orchestrator returns `success: true, partial: true` |
| 15.4 | Unknown action | Invoke `rentalsunited-api` with `action: "nonexistent_action"` | `{success: false, error: "Unknown action"}`, HTTP 400 |
| 15.5 | Set property status | Invoke `rentalsunited-api` with `action: "set_property_status"` for ALBATROS (toggle active/inactive) | Returns RU response; XML logged |
| 15.6 | Location resolution | Invoke push for property with sparse/ambiguous address | Location resolver falls back to default city or returns clear error; no crash |
| 15.7 | RLNM malformed/empty | POST to `ru-reservation-handler` with: (a) empty body, (b) malformed XML, (c) valid envelope but unknown event type | All return **HTTP 200**; errors logged to `ru_notifications` with `processing_status='error'` |
| 15.8 | Rapid successive calls | Fire 5 parallel invocations of `push-property-to-ru` for ALBATROS | All complete without crash; no DB constraint violations; logs intact (no rate-limiting added — observation only) |

### Implementation steps

1. **Read current error paths**:
   - `push-property-to-ru/index.ts` — confirm property-lookup error handling, `property_id` validation, partial-failure return shape.
   - `rentalsunited-api/index.ts` — confirm unknown-action default branch + `set_property_status` action exists.
   - `ru-reservation-handler/index.ts` — confirm always returns 200, has try/catch around XML parse, logs errors to `ru_notifications`.
2. **Patch only if gaps found**:
   - If unknown-action doesn't return JSON error → add default branch.
   - If RLNM handler can throw before reaching `return new Response(200)` → wrap in outer try/catch that always returns 200.
   - If `property_id` missing isn't caught early → add Zod validation at entry.
3. **Run test suite** via `supabase--curl_edge_functions`:
   - 15.1, 15.2, 15.4: direct invocations, capture status + body.
   - 15.3: re-run Tidal Pools push, confirm partial-failure shape unchanged.
   - 15.5: invoke `set_property_status` for ALBATROS (non-destructive — current status preserved or toggled & restored).
   - 15.6: identify a property with minimal address data; invoke push, observe location phase.
   - 15.7: 3 separate POSTs to RLNM handler (empty / malformed / unknown event); assert all return 200.
   - 15.8: fire 5 parallel pushes via `Promise.all`-style invocation; verify no crashes, no duplicate `pms_mappings` rows.
4. **DB verification** — query `sync_logs` and `ru_notifications` for new rows from each test; confirm error context captured.
5. **Persist evidence** — single consolidated `sync_logs` row (`sync_type='error_handling_step_15'`) with all 8 sub-results.

### Files potentially modified
- `supabase/functions/push-property-to-ru/index.ts` — only if entry-validation or partial-failure path needs hardening.
- `supabase/functions/rentalsunited-api/index.ts` — only if unknown-action branch is missing JSON error.
- `supabase/functions/ru-reservation-handler/index.ts` — only if HTTP 200 isn't guaranteed under all failure modes.

### Pass criteria
- All 8 scenarios handled gracefully (no 5xx crashes from our code; RU upstream errors are acceptable as long as we log + respond cleanly).
- RLNM handler returns HTTP 200 in 100% of test cases.
- Every error path writes to `sync_logs` or `ru_notifications` with diagnostic context.
- No DB constraint violations or duplicate rows from 15.8 parallel test.

### Assumptions
- **No rate limiting will be implemented** — backend lacks proper primitives (per project policy). 15.8 verifies graceful concurrent behavior only.
- "Set property status" uses RU's `Push_PutPropertyStatus_RQ`; if action is missing from adapter, will add as a small read-only XML builder.
- Location resolution failures are non-fatal — orchestrator should skip the location phase and proceed with defaults rather than abort.
- ALBATROS Status 24 ("not the owner") on ARI remains a documented external blocker, not a Step 15 failure.

