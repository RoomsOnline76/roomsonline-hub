# Restrictions: independent rules + instant calendar feedback

Two separate faults, both confirmed against the live data and code.

## 1. A min stay silently creates a block

Every night restriction lives in one row per night in `property_availability`. That table's
`available_units` column is `NOT NULL DEFAULT 0`, so when a min-stay (or max-stay / lead-days)
rule creates a new night row, the row is born with **0 units available** — and the calendar
treats "0 units" as blocked. Right now 299 of the 302 min-stay nights in the database look
blocked purely because of this default.

The reverse is the same row seen from the other side: "unblock these nights" deletes the whole
night row, which takes the min stay with it.

Fix:

- Make `available_units` nullable and default `NULL` ("no override"), and backfill the rows that
  only exist to carry a stay/lead rule (currently 299) from `0` back to `NULL`.
- Blocked becomes an explicit state: `is_stop_sell = true` (manual blocks), or a channel-owned
  row that genuinely reports zero units. A stay or lead rule never sets units.
- Removing a block clears the block fields only (`is_stop_sell`, units, reason, attribution) and
  leaves min stay / max stay / lead days on the row; the row is deleted only when nothing is left.
- Writing a stay or lead rule never touches block fields, and writing a block never touches
  stay or lead values. Each restriction type owns exactly its own columns.

Applies to all the writers: the bulk Min stay / Max stay / Lead days / Stop sell dialogs and the
restriction span editor.

## 2. The calendar lags after every restriction change

- Saving a restriction awaits the Channel Manager push (an edge-function round trip) *before*
  the dialog closes and before the calendar refetches, so a change appears seconds late.
- The refresh only refetches the single-property override query. Portfolio view, the week/month
  grids and the "Manage restrictions" list keep serving the 5-minute cached copy — which is why a
  removed block reappears and then disappears a moment later.

Fix:

- Apply the change to the cached calendar data immediately (optimistic write), then close the
  dialog and show the toast, so the room plan / day / week views reflect the edit on the same tick.
- Invalidate every restriction-dependent query together (property overrides, portfolio overrides,
  restriction spans) via one shared helper instead of one hand-picked refetch.
- Fire the Channel Manager delta in the background after the UI has settled, keeping the existing
  "updating in the background / parked until readiness clears" toasts.

## Technical notes

- Migration: `ALTER TABLE public.property_availability ALTER COLUMN available_units DROP NOT NULL`,
  drop the `0` default, and `UPDATE` the stay/lead-only rows to `NULL`.
- `src/lib/restrictionSpans.ts`: `isBlocked()` stops inferring blocks from `available_units = 0`
  on manual rows; `clearNights("block")` becomes a field clear plus conditional delete;
  `writeNights` writes only the column its kind owns.
- `src/components/Bulk{MinimumStay,MaximumStay,LeadDaysAdvance,LeadDaysPost}Dialog.tsx`: leave
  `available_units` unset; `BulkStopSellDialog` keeps setting the block fields.
- New `src/lib/restrictionRefresh.ts` with `invalidateRestrictionQueries(queryClient)` +
  optimistic patch helper, used by `PMSDashboard`, `CalendarAccommodation` and
  `RestrictionsManagerDialog`.
- `syncRestrictionsToChannels` is called without `await` from the dialogs (errors still surfaced
  through its own toast).
- Verify afterwards with a query that no row carries a stay/lead value while reading as blocked.
