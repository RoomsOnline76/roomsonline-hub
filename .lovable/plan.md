# Plan: Show HyperGuest Hotel ID + Search on ROLOS properties

## Root cause
`src/pages/PropertyForm.tsx` (the file actually rendered for the property edit screen — not `GeneralTab.tsx`) gates the HyperGuest Hotel ID field on `selectedPMS === "hyperguest"` only. Dassiesingel stores `external_system = "roomsonline"`, so the field never renders and there is no lookup button.

## Fix (single edit, frontend only)
In `src/pages/PropertyForm.tsx` around lines 4193–4215, replace the `hyperguest`-only block with one that:

1. Renders when `selectedPMS` is `"hyperguest"`, `"rolos"`, or `"roomsonline"`.
2. Marks the input required only for `hyperguest`.
3. Adds `<HyperGuestPropertyLookup ... />` (already imported elsewhere — add import if missing) next to the input so ROLOS users can search HyperGuest by property name.
4. Shows the appropriate helper text ("Sandbox certification hotel: 19912" vs "Optional — links this ROL'OS property to a HyperGuest hotel for distribution.").
5. Keeps the existing `HyperGuestSyncReflectionButton` rendering when `propertyId && hyperguestHotelId`.

Persistence already handles `roomsonline`/`rolos` by writing to `amenities.external_ids.hyperguest_hotel_id` (lines 2919–2922) and loading from the same path (lines 2068–2070), so no backend changes are required.

## Verification
On the Dassiesingel edit screen the General tab should now display, in the PMS row:
`PMS [ROL'OS] | HyperGuest Hotel ID [____] [Search by name] (helper text) [Sync from HyperGuest]`.
