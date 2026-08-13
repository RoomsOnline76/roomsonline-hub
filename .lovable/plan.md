# NightsBridge import — "skip all unknown rooms" in the dry run

## Current behaviour

After a dry run, unmatched room names are listed with a per-name dropdown ("Skip — import without a room" or pick a ROL'OS room) and a "Skip all" button. "Skip" today does not skip anything: the import function still creates the booking with no room assigned, so unknown rows always land in the data.

## What changes

Make the unknown-room handling explicit, with a true skip:

- Each unknown room gets three choices instead of two:
  - Map to a ROL'OS room
  - Import unassigned (current "skip" behaviour, renamed so it is honest)
  - Exclude these rows (rows for that room name are not imported at all)
- Add a one-click **Skip all unknown rooms** action at the top of the unknown-rooms panel that sets every unmatched name to "Exclude these rows", plus a **Import all unassigned** and **Clear all** alongside it.
- After choosing, the dry run re-runs automatically so the preview, counters and row list reflect the decisions before the Import button unlocks. Excluded rows appear in the skipped list with the reason "Unknown room — excluded by operator" and stay in the downloadable error/skip log.
- The summary badges show how many rows are excluded by choice, separate from rows skipped for other reasons (Unavailable, duplicate NBID).

## Technical notes

- `src/components/property/NightsBridgeBookingImport.tsx` — extend the override values from `{ SKIP | roomId }` to `{ EXCLUDE | UNASSIGNED | roomId }`, send both sentinels to the function, add the bulk action row, and trigger a re-validation when overrides change after a dry run.
- `supabase/functions/nb-import-bookings/index.ts` — accept the new sentinels in `room_overrides`: `__exclude__` pushes the row onto `skipped` before any write in both dry-run and live paths; `__unassigned__` keeps today's no-room import. Unknown names with no decision continue to import unassigned so nothing changes silently.
- No schema changes.
