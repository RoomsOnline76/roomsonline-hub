# NB importer: allow skipping unmatched room names

Today each unmatched NightsBridge room name shows a room dropdown with no way to say "leave this one alone". Once a value is chosen it can't be cleared, and there is no explicit skip choice, so the mapping panel feels mandatory even though import already works without it.

## What changes

- Each unmatched room row gets an explicit **"Skip — import without a room"** option at the top of the dropdown (plus a small clear/reset control), so a name can be deliberately left unmapped.
- A **"Skip all"** action on the panel marks every remaining unmatched name as skipped in one click.
- Skipped names render with a muted "will import unassigned" tag instead of the destructive `unmatched` badge in the preview table, so the state reads as intentional.
- Panel copy changes from "Map them below, then validate again" to make clear mapping is optional: unmapped or skipped rooms simply import with no room assignment.
- Import stays enabled regardless of how many names are skipped (unchanged behaviour, now stated in the UI).

## Technical notes

- Frontend only: `src/components/property/NightsBridgeBookingImport.tsx`.
- Skips are tracked as a sentinel value in the existing `overrides` state (e.g. `"__skip__"`), filtered out before building the `room_overrides` payload sent to `nb-import-bookings`, so the edge function keeps its current contract and needs no change.
- Skip choices persist across repeated dry runs (cleared only when a new file is picked, matching current behaviour).
