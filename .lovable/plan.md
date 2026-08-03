# Sync observability: grade on current health, not stale history

## What I checked first

Tidal Pools is being pushed as the **correct sub-account**. Every ARI run since 21:14 today authenticated as RU account `741765` (the white-label sub-user) and pushed all four units successfully:

```text
22:40  ELF=true  GEELSTERT=true  LEERVIS=true  WILDEPERD=true
22:07  ELF=true  GEELSTERT=true  LEERVIS=true  WILDEPERD=true
21:30  ELF=true  GEELSTERT=true  LEERVIS=true  WILDEPERD=true
```

So why is the card red? The 7-day counters mix in pre-fix history:

- `refresh_ari`: 22 failed / 7 passed in the window. 16 of those failures are `Edge Function returned a non-2xx status code` dated 31 Jul – 3 Aug 06:00, i.e. before the child-auth and timezone fixes.
- The 18:00 run is the last real failure: `LEERVIS` and `WILDEPERD` returned non-2xx while `ELF` and `GEELSTERT` succeeded — the signature of RU's one-write-per-method-per-owner sliding minute being hit mid-fan-out.
- Availability and Prices both read the same `refresh_ari` rows, so one property-level run counts as one call for both, and a 4-unit push shows as `7/29 calls` instead of per-unit truth.

Nothing here says the wrong account is being used; it says the tracker is grading a week of history that no longer reflects the implementation.

## What to change

### 1. RAG from current health

Grade each endpoint on:
- the **outcome of the latest run** (hard signal), and
- a **24-hour success rate** (trend),

with the 7-day rate kept as secondary context text rather than the thing that colours the card. Green requires the last run to have succeeded, the 24h rate at 100%, and complete property coverage. A row whose last run passed but which has older failures becomes amber with "recovered — N older failure(s) in the 7-day window", never red.

### 2. Count unit calls, not property runs

Availability and Prices runs record `details.units[]` with a per-unit `success`. Derive call counts from that array when present, so a 4-unit property contributes 4 calls per run and the failing unit is named. Rows without unit detail keep counting as one call.

### 3. Show the account each run used

Add the RU owner account to each endpoint row ("as sub-user 741765") pulled from the run details, so the question "are we calling the right sub-account?" is answerable without a database query. Rows that ran on the master account for a white-label property are flagged amber with an explicit warning.

### 4. Expose the failures

Make each endpoint row expandable to list its recent failures — timestamp, unit, error message — so a red or amber card explains itself instead of only showing a ratio.

### 5. Pace the ARI fan-out

The 18:00 partial failure is a real pacing gap: `cron-refresh-ru-ari` waits 1s between properties, but the per-unit writes inside one property push have no spacing against RU's per-owner method window. Space consecutive same-method unit writes inside a property push, and retry a unit once after the window rather than recording it as failed.

## Technical notes

- `src/components/integrations/RuSyncProgressTracker.tsx` — new grading function (last run + 24h window), unit-level call derivation from `details.units`, owner-account line, expandable failure list.
- `src/pages/AdminRentalsUnited.tsx` — widen the tracker query to select `details`, `error_message` and `ru_property_id` so the tracker can render unit and failure detail.
- `supabase/functions/push-property-to-ru/index.ts` — inter-unit spacing plus one retry per unit on rate-limit responses during the ARI fan-out.
- No schema change; `ru_sync_runs` already carries everything needed.
