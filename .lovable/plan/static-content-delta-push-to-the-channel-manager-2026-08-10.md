# Static content delta push to the Channel Manager

Goal: static property content (name, description, amenities, photos, beds/occupancy, location, policies) must reach Rentals United **as soon as it changes in ROL'OS**, not only on the weekly cron — satisfying the `Push_PutProperty_RQ` differential requirement.

## Current state (verified)

- `cron-push-all-properties-to-ru` does a weekly full push over every RU-connected property (building-level id or any active unit-level id, respecting `ru_push_enabled`), logging `ru_sync_runs.action = 'weekly_content_refresh'`.
- Event-driven pushes exist only for availability/prices: `_shared/ruAriDelta.ts` → `push-property-to-ru` with `action: 'refresh_ari'`, debounced 5 minutes per property via `ru_sync_runs`.
- `PropertyForm.tsx` does fire a push after a successful edit-mode save (around line 3710), but:
  - it only fires when `properties.rentalsunited_property_id` is set, so **multi-unit properties whose RU ids live on the units are never delta-pushed**;
  - it ignores `ru_push_enabled` (paused/archived listings still get pushed);
  - it fires on every save regardless of whether static content actually changed, and only from this one screen;
  - room/photo/amenity edits made outside a property save (room image upload, unit edits) don't trigger anything.
- `push-property-to-ru` has no "static only" mode: any non-`refresh_ari` call also recomputes and pushes availability, prices and discounts, which makes a content-only delta expensive against RU rate limits.

## What to build

### 1. Static-only push mode
Add `action: 'static_only'` to `push-property-to-ru`: build and send `Push_PutProperty_RQ` (plus image/amenity blocks) exactly as today, then skip the availability, prices and long-stay/last-minute discount phases. The existing content gate, sub-user auth and OwnerID resolution stay unchanged. Full push and `refresh_ari` behaviour are untouched.

### 2. Shared static delta helper
New `supabase/functions/_shared/ruStaticDelta.ts`, mirroring `ruAriDelta`:
- resolve RU connectivity the same way the weekly cron does (building id **or** any active unit id) and honour `ru_push_enabled`;
- compute a **content hash** over the static fields that RU cares about (name, type, descriptions, amenities, images, bed composition/occupancy, address/coords, check-in/out, policies, payment methods) for the property and its active units;
- compare with the last hash recorded in `ru_sync_runs` for `action = 'static_delta'`; skip when unchanged (no-op saves cost nothing at RU);
- otherwise debounce briefly per property, invoke `push-property-to-ru` with `static_only`, and log a `static_delta` run carrying the trigger label and the new hash.

### 3. Server entry point
New edge function `ru-static-delta` (authenticated) taking `{ property_id, trigger }` and delegating to the helper. This gives every save surface one fire-and-forget call and keeps the RU contract server-side.

### 4. Wire the save paths
- `PropertyForm.tsx`: replace the current inline push with a call to `ru-static-delta` (fires for unit-only RU properties too, respects pause, no push when nothing static changed). Toast only when a push is actually queued.
- Room image upload / room-type edits and the ROL'OS embedded property surfaces that persist rooms, amenities or photos: same fire-and-forget call after a successful write.
- Cancellation and reservation policy save paths already push; point them at the static delta so they inherit hashing and debounce.

### 5. Visibility and evidence
- Show "Last content push" (time + trigger) per property in the Channel Manager monitor's Cost & listings tab, sourced from `ru_sync_runs`.
- Update `docs/reference/ru-wl-certification.md` to mark the differential `Push_PutProperty_RQ` row as wired, naming the event triggers and the hash/debounce behaviour.

## Notes

- No schema change: `ru_sync_runs` already holds `action`, `property_id`, `details`, so the hash lives in `details`.
- The weekly cron remains as the safety net; deltas reduce, not replace, it.
- Deploy touched functions: `push-property-to-ru`, `ru-static-delta`.
