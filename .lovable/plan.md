## Finding

The attached PMS CSV does not match the current cached calendar counts for ONE46 ON M.

Key mismatches found in the current backend cache:

- **Compact Studio** should be `6,5,4,2,2,2,2,2,2,1,1,1,1`, but the app currently has values like `0,5,4,4,2,3,4,6,8,9,9,8,10`.
- **Studio** should be `0,1,1,1,1,1,1,1,1,1,1,1,0`, but the app currently has values like `0,2,2,4,3,3,4,6,9,8,7,8,6`.
- The pattern shows the app is still using aggregated unit/leaf calendar availability for at least some room types, instead of the PMS unit-type “Rooms to Sell” inventory.
- Some PMS CSV labels, like **Compact One Bedroom**, **One Bedroom**, and **Two Bed Room**, do not currently match one-to-one with the cached `raw_data.roomTypeName` labels, so the name/alias mapping also needs to be hardened.

## Plan

1. **Confirm the Hostfully unit-type inventory response shape**
   - Inspect the deployed Hostfully function logs and/or call the existing availability function for ONE46 ON M.
   - Confirm whether the function is receiving true unit-type inventory rows, or whether it is falling back to raw unit calendars.
   - Identify exactly why the previous “unit-type inventory first” switch is not being used for this property/date range.

2. **Fix the locked Hostfully adapter path**
   - Update only the explicitly locked Hostfully availability section.
   - Make unit-type inventory mandatory for Hostfully multi-unit properties where a PMS unit type exists.
   - Prevent silent fallback to summed child calendars when unit-type inventory exists but parsing/mapping fails.
   - If unit-type inventory cannot be read, return a clear diagnostic error/log instead of writing incorrect inflated counts.

3. **Harden room-type identity mapping**
   - Normalize PMS unit-type IDs and ROLOS room-type IDs so cached rows are keyed by the authoritative Hostfully unit-type ID.
   - Add safe aliases for display-name differences, including:
     - `Comapct Studio` / `Compact Studio`
     - `Compact One Bedroom`
     - `One Bedroom` / `One-Bedroom Apartment`
     - `Two Bed Room` / `Two-Bedroom Apartment`
   - Ensure Compact Studio and Studio cannot be blended or deduced from leaf-unit totals.

4. **Refresh ONE46 ON M availability cache**
   - Re-run the Hostfully availability sync for ONE46 ON M for the CSV date range.
   - Verify the database cache against the uploaded PMS CSV date-by-date and room-type-by-room-type.

5. **Add adapter-change guardrails**
   - Extend the adapter lock documentation so future edits cannot reintroduce raw calendar aggregation for Hostfully availability without explicit approval.
   - Add a targeted regression check or diagnostic script for ONE46 ON M comparing known PMS counts against cached output.

## Validation target

After implementation, the calendar cache for `2026-07-06` through `2026-07-18` should match the PMS CSV counts exactly for:

- Compact Studio
- Studio
- Compact One Bedroom
- One Bedroom
- Two Bed Room

The admin calendar should then display those same counts for ONE46 ON M.