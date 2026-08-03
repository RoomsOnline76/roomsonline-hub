# Image Tags for Rentals United (Property + Unit photos)

## What I verified

- We never send real tags today. In `push-property-to-ru`, `mapImages()` hardcodes `type_id: 1` for every photo, and just before the push every image is re-stamped as `type_id: index === 0 ? 1 : 3`. The XML builder in `rentalsunited-api` repeats the same fallback (`index 0 → 1`, otherwise `3`).
- So RU receives: first photo = **Main (1)**, every other photo = **Interior (3)** — which is exactly the "× main / × interior" defaults visible in the LEERVIS screenshots, and why exterior/pool/bedroom shots are mis-tagged.
- Tags are supported and are forwarded by RU to channels (Booking.com etc.). RU's official photo-tag dictionary has **210 tags**, IDs 1–210, grouped as: Main (1), Floor plan (2), Interior (3), Exterior (4), then `Activities - …` (5–53), `Dining - …` (54–79), `Exterior - …` (80–115), `Interior - …` (116–…), `Pool - …`, `Rooms - …`, `Spa - …` up to 210.
- Property photos are stored as `properties.images` (string URLs, occasionally objects) and unit photos as `hostfully_room_types.images` (string URLs). Neither carries any tag metadata, so there is nowhere for a tag to live yet.

## What to build

### 1. Tag catalogue
New `src/lib/ruImageTags.ts` + shared `supabase/functions/_shared/ruImageTags.ts` holding all 210 RU tags with id, label and group. Popular-first ordering (Main, Exterior, Interior, Bedroom, Bathroom, Kitchen, Living room, Pool, View, Floor plan) then grouped search across the full list — same UX pattern as the RU amenity picker.

### 2. Storage (non-breaking)
Migration adding a URL-keyed JSONB tag map so existing `string[]` image arrays keep working:
- `properties.ru_image_tags jsonb default '{}'`
- `hostfully_room_types.ru_image_tags jsonb default '{}'`

Shape: `{ "<image url>": [4, 83] }`. Grants + existing RLS policies apply as for other columns on these tables.

### 3. UI — tag each photo
- Property images grid (Edit Property / Setup Property → Images): each thumbnail gets a small tag chip row plus a "Tag" popover with popular-first + searchable RU tag list; multi-select, first selected tag is the primary tag. The photo set as primary keeps tag **Main** automatically.
- Unit images grid in `RoomManagerTab.tsx` → Images: identical control, saved into the room's `ru_image_tags`.
- Untagged photos show an amber "Untagged → will push as Interior" hint so the default is explicit rather than silent.
- Bulk helper: "Apply tag to selected" for fast tagging of long galleries.

### 4. Push + certification
- `mapImages()` reads `ru_image_tags` and resolves each photo's primary tag; main photo forced to 1; untagged fall back to 3 (current behaviour) instead of being overwritten.
- Remove the blanket re-stamp so resolved tags survive to the XML builder; `rentalsunited-api` emits `ImageTypeID="<resolved tag>"`. Secondary tags are emitted as additional `<Image>` nodes for the same URL (RU's XML carries one tag per node), behind a guard so we never break the ≥10-image count logic.
- RU readiness scorecard in `PushToRentalsUnited.tsx`: add an informational (non-blocking) line for "N photos untagged".

## Technical notes

- Tag IDs are RU-canonical, so no mapping table is needed for channels — RU translates to OTA tags itself.
- Tags are keyed by URL, so re-ordering, re-uploads and the room-image hero fallback stay unaffected; orphan keys are pruned on save.
- No change to image dimension/probe validation (≥1024x683 rule stays).
