# Imported NightsBridge stays are not closing nights at the channel

## What the data shows (verified)

- 900 imported NB bookings exist: Seesig 665, Tidal Pools 235. **120 of them are still current** (check-out in the future): Seesig 75, Tidal Pools 45.
- Of those 120 future stays, **92 carry status `pending`** (Seesig 57, Tidal 35) and only 28 are `confirmed`.
- The availability payload builder in the channel push only treats a booking as sold when its status is one of `confirmed, checked_in, checked_out, completed, in_house`. **`pending` is not in that list**, so 92 real imported stays are invisible to the channel push by design.
- The importer never triggers a channel update: there is no ARI delta / push call anywhere in `nb-import-bookings`. So even the 28 confirmed imported stays only reach the channel if someone happens to run a manual push afterwards.
- 189 Seesig imported bookings still have no room type / room at all, so they can never be matched to a channel unit.
- Recent pushes for Tidal Pools are also unhealthy: 61 failed `inventory_push` rows today and a `Duplicate value in distances` rejection, so pushes that do run are not reliably landing.

That accounts for "not a single imported booking is reflected upstream".

## The fix

### 1. Imported stays count as occupancy
- Treat an imported reservation as sold inventory regardless of `pending`: the sold-nights loader accepts `pending` when the booking came from an import (NightsBridge / external ingest), while genuine ROL web-checkout `pending` carts stay excluded.
- Stamp imported rows with a clear occupancy intent on import (confirmed-equivalent for blocking purposes) so the rule is explicit rather than inferred in three places.

### 2. Import triggers the channel update
- After a live import run (and after the room-repair / remap action), queue an ARI delta for every affected unit and date range through the existing automatic delta pipeline, with gate parking when the property is not yet push-ready.
- Only future-dated ranges are pushed; past stays are never sent.
- Show the queued/pushed result in the import panel so the operator sees "42 nights queued to the channel" instead of silence.

### 3. Finish the unit mapping
- The 189 unmapped Seesig bookings cannot block anything until they carry a canonical room; surface them in the existing repair tool as a blocking to-do and re-queue the delta once mapped.

### 4. Prove it upstream
- After the push, read the channel calendar back for the specific imported date ranges (not the 365-day summary) and record per-property evidence: nights expected closed vs nights the channel reports open, with a re-push action for the gaps.
- Fix the current push failures found in the run log (distances rejection and the failing unit pushes) so the delta can actually land for Tidal Pools.

### 5. Backfill
- One-off: rebuild sold nights for Seesig and Tidal Pools from all 120 current imported stays and push, then verify with the read-back above.

## Technical notes

- `supabase/functions/push-property-to-ru/index.ts` → `loadBookingBlocks`: widen the status filter to include `pending` for imported/external `integration_type` values; keep native pending checkout carts excluded.
- `supabase/functions/nb-import-bookings/index.ts`: after live writes and after `repair_superseded_rooms`, collect affected unit + date ranges and enqueue deltas via the existing `ruPendingDeltas` helper; return a summary for the UI.
- `src/components/**/NightsBridgeBookingImport.tsx`: show queued-delta counts, unmapped-room blocker count and a "Push to channel now" action.
- Read-back uses the existing availability verification helper next to `verifyAvailability`, scoped to the imported ranges, stored in the sync run details.
- No schema change required; the only data write is the occupancy-intent stamp on imported rows.
