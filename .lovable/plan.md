# Blocked-night tooltip: show who blocked it

Today a blocked night in the compact calendars only says `Blocked — 16 Aug 2026`. There is no record of who created the block, so the tooltip cannot answer the question yet. The stored availability row keeps only the source system (`manual`, or a channel/PMS name) — no user, no timestamp, no reason.

## What changes

1. **Record the author of a block.** Add attribution to the availability record: who blocked it, when, an optional short reason, and keep the existing source system. Every place in the app that sets a stop-sell (single-day toggle in the room calendar, bulk stop-sell, bulk availability rule) stamps the signed-in user. Blocks that arrive from a channel or PMS sync keep their system name as the author ("Channel Manager", "NightsBridge", etc.).

2. **Richer tooltip.** Hovering a hatched night shows:
   - `Blocked — 16 Aug 2026`
   - `By Dawie Kotze · 12 Aug 2026 09:14` (or `By Channel Manager` for synced blocks)
   - the reason, when one was captured
   - `Source unknown` for legacy rows blocked before this change

   Same tooltip text in the dashboard room plan, the Rooms multi-calendar and the room-type plan grid, so all three surfaces read identically.

3. **Optional note when blocking.** The bulk stop-sell dialog and the calendar day toggle gain a short optional "reason" field (e.g. "Owner stay", "Maintenance") that flows straight into the tooltip.

## Technical notes

- Migration on `public.property_availability`: `blocked_by uuid` (references the profile/user id), `blocked_by_label text` (display name or system label), `blocked_reason text`, `blocked_at timestamptz`. Nullable, no backfill; existing grants and policies unchanged.
- Write sites to stamp: `src/components/BulkStopSellDialog.tsx`, `src/components/BulkAvailabilityRuleDialog.tsx`, `src/components/RoomAvailabilityCalendar.tsx`, `src/lib/restrictionSync.ts`; sync-side writers (`sync-rates-availability`, `hydrate-pms-cache-to-rolos`, RU lead/window helpers) pass their system label rather than a user id.
- Read sites: extend the `property_availability` selects in `src/pages/pms/PMSDashboard.tsx` and `src/pages/pms/PMSRooms.tsx` to include the new columns, and change `isBlocked` from a boolean predicate into one returning block details (`{ label, at, reason }` or `null`) consumed by `RoomPlanGrid.tsx`, `RoomTypePlanGrid.tsx`. Move-guards and create-guards keep using truthiness, so behaviour is unchanged.
- Tooltip stays a native title attribute (multi-line) to avoid adding hover overhead to every calendar cell.
