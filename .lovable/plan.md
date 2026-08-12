# Explicit main-photo flag (channel gate #7)

Today "main photo" is implicit: at push time the **first** gallery image is emitted as `ImageTypeID=1` (Main), and nothing is stored to say which photo an owner actually chose. The two readiness checks disagree about that:

- The property editor rule requires an object-shaped `type: "hero" / is_main / is_hero` flag that our galleries (plain URL strings) never carry, so it reads permanently red ("Main photo flagged — Required") even on complete listings.
- The activation-readiness edge check counts *any* plain string as a main image, so it reads permanently green.

Certification wants one explicit main-image designation. This plan makes that flag real, stored, and used by every consumer.

## What changes for the owner

- The heart button on a gallery photo now *sets the main photo* explicitly (it no longer just reorders the gallery), and the picked photo shows a "Main" chip.
- The side-rail item "Main photo flagged" turns green only when exactly one photo carries that flag, and its error text says what is wrong ("No photo is flagged as main" / "3 photos are flagged as main — pick one").
- Existing galleries are backfilled so the first photo becomes the stored main photo — nothing that is live today regresses to red.

## Where the flag lives

Reuse the existing per-image tag map (`properties.ru_image_tags`, `hostfully_room_types.ru_image_tags`), which already stores RU photo-tag IDs per image URL. Main image = tag `1` (`RU_TAG_MAIN`) on exactly one URL. No new columns.

## Technical steps

1. **Shared helpers** in `src/lib/ruImageTags.ts` and `supabase/functions/_shared/ruImageTags.ts` (keep both copies identical):
   - `findMainImageUrl(map, urls)` — returns the single URL tagged `1` that is still in the gallery.
   - `setMainImageUrl(map, urls, url)` — strips tag `1` everywhere, adds it to `url`.
   - `mainImageState(map, urls)` → `{ url, count }` for validation messaging.
2. **Readiness rule** `hero_image` in `src/config/propertyFieldRequirements.ts`:
   - satisfied when `mainImageState(...).count === 1` (still accept legacy object-shaped `is_main`/`is_hero`/`type: "hero"` galleries);
   - `REQUIREMENT_SHORTFALLS.hero_image` reports no-images / none-flagged / multiple-flagged.
   - Requires the tag map in the requirement subject: thread `ru_image_tags` through `usePropertyReadiness` (and the room-level subject for units) so the rule can see it.
3. **Editor UI** in `src/pages/PropertyForm.tsx` (property gallery) and `src/components/property/RoomManagerTab.tsx` (unit gallery):
   - heart click calls `setMainImageUrl` on the tag-map state instead of splicing the array to index 0;
   - `RuImageTagPicker` receives `isMain` from the stored flag rather than `index === 0`;
   - deleting the main photo clears the flag (pruning already handles the map).
4. **Push path** `supabase/functions/push-property-to-ru/index.ts`:
   - `mapImages` marks the tagged URL as main, falling back to index 0 only when nothing is tagged, so the emitted `ImageTypeID=1` follows the owner's choice;
   - the Main image node is emitted for exactly one photo (unchanged for property + unit + aggregated galleries).
5. **Edge readiness** `supabase/functions/check-activation-readiness/index.ts`: replace the loose `typeof img === 'string'` pass with the same helper so UI and server agree, and keep the severity as a blocker consistent with the channel gate.
6. **Backfill migration**: for every property/room type with a non-empty gallery and no tag `1` in `ru_image_tags`, add tag `1` to the first gallery URL (JSONB update, idempotent, no schema change).

## Verification

- Re-run the readiness rail on Tidal Pools and one string-gallery property: "Main photo flagged" green after backfill, red when the flag is removed.
- Set a non-first photo as main, save, reload, confirm the flag persists and the RU differential push payload emits that URL with `ImageTypeID=1`.
