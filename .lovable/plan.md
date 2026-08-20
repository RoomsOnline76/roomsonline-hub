# Address edits must reach the Channel Manager on save

## What actually happened on RU Test Clone B

The address edit *did* trigger a delta — it was refused, then delivered two minutes later by a background re-arm, so nothing told you it had been sent.

Ledger evidence for property RU Test Clone B (`ru_sync_runs`):

```text
19:31:19  static_delta_pending   trigger=property_save_mandatory_fields  PHASE_BLOCKED
          changed: address, city, postal_code, latitude, longitude, amenities
          blockers: "Elf/Leervis/Geelstert/Wildeperd: Latitude / longitude are missing"
19:32:08  static_delta_pending   same change, same blockers
19:33:38  static_delta   success=true   trigger=readiness_cleared:content
```

Cause chain:

1. You typed the new street/city/code. The property row had no latitude/longitude yet.
2. The save fires geocoding as fire-and-forget (`geocode-property`), then immediately queues the content delta.
3. Because coordinates were still empty, the readiness gate returned `PHASE_BLOCKED` ("Latitude / longitude are missing" — units inherit the property's coordinates, which were null), so the delta was parked as `static_delta_pending`.
4. Geocoding finished a moment later, filled `-33.9412747 / 18.4949906`, readiness passed, and the parked delta re-fired at 19:33:38 and was accepted by the channel.

So the push is not lost — it is late and silent. Two things need fixing: the ordering that guarantees the first attempt is blocked, and the fact that a parked/re-armed delta never says so clearly.

## Fix 1 — geocode before the delta, not after it

In the property save path: when the address fields changed and latitude/longitude are missing or stale, await `geocode-property` (with a short budget, e.g. 8s) *before* queuing the channel content delta, and use the returned coordinates in the same save. If geocoding fails or times out, continue exactly as today (park the delta) instead of failing the save.

Result: an address edit on a property without coordinates passes the readiness gate on the first attempt and is delivered by the save itself.

## Fix 2 — tell the operator the truth when a delta is parked

- Surface the gate blockers in the toast: "Address queued — blocked by: Latitude / longitude are missing", instead of the current generic queued/silent outcome.
- When the automatic re-arm later delivers the parked delta, report it (toast if the editor is still open, and always in the channel panel's activity so the operator can see `readiness_cleared` delivered the address).

## Fix 3 — don't let a stale unit blocker park a property-scoped change

The blocker was produced per unit from inherited property coordinates. Make the coordinate check read the effective value (unit coordinate, else property coordinate) once, and report it as a single property-level blocker rather than four identical unit blockers, so the gate message matches reality.

## Technical notes

- `src/pages/PropertyForm.tsx` — move the `geocode-property` invoke ahead of `deriveChangedChannelFields` / `pushChangedChannelFields`, awaited with a timeout, applying returned lat/lng to the patch.
- `src/lib/channelSavePush.ts` + `src/lib/channelPushConfirm.ts` — carry `details.blockers` from the `static_delta_pending` row into the deferred reason text.
- `supabase/functions/_shared/ruReadiness.ts` / `push-property-to-ru` — coordinate check uses the effective (inherited) coordinate and one consolidated blocker.
- No schema changes. Verification: edit an address on a coordinate-less test clone and confirm a single `static_delta` with `success=true` and `trigger=property_save_mandatory_fields` in `ru_sync_runs`, with no `static_delta_pending` row in between.
