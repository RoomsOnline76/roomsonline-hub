# Step 3 — Availability push: guaranteed rolling 365-day window, deltas, overlap tests

## Verified current state

- `Push_PutAvbUnits_RQ` lives in `rentalsunited-api` (`action: 'push_availability'`), and the payload is built by `pushARI()` in `push-property-to-ru/index.ts` (~line 1500).
- The window is derived from the authored season periods, then a single filler range is appended from the latest season end to today+1 year (lines 1524–1530), with a full-year fallback when no seasons exist.
- Read-back verification already exists (`verifyAvailability`, `Pull_ListPropertyAvailabilityCalendar_RQ`), including correct handling of days RU already holds reservations for.
- `cron-refresh-ru-ari` runs every 6h and, per property, invokes the **full** `push-property-to-ru` (not an availability-only push), logging `refresh_ari` rows to `ru_sync_runs`.

Confirmed gaps:

1. **The 365-day window is not guaranteed.** Season periods are used as authored, so period starts in the past are pushed, and gaps *between* seasons are never filled — only the tail after the last season is. There is no day-by-day coverage counter for availability (pricing has one, availability does not).
2. **Overlapping periods are pushed as-is.** `expandAvailability` maps periods 1:1 to ranges with no merge/dedup, so two seasons covering the same dates emit overlapping RU ranges with conflicting MinStay/changeover.
3. **The nightly refresh is blocked by the content gate.** Because the cron calls the full push, an already-listed property that fails any mandatory content rule returns 422 `NOT_READY` and its ARI silently stops refreshing.
4. **No event-driven delta.** Nothing invokes an ARI refresh on booking, block, or cancellation — only the 6h cron and the manual admin button.
5. **No overlap / duplicate-push test.** The cert console has no availability panel asserting push → read-back → diff, or same-range-twice and overlapping-range behaviour.

## Phases

### Phase 3a — Guaranteed rolling window
- In `pushARI`, normalise periods before expansion: clamp starts to today, drop fully past periods, sort, merge/dedup overlaps (later-authored season wins on MinStay/changeover), then fill **every** remaining gap up to today+365 with a filler range — not just the tail.
- Emit `availability_coverage: { days_covered, days_total: 365, missing_dates[] }` on the push result and into `ru_sync_runs`, mirroring the existing price-coverage shape.
- Inventory stays sourced from the authoritative unit-type/Rooms-to-Sell surface; no summed leaf calendars.

### Phase 3b — Availability-only refresh path, unblocked
- Add an `action: 'refresh_ari'` mode to `push-property-to-ru` that skips `Push_PutProperty_RQ` and pushes availability + prices only, for properties that already carry an RU PropertyID.
- That mode bypasses the static-content gate (content is already live at RU) while still requiring sub-user keys and a resolved OwnerID; every run writes evidence.
- Point `cron-refresh-ru-ari` at this mode so content shortfalls can no longer stall ARI, and keep the per-property pacing.

### Phase 3c — Event-driven deltas
- Trigger a scoped ARI refresh for the affected property on availability-changing events: booking confirmed, booking cancelled/modified, and manual calendar blocks.
- Debounce per property (coalesce bursts into one push) and respect RU's per-owner sliding-minute window using the existing pacing helper; log each delta to `ru_sync_runs` with `details.trigger`.

### Phase 3d — Cert console availability panel
- New `ru-cert-portal` action `availability_playground`: push the rolling window, read back with `Pull_ListPropertyAvailabilityCalendar_RQ`, diff pushed vs returned, and report coverage + mismatches as an availability health grade.
- New `duplicate_range_test`: push the same range twice and push two deliberately overlapping ranges, asserting RU ends in one consistent state (no duplicated days, no conflicting MinStay).
- Surface both in `RuCertificationConsole.tsx`, feeding the milestone tracker and the JSON/PDF evidence export.

## Open question

The uploaded screenshot shows a clipped "3 Availabl…" chip. I could not find that string in the channel-manager or sync-tracker components, so tell me which screen it is on and I will add a small UI phase to fix the truncation.

## Technical notes
- No edits to locked adapter regions in `.lovable/ADAPTER_LOCKS.md` without explicit approval in the same turn.
- All RU calls stay inside the RU edge functions; wire payloads remain snake_case.
- Sub-user AccessKey/SecretKey auth for every call; master keys are never a fallback.
