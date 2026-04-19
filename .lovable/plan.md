

Let me explore the orchestrator and related code to design Step 12.

I need to understand:
1. `push-property-to-ru` orchestrator structure
2. How RLNM subscription is wired in
3. pms_mappings / cache table writes
4. Image handling caps
5. Available test properties (single vs multi-unit RU-connected)

Key context from prior steps:
- ALBATROS (RU PropID 4707563) — known single property used in Steps 5-11
- RU returns Status 24 "not the owner" for ARI pushes (push still executes & logs XML — that's the evidence we need)
- RLNM subscription action exists from Step 9 (`subscribe_notifications`)
- `cron-push-all-properties-to-ru` already calls subscribe + push loop

Step 12 is largely a verification pass — most code exists. I'll outline what needs adding (partial failure tracking, large image guard if missing, data authority assertions) and what's pure test invocation.

## Plan: Step 12 — Full Orchestration Verification

### Context
- `push-property-to-ru` orchestrates: location resolve → property metadata → composition rooms → images → amenities → ARI (avail/min_stay/changeover) → prices → discounts → RLNM ping.
- Steps 5-11 verified individual ARI/RLNM/poll endpoints. Step 12 = end-to-end orchestration pass for both single- and multi-unit shapes plus edge cases.
- Need a multi-unit RU-connected property to test 12.2; will query `properties` for any with `rentalsunited_property_id IS NOT NULL` and multi-unit shape (room_types > 1).

### Test matrix

| # | Scenario | Target | Expected |
|---|----------|--------|----------|
| 12.1 | Single-unit full push | ALBATROS | All phases execute; structured summary `{location, property, rooms, images, amenities, ari, prices, discounts, rlnm}` per phase; XML logged to `sync_logs` |
| 12.2 | Multi-unit full push | Pick first multi-unit RU property (or skip with note) | Composition rooms loop runs; per-unit ARI/prices logged; summary includes `units_pushed: N` |
| 12.3 | Idempotent re-push | ALBATROS, second invocation | Same RU PropertyID returned; no duplicate `pms_mappings` rows; cache rows updated (not inserted) |
| 12.4 | Push with RLNM | ALBATROS + `?subscribe_rlnm=true` | Push completes + RLNM `subscribe_notifications` called; both logged |
| 12.5 | Partial failure | Inject one bad room (e.g. missing required field) | Orchestrator continues, marks failed unit in summary, overall `success: true, partial: true` |
| 12.6 | Large image set | Property with 60+ images | All images submitted in batches; no truncation; image count in response matches DB |
| 12.7 | Data authority | Post-push DB inspection | `pms_mappings` has rentalsunited rows; `pms_availability_cache` populated; ALL JSON keys in `sync_logs.response_data` are snake_case |

### Implementation steps

1. **Read orchestrator** (`push-property-to-ru/index.ts`) — confirm current phase summary shape, partial-failure handling, image batching, RLNM hook.
2. **Patch if needed**:
   - If summary doesn't have `partial` flag or per-phase status → add structured per-phase result accumulator.
   - If image batching missing for >50 images → add chunked submission.
   - If no `?subscribe_rlnm=true` flag → add optional behavior.
3. **Identify test fixtures** — query DB for: (a) ALBATROS, (b) any RU-connected multi-unit property, (c) any RU property with 60+ images. If (b)/(c) don't exist, document as N/A with rationale.
4. **Run test suite**:
   - 12.1: invoke push for ALBATROS, capture summary + sync_logs row.
   - 12.2: invoke for multi-unit (or skip with documented reason).
   - 12.3: invoke ALBATROS twice in sequence, diff `pms_mappings` row count.
   - 12.4: invoke with `subscribe_rlnm: true`, verify RLNM call in logs.
   - 12.5: temporarily inject bad room data via test property OR simulate via partial failure path in code; assert `partial: true`.
   - 12.6: pick property with most images; verify all submitted.
   - 12.7: query `pms_mappings`, `pms_availability_cache`, scan `sync_logs.response_data` for camelCase keys (should be zero).
5. **Persist evidence** — single consolidated `sync_logs` row (`sync_type='full_orchestration_step_12'`) with all 7 sub-results + pass/fail per scenario.

### Files potentially modified
- `supabase/functions/push-property-to-ru/index.ts` — only if partial-failure tracking, image batching, or RLNM flag missing.
- No DB schema changes expected.

### Pass criteria
- All 7 scenarios produce expected outcomes (or are documented N/A with reason).
- `pms_mappings` rows are idempotent across re-pushes.
- `pms_availability_cache` reflects pushed data.
- All `sync_logs.response_data` keys are snake_case (per project memory `wire-format-and-validation-policy`).
- RU "not the owner" Status 24 on ARI is acceptable per support-ticket trail (pre-existing blocker, not a Step 12 failure).

### Assumptions
- Multi-unit RU property may not exist in current DB — will document as N/A and validate the multi-unit code path via static analysis if so.
- "Partial failure" can be triggered without breaking real data by passing a synthetic bad-room override OR by reading the existing failure-handling branch and simulating it. Will prefer non-destructive simulation.
- Large image set: if no property has 60+ images, will validate batching logic statically rather than create test data.
- No frontend, calendar, or booking engine touched — pure backend orchestration verification.

