
Goal: restore both the visible promo sections on checkout and the actual auto-application logic for Latter Days, without changing the overall checkout design.

1. Confirmed current state
- The checkout page currently renders Announcements only.
- It does not render `SpecialsBanner` or `PackageCards` at all, so “no special and no package listed” is currently expected from the code.
- The Early Bird special does exist in the database and should match this booking window.
- The Latter Days package stored in `amenities.packages` currently contains neither the saved discount value nor the saved applicable room IDs, which explains why it also cannot auto-apply.

2. UI fix on checkout page
File: `src/pages/Booking.tsx`
- Re-add the same promo surfacing pattern already used in `EmbedProperty.tsx` / `PropertyShowcase.tsx`:
  - announcements
  - current specials
  - packages
- Import and render:
  - `SpecialsBanner`
  - `PackageCards`
- Place them near the top of the checkout content, alongside the existing announcement block, so guests can see active offers before billing details.

3. Package auto-apply hardening
File: `src/pages/Booking.tsx`
- Keep stacked promo logic, but make package matching more defensive:
  - support both camelCase and snake_case room targeting keys
  - support package image fallback consistently
  - skip silent application when package has no persisted pricing value
- If package room targeting is empty because data failed to persist, the UI should still show the package card, but billing should only auto-apply when valid pricing and targeting data are present.

4. Package persistence fix review
File: `src/pages/PropertyForm.tsx`
- Re-check the package edit/save/load cycle around:
  - `normalizePackage`
  - edit modal hydration
  - save payload into `amenities.packages`
- Tighten normalization so these fields always survive round-trip:
  - `discountPercent`
  - `discount_percentage`
  - `applicableRoomIds`
  - `applicable_room_ids`
  - pricing mode/value fields
- Specifically guard against modal hydration or update paths overwriting saved values with empty defaults.

5. Data repair for existing Latter Days package
- After the persistence fix, re-save the package once so the stored package record actually contains:
  - the 20% value
  - the selected room IDs
- This is needed because the database snapshot currently still shows missing package pricing/room-target data, even though the admin UI has been edited before.

6. Expected outcome after implementation
For the provided Latter Days booking link:
- “Winter -15%” special is listed visibly on checkout
- “Book early for winter season -20%” package is listed visibly on checkout
- both are labeled correctly
- both are included correctly in billing when conditions match
- package image appears when one is saved
- stacked discounts remain separate and readable

Technical details
- Root issue 1: checkout page missing promo components, not just broken matching.
- Root issue 2: package record in `properties.amenities.packages` is still stored as:
  - no `discountPercent` / `discount_percentage`
  - no `applicableRoomIds` / `applicable_room_ids`
- Early Bird special currently exists and matches the property/date range:
  - `special_type = discount`
  - `discount_percent = 15`
  - `valid_from = 2026-06-01`
  - `valid_to = 2026-07-15`
  - `applicable_room_ids = [1, 1772973704081]`
- The booking URL room type is Hostfully UUID `c8253bc0-4449-422a-bf7e-b215b7aef83e`, which cross-references to amenity room `id = 1`, so the special should match once surfaced/applied correctly.
