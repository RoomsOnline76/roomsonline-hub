# Health report 2026-08-17: fix the two "failing" channel pipelines

Both failures are confirmed from the logs. Neither is a broken channel connection — one is a mislabelled success, the other is an account with no credentials.

## 1. `weekly_content_refresh` — 0% success is wrong, but the weekly refresh really is incomplete

What the logs show for the 02:01–02:02 run of the four Jongensfontein properties:

- Every Rentals United call in that window returned Success (one advisory `Duplicate value in distances`).
- Each property logged `inventory_push` as **success = true**, code `RU_PUSH_RESUMABLE`: "3 unit(s) pushed and verified, N unit(s) still queued in this sequence."
- The weekly cron nevertheless logged **failure with error "Unknown"** for all four.

Cause: the push function returns `success: false` for a resumable chunk (`success = chunkSuccess && no units remaining`) and attaches no error object, so the cron's `data?.error?.message || 'Unknown'` writes a bare "Unknown". Those four rows are the bulk of the report's `UNKNOWN ×15`.

Second, real problem behind it: the weekly cron pushes one chunk (3 units) per property and never resumes, so properties with 4–9 units never finish a full content refresh in a weekly run.

Fixes:

- A resumable chunk stops being reported as a failure. The push response distinguishes "complete", "resumable" (partial, healthy) and "failed", and the cron records resumable chunks as success with a `resume_pending` note plus the remaining unit count.
- The weekly cron resumes the sequence: it keeps re-invoking the push for a property with remaining unit ids until the sequence completes, the time budget runs out, or a real rejection occurs — pacing between chunks so the channel rate gate is respected. Anything still outstanding at the end of the run is queued rather than silently dropped.
- No push path may return `success: false` without an error code and message, so "Unknown" cannot reappear in the health report.

## 2. `ensure_company_details` — the failing account has no API keys

All six failures are the same account: OwnerID 742004 (`ru-owner@roomsonline.co.za`, the TEST portfolio), manually retried from the channel console on 16 Aug. Its record has no access key and no key verification timestamp — the keys were deliberately removed — so the call falls back to the stored sub-user password and Rentals United answers Status -4. The live account (741761) has verified keys and company details recorded as sent.

Fixes:

- Company provisioning requires a verified key pair for that OwnerID. Without one it returns a clear "waiting on owner setup" outcome naming the missing keys, instead of attempting a password login that cannot succeed.
- Those outcomes are logged as a setup gap, not a pipeline failure, so they land in the health report's existing "Waiting on owner setup (not a fault)" block rather than the failure table.
- The console shows the same distinction: the action is disabled with the reason when keys are missing, so nobody can generate another guaranteed -4.

## 3. Report accuracy

- The RLNM detail on those runs (`LNM subscription drift — missing owners: 742004, 741761`) is recorded but not surfaced; the health report gains a line for handler-subscription drift so it isn't buried inside a property row's details.
- `HTTP_503 ×1` and the single 502 on `refresh_ari` are transient channel-side blips already retried; they stay as informational.

## Technical notes

- `supabase/functions/push-property-to-ru/index.ts`: separate the resumable state from failure in the multi-unit chunk response (`status: complete | resumable | failed`), always emit `error.code`/`error.message` on real failures.
- `supabase/functions/cron-push-all-properties-to-ru/index.ts`: resume loop over `remaining_unit_ids` with paced re-invocation and a run time budget; log `weekly_content_refresh` success for resumable chunks with `resume_pending` details; never write the literal "Unknown".
- Company details: gate on `ru_api_credentials.verified_at` for the OwnerID before calling `Push_FillCompanyDetails_RQ`; return a distinct `RU_CHILD_KEYS_REQUIRED` outcome and log it as a setup gap in `ru_sync_runs`.
- `supabase/functions/daily-health-report/index.ts`: classify the child-keys-missing outcome under owner setup gaps, and add the RLNM drift line.
- Adapter-locked regions of the push/company-details path are touched; approving this plan is the explicit approval.
