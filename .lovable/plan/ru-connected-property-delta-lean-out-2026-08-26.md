# RU connected-property delta lean-out

Adapter/edge only. No calendar, booking, PropertyForm or dashboard UI work. Static vs ARI split, `static_only` isolation, reserved-day split-and-retry, daily full-year ARI cadence and gate parking all stay exactly as they are.

## Confirmed against the code

- `ruStaticDelta.ts` hashes three different shapes: plan/skip hash is `{ property, units, charges }` (lines 98, 384), field fingerprints include attractions, and the post-success stored hash is `{ property, units }` (line 434). So a surroundings-only edit can hash as unchanged, and the next save after a good push almost always looks changed.
- `ruAriDelta.ts` has no payload hash at all — `queueRuAriDelta` only checks `recentlyPushed` (line 101) and **drops** the edit when not forced.
- `push-property-to-ru` always calls `verifyAvailability` after PutAvb (line 2742) while the price read-back is already opt-in via `verify_readback`.
- `restrictionSync.ts:43` and `channelSavePush.ts:187` both pass `force: true`, so every restriction/rate click is a full-year write.
- `cron-push-all-properties-to-ru` invokes `push-property-to-ru` with **no `action`** (line 156) → full static + full-year ARI + discounts, on top of the daily ARI cron.
- `applyImageVerification` runs on every static push path (lines 4161, 4748, 4887, 5288, 5503).
- `cron-channel-price-coverage` fires `refresh_ari` as repair (line 132) with no freshness guard.

## Order of work

### 1. Fix F — one canonical static snapshot hash (correctness bug, first)
`_shared/ruStaticDelta.ts`: add one helper that builds `{ property, units, charges, attractions }` and use it at all three sites — `planStaticPushScope` hash, the pre-push skip hash in `queueRuStaticDelta`, and the post-success `after` rehash. Nothing gets dropped after a successful push. Add `ruStaticDelta.hash.test.ts` asserting the three call sites produce the same shape/hash for the same snapshot.

### 2. Fix A — ARI fingerprints, skip when nothing moved
Store `availability_hash` (units, units-to-sell, min stay, changeover) and `prices_hash` (season/day rates, extra guest) in `ru_sync_runs.details` for successful `refresh_ari` rows, using the same `stableStringify` style, scoped to the window/units actually considered.

- availability unchanged → skip PutAvb **and** the calendar pull
- prices unchanged → skip PutPrices
- both unchanged → success with no RU write, logged `skipped: true`, reason `unchanged`
- no stored hash → full year as today
- `recentlyPushed` ignores skip/unchanged rows so a no-op cannot lock the property for 5 minutes

Booking `force: true` still writes availability regardless of hash; it does not force prices.

### 3. Fix C — calendar read-back becomes opt-in
Add `verify_availability_readback`, default false. On for booking confirm/cancel/modify (`channelBookingSync`), off for restriction/rate/cron. The "confirmed reservation" rejection path keeps its extra pull, split and retry even when the flag is false. `cron-refresh-ru-ari` sends it false alongside the existing `verify_readback: false`.

### 4. Fix B — scope window and unit
Thread `only_unit_ids`, `date_from`, `date_to` through `queueRuAriDelta` → `ru-ari-delta` → `refresh_ari`. Pass the span only where the existing adapter-facing helper already knows it (restriction range, rate-plan season dates, booking stay nights). No range known → keep 365.

### 5. Fix D — ARI debounce waits instead of dropping
Match `queueRuStaticDelta`: without force, wait out the remaining debounce, re-read the snapshot, then push. Remove `force: true` from `restrictionSync.ts` and `channelSavePush.ts` so repeated clicks coalesce into one write. Booking keeps force. `confirm_pending` hold unchanged.

### 6. Fix E — weekly cron is static-scope only
`cron-push-all-properties-to-ru`: per property run `planStaticPushScope`; `unchanged` → skip (keep the per-account RLNM refresh in Step 0); otherwise invoke with `action: 'static_only'` plus `only_unit_ids` from `scope_unit_ids`. No ARI from this job.

### 7. Fix G — image probes only when image fields moved
In the `static_only` path, skip `applyImageVerification` when `changed_fields` carries no `images` / `ru_image_tags` key at property or scoped-unit level. First push, image-set change or a forced static push still probes.

### 8. Fix H — coverage cron respects a fresh ARI
`cron-channel-price-coverage`: on the unscoped sweep, skip the audit and auto-repush when a successful non-skip `refresh_ari` exists for that property inside 45 minutes; log `skipped_fresh_ari`. Operator-scoped `property_ids` re-checks still audit.

## Verification before finishing

Static: surroundings-only edit yields `property.attractions` in `changed_fields` and a `static_only` invoke; a second no-op save logs `unchanged`. ARI: `pushARI` can return success with `skipped_avb` / `skipped_prices` and zero writes; booking force still writes availability while prices skip; no `get_availability` after a restriction PutAvb unless the flag is set; "confirmed reservation" split-and-retry intact. Crons: weekly never invokes without `static_only`, daily still `refresh_ari` with both verify flags false. Build/typecheck clean, no new files under `src/pages` or `src/components`.
