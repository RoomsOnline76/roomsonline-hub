# Sync Pipelines: why every row says "Idle"

## Why it happens

The Sync Pipelines card grades a pipeline purely on how long ago its last run was:

- Last run within the past **60 minutes** → "Running"
- Last row's status is `error`/`failed` → "Error"
- Everything else → **"Idle"**

Rentals United price/availability verification last ran 3 hours ago (its normal cadence), so it falls outside the 60-minute window and shows Idle even though it is healthy and on schedule. Email Send, Payment ITN and Property Notification Email are event-driven — they only run when an email or payment happens — so they will essentially always read Idle.

Two related inaccuracies on the same card:

- The rows are labelled `runs · failed` as if they were 24-hour counters, but the underlying query pulls a **7-day** window, matching the card's "last 7 days" subtitle. The counts are 7-day counts.
- "Running" is really "ran recently"; nothing on the card distinguishes a pipeline that is *overdue* (cron stopped) from one that is simply between runs.

So "Idle" today means "not in the last hour" — not "broken", and not "not scheduled".

## What to change

### 1. Grade against expected cadence, not a fixed hour

Give each known pipeline an expected interval (RU verification ~6h, cron pulls 30m, etc.) and classify:

- **Healthy** — last run succeeded and is within its expected interval (plus grace).
- **Overdue** — last run succeeded but is older than the interval; this is the state that deserves attention.
- **Error** — last run failed.
- **Idle** — event-driven pipelines with no schedule (emails, payment ITN); shown neutrally, never as a warning colour.

Unknown pipeline keys fall back to the current time-based treatment.

### 2. Label pipelines by trigger type

Show "scheduled · every 6 h" or "event-driven" under the name so an Idle email pipeline reads as expected rather than suspicious.

### 3. Fix the counter labels

Say "7 d" (or last-7-days wording) on the runs/failed line so it matches the query window and the card subtitle.

### 4. Show the last run outcome

Where the last run failed, surface its error text on the row so a red pipeline explains itself without a database query.

## Technical notes

- `src/components/system/SystemOverviewTab.tsx` — pipeline aggregation (lines ~248-269) gains a cadence registry and new status derivation; `PipelineStatus` widens to include `overdue`; `getStatusBadge`/`getStatusIcon` gain an `overdue` case (amber) and `idle` becomes neutral grey.
- Widen the `sync_logs` select to include the error/message column so the last failure can be shown.
- No schema or backend change; the data already exists in `sync_logs`.
