# Fix: channel rejects attraction distances ("Duplicate value in distances")

## What the logs show (verified)

The push for Tidal Pools units sent this block and the channel answered status `92 — Duplicate value in distances.`:

```text
<Distances>
  <Distance DestinationID="491" DistanceUnit="1">0.1</Distance>
  <Distance DestinationID="223" DistanceUnit="1">11.5</Distance>
  <Distance DestinationID="617" DistanceUnit="1">16.2</Distance>
</Distances>
```

So the three entries we build are already unique — distinct destination ids (Park, Restaurant, Museum) and distinct values. Our own de-duplication (nearest-wins per destination id) is working. That means the "duplicate" is on the channel side, not in our list, and the exact rule is **not yet confirmed**. The two candidate causes are:

1. The channel stores distances cumulatively per listing, so re-sending a destination that already has a stored value counts as a duplicate.
2. The generic destination ids we cached are not valid for this listing's location, and the channel collapses them onto one destination, which then duplicates.

Confirming which one it is is the first step of the work — no mapping change is made on a guess.

## Plan

### 1. Stop distances from failing a push (immediate)

Attraction distances are a nice-to-have and must never block content, so the push should never die on them:

- When a `Push_PutProperty_RQ` comes back with the distances rejection, retry the identical payload once with the `<Distances>` block removed, and report the unit as successful with a soft note ("content pushed; distances skipped — channel rejected them").
- Surface the note in the push result and log the skipped distance count in the run evidence, instead of the current hard per-unit failure.

### 2. Confirm the real rule (diagnostics)

From the RU Diagnostics Console, against one Tidal Pools unit:

- Read the listing back (`Pull_GetProperty`) and record what distances the channel already holds for it.
- Push one single `<Distance>` entry at a time to see whether any single entry is accepted, and whether re-sending an accepted one triggers status 92.
- Re-pull the destination dictionary for this listing's location and compare against the ids cached in the generic dictionary.

### 3. Apply the confirmed fix

Depending on what step 2 shows, one of:

- **Cumulative store:** send only destinations the listing does not already carry (and clear/replace where the channel supports it) — the differential fingerprint already exists, so distance deltas keep working.
- **Wrong dictionary scope:** restrict mapping to destination ids valid for the listing's location, refresh the cache from that pull, and skip attractions with no valid match rather than guessing.

### 4. Verify

- Re-push Tidal Pools (multi-unit) and confirm every unit succeeds, with either distances accepted or cleanly skipped.
- Push a property with no attractions to confirm the block is still omitted entirely.
- Confirm the recommended readiness check still reports the captured count and never blocks.

## Technical notes

- Builder: `supabase/functions/rentalsunited-api/index.ts` (`distancesXml`, slot after `<Coordinates>`).
- Mapper: `supabase/functions/_shared/ruDistances.ts` (`buildDistanceEntries`, `loadPropertyDistances`).
- Push orchestration and per-unit result shape: `supabase/functions/push-property-to-ru/index.ts`.
- Evidence tables used for verification: `ru_api_log` (request/response XML, `status_id`, `status_message`) and `ru_sync_runs`.
