# Resolve `weekly_content_refresh` health failures

The active Monday 02:00 schedule is present. The four failed rows in the current report were written between 02:01 and 02:02 on 17 August, before a post-fix validation run; each has `success = false`, no error code, and the literal message `Unknown`. The current source contains the resumable-chunk loop, but the database has no newer `weekly_content_refresh` rows proving the deployed path works.

The reported 502 and 503 are separate transient failures: `refresh_ari` returned 502 and `refresh_discounts` returned 503. They are not the cause of the four weekly refresh failures.

## Implementation

1. **Finish structured weekly failure handling**
   - Preserve `complete`, `resumable`, and `failed` as distinct outcomes through the property push and weekly cron.
   - Treat a healthy resumable chunk as successful work, continue with its remaining unit IDs, and record any budget-limited remainder as pending rather than failed.
   - Carry the sequence batch ID across chunks for one traceable refresh operation.
   - Decode non-2xx function responses so every real weekly failure records an error code, HTTP status where available, and a useful message; never write `Unknown`.

2. **Deploy the complete refresh path**
   - Deploy `push-property-to-ru` and `cron-push-all-properties-to-ru` together so their response contract cannot drift.
   - Deploy the health report update after validating the underlying run data.

3. **Run a controlled live verification**
   - Invoke the weekly cron scoped to the same four active properties from the failed run.
   - Confirm each multi-unit sequence either reaches `complete` or remains explicitly `resume_pending` without being marked failed.
   - Verify the resulting `ru_sync_runs` rows have no null error codes/messages on genuine failures and no literal `Unknown` values.
   - Check the global RU rate gate/queue remains effective during the scoped run and that no units are silently dropped.

4. **Correct report attribution**
   - Make the “Top failures” list name the originating action so the unrelated `refresh_ari` 502 and `refresh_discounts` 503 cannot appear to be weekly-refresh causes.
   - Keep recovered transient 502/503 events informational when a newer successful run exists.
   - Ensure the weekly action’s “Now” state and success rate are calculated from the verified post-fix run while retaining the old failures as historical evidence.

## Technical notes

- Primary files: `supabase/functions/push-property-to-ru/index.ts`, `supabase/functions/cron-push-all-properties-to-ru/index.ts`, and `supabase/functions/daily-health-report/index.ts`.
- Reuse the shared function-invocation error decoder rather than reading only the generic edge invocation message.
- The property push path contains adapter-locked regions. Approval of this plan is explicit approval to make only the changes above in those regions.