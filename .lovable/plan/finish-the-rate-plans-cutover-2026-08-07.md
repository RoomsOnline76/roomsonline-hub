# Finish the Rate Plans cutover

The Calendar no longer captures rates and Rate Plans now outrank the legacy Calendar store. Two pieces of the cutover are built in the backend but not yet visible to anyone using ROL'OS: the legacy rate audit and the one-time migration. This finishes that.

## What owners will see

1. **A legacy-rates banner in Pricing by season.** When a rate plan still depends on rates that live only in the old Calendar grid, the section shows a short notice: how many unit/season cells are still legacy, and a single **Move these rates into this plan** button. After the move the banner disappears for good.  import legacy rates fro all proerties/units to new rate plans UI & logic.
2. **Import button only when it is useful.** Today "Import legacy Calendar rates" shows whenever the resolver returns any price, so it appears even for plans that are already fully priced here. It becomes driven by the audit — visible only while legacy cells are actually pending, hidden once nothing is left to import.
3. **Nothing is overwritten.** Cells already priced in Rate Plans are left exactly as they are; only empty cells that legacy pricing was covering get filled. Values land in the draft so the owner reviews and saves them.
4. **Property-level sweep for admins.** On the Rate Plans list, an admin-only line shows how many plans on the selected property still lean on legacy Calendar rates, with a link into each one. No bulk silent writes.

## Technical notes

- `rolos-rate-plans` already exposes `legacy_rate_audit` and `migrate_calendar_rates` (with `dry_run`). No new edge function work beyond wiring, plus a small `legacy_rate_audit` variant that accepts a property id and returns per-plan pending counts for the list view.
- `RatePlanEditor.tsx`: call `legacy_rate_audit` alongside the existing `season_rate_matrix` load, hold `pendingLegacyCells` in state, pass it to the pricing table, and refresh it after a successful save. `migrate_calendar_rates` is called with `dry_run: true` first to render the count, then for real on confirm; the returned cells dispatch through the existing `seed_matrix` reducer action so the change stays a draft edit.
- `RatePlanSeasonPricingTable.tsx`: replace the `hasLive` gate with the pending-cell count; add the banner above the matrix; keep the per-season "Import legacy" chip but gate it on that season having pending cells.
- `RatePlansSurface.tsx`: property-level pending summary, gated to admin/dev/fearless_leader.
- Resolution hierarchy and the legacy read-only fallback tier stay unchanged, so live pricing and channel pushes are unaffected while properties migrate.
- Reducer coverage for partial seeding already exists in `ratePlanDraft.test.ts`; extend it for the "never overwrite a priced cell" case.

## Out of scope

- Deleting the legacy `properties.amenities.season_rates` store or the write-back on save. That happens only once every property reports zero pending legacy cells.