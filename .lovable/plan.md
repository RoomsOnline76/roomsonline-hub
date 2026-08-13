# Make booking modify (and cancel) return immediately

## Why it is slow today

`modify-booking` does everything inline before it answers the browser. After the local write it still awaits, in sequence:

- `calculate-commission` (a second edge function call)
- `queueRuAriDelta(..., { force: true })` — this invokes `push-property-to-ru`, a full rates & availability push for the whole property
- `send-booking-email`

The channel push alone is many seconds. The save itself is finished long before the response arrives, so the dialog just sits there spinning. `cancel-booking` has the same tail, and the client-side restriction sync uses `wait: true`.

## What changes

### 1. Split each function into "must be correct now" and "can follow"

Stays in the request path (unchanged, because correctness depends on it):
- auth, validation, capability gate
- the Channel Manager push that must accept first (RU `modify_stay` / cancel / reject, and the existing external-PMS push) — channel-first stays intact
- price recalculation, the booking row update, availability re-block

Moves out of the request path:
- commission recalculation
- rates & availability delta (`queueRuAriDelta`)
- guest/owner email
- `booking_sync_status` follow-up write

The function responds as soon as the booking row and availability are correct.

### 2. A real work queue, not just fire-and-forget

New table `background_jobs` (job type, payload, status, attempts, run_after, last_error, timestamps) with RLS locked to service role and an index on `(status, run_after)`.

- Edge functions enqueue jobs instead of awaiting them.
- Immediately after enqueuing, the function kicks the worker via `EdgeRuntime.waitUntil` so the work usually starts within the same second — the queue is the durable safety net, not the primary latency path.
- New `process-background-jobs` function claims due jobs atomically (one `update ... returning` claim per job), runs the handler, and on failure re-schedules with exponential backoff up to 5 attempts before marking it failed.
- A minute cron calls the worker so anything the in-request kick missed still drains.

Handlers registered for: `recalculate_commission`, `channel_ari_delta`, `booking_email`, `booking_sync_status`. Jobs are keyed so duplicate enqueues for the same booking/property collapse into one — a burst of edits becomes one channel push, matching the existing per-property debounce.

### 3. UI stops blocking on the tail

- `BookingModifyDialog` / `BookingCancelDialog` close on success and show one toast: saved, with "the channel and emails are updating in the background".
- Calendar/rooms refresh happens on the already-wired realtime booking subscription plus a query invalidation, so the grid updates without waiting for the push.
- `syncRestrictionsToChannels` drops `wait: true` and reports "queued" instead of blocking the save.

### 4. Visibility

The Command Centre gets a small "Background work" line next to the existing channel request backlog: pending / retrying / failed job counts with a retry action for failed jobs, so nothing silently dies in the queue.

## Technical notes

- Migration: `create table public.background_jobs`, GRANTs (`service_role` all; no anon/authenticated write; `select` for authenticated only if the Command Centre reads it directly — otherwise it reads through a counting RPC), then RLS + policies.
- New: `supabase/functions/process-background-jobs/index.ts`, `supabase/functions/_shared/jobQueue.ts` (`enqueueJob`, `claimJobs`, `completeJob`, `failJob`).
- Edited: `supabase/functions/modify-booking/index.ts`, `supabase/functions/cancel-booking/index.ts`, `src/components/pms/BookingModifyDialog.tsx`, `src/components/pms/BookingCancelDialog.tsx`, `src/lib/restrictionSync.ts`, Command Centre backlog card.
- Cron via `pg_cron` + `pg_net` on the worker, one minute.
- Payloads stay snake_case; no change to how rates are resolved or which channel call is made.
