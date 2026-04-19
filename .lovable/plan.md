

Let me explore the cron function and check the current state.

The `cron-push-all-properties-to-ru` source is already in context. Key observations:
1. Step 0: Refreshes RLNM by invoking `rentalsunited-api` with `subscribe_notifications`
2. Step 1: Queries all properties with `rentalsunited_property_id IS NOT NULL`
3. Sequential push with 1-second delay between calls (rate limiting safety)
4. Returns structured summary with per-property results

After Step 12, we now have 9 SEESIG units + ALBATROS with `rentalsunited_property_id` set. So the cron should pick up at least 9-10 properties from `properties` table... wait — these are `hostfully_room_types` rows, not `properties` rows. Let me verify by checking the query target.

The cron queries the `properties` table for `rentalsunited_property_id`. ALBATROS RU ID 4707563 was originally on `pms_mappings` and the `properties` table for SEESIG building. Need to verify what's in the `properties.rentalsunited_property_id` column post Step 12.

Need to check:
- pg_cron schedule exists for `cron-push-all-properties-to-ru`
- Count of properties with `rentalsunited_property_id` set in `properties` table (vs room_types)

## Plan: Step 13 — Cron Job Validation

### Context
- `cron-push-all-properties-to-ru` is already implemented: refreshes RLNM subscription → queries `properties.rentalsunited_property_id IS NOT NULL` → loops sequentially with 1s delay → returns structured summary with per-property results.
- Step 9 verified RLNM subscription works; Step 12 verified per-property push orchestration.
- Step 13 = end-to-end validation of the weekly batch cron + scheduling check.

### Test matrix

| # | Scenario | Method | Expected |
|---|----------|--------|----------|
| 13.1 | Trigger weekly cron | Manually invoke `cron-push-all-properties-to-ru` | Returns `{success, pushed, total, rlnm, results[]}`; logs show RLNM refresh + per-property push |
| 13.2 | RLNM refresh verification | Inspect response `rlnm` field + edge logs | `rlnm: 'ok'`; `rentalsunited-api` shows `subscribe_notifications` call within cron window |
| 13.3 | Sequential + rate-limit safety | Inspect timestamps in logs | Each property push starts ≥1s after previous; no parallel HTTP bursts to RU |

### Implementation steps

1. **Verify pg_cron schedule** — query `cron.job` for any entry pointing to `cron-push-all-properties-to-ru`. If missing, insert a weekly schedule (e.g. `0 3 * * 1` — Mondays 03:00 UTC) using project URL + anon key via the insert tool.
2. **Confirm fixture set** — query `properties` (not room_types) for `rentalsunited_property_id IS NOT NULL`. If only the SEESIG building row qualifies, that's the test set; document accordingly. (Per-unit RU IDs live on `hostfully_room_types`, so the cron iterates buildings and the orchestrator handles the multi-unit fan-out.)
3. **Manual invocation** — POST to `cron-push-all-properties-to-ru`, capture full response.
4. **Log review** — pull `cron-push-all-properties-to-ru` and `rentalsunited-api` logs; confirm:
   - `[cron-push-all] Subscribing RLNM handler` line
   - `[cron-push-all] RLNM subscription refreshed successfully`
   - Per-property `[cron-push-all] OK: {name}` or warning lines
   - Timestamps between properties show ≥1000ms gap
5. **Persist evidence** — insert a `sync_logs` row (`sync_type='weekly_cron_step_13'`) with the consolidated summary, RLNM status, and inter-property delay observation.

### Files potentially modified
- None expected (orchestrator + RLNM hook + delay loop already implemented).
- If `pg_cron` schedule is absent, a one-off SQL insert (not a migration) to register the weekly cron.

### Pass criteria
- Cron invocation returns `success: true` with structured `pushed/total` counts.
- `rlnm` field reads `ok`.
- Logs confirm sequential processing with ≥1s gaps.
- pg_cron schedule for the weekly job exists and is active.

### Assumptions
- "Weekly" cadence = every Monday at 03:00 UTC (off-peak, low-risk window). Adjustable on user request.
- ARI-stage Status 24 ("not the owner") in nested push results is acceptable — that's the documented RU support-ticket blocker, not a Step 13 failure.
- The cron uses `rentalsunited_property_id` on the `properties` table only; per-unit fan-out is handled by `push-property-to-ru` itself.
- No code changes expected — purely a verification + scheduling pass.

