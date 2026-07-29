The warning "RoomsOnline integration has not been implemented yet" appears because `pmsIntegrationStatus` in `src/components/ApiMilestones.tsx` has no entry for the `roomsonline` system key. Both `PropertyForm.tsx` and `GeneralTab.tsx` derive their warning state from this map, so adding the missing entry will fix both locations.

### Plan
1. Update `src/components/ApiMilestones.tsx`
   - Add a `roomsonline` entry to `pmsIntegrationStatus` with all milestones set to `true` (auth, healthCheck, pullAvailability, syncIn, pushBooking, liveMonitor).
   - Include a comment noting ROLOS is the internal, fully-deployed PMS.

2. Verify the change
   - Confirm `isPMSFullyIntegrated("roomsonline")` now returns `true`.
   - Check that the amber warning triangle no longer renders next to ROLOS in the PMS selector on `/admin/edit property` → General tab.

### Files to change
- `src/components/ApiMilestones.tsx`

### No changes needed to
- `src/pages/PropertyForm.tsx`
- `src/components/property/GeneralTab.tsx`
These already consume the shared status map correctly.