
## Scope
`src/pages/PropertyForm.tsx` → General tab (lines ~4239–4379). No DB/schema changes; hidden IDs stay preserved in state and continue to save.

## 1. Park HyperGuest UI
- Remove/hide the entire HyperGuest block (label + input + `HyperGuestPropertyLookup` + hint + `HyperGuestSyncReflectionButton`), i.e. lines 4239–4272.
- Wrap it in `{false && (...)}` (or a `const HYPERGUEST_ENABLED = false` guard at the top of the file) so the code stays intact for un-parking later.
- State (`hyperguestHotelId`, save logic at lines 2841 / 2937) is untouched — the stored value is preserved on save.
- Note: users with `selectedPMS === "hyperguest"` can no longer set the ID via the UI. Acceptable since HG is parked; existing values pass through save.

## 2. Hide Beds24 lookup + ID
- Hide the Beds24 block (lines 4274–4305) using the same `false && (...)` (or shared `BEDS24_ENABLED = false`) guard.
- State (`beds24PropertyId`) and save path remain wired.

## 3. Google Place ID: paste-URL extractor
Add a small **Paste Google URL** button next to the Google ID input (line 4378 area) and enrich the tooltip with copy-the-URL instructions.

### Behaviour
1. Button opens a `Popover` (or inline dialog) containing:
   - Textarea prefilled from `navigator.clipboard.readText()` on open (best-effort; ignore denial).
   - **Instructions** (numbered):
     1. Open [google.com/maps](https://www.google.com/maps) and search your property.
     2. Click the result so the property panel opens on the left.
     3. Copy the full URL from the browser address bar (it contains `!1s0x…` or `place_id=`).
     4. Paste it here.
   - **Extract** button — runs the regex chain below.
   - **Cancel** button.
2. On Extract, run in order and use the first match:
   - `place_id=([^&#]+)` (explicit Places API URL)
   - `!1s(ChIJ[^!]+)` (canonical URL, ChIJ token)
   - `/place/[^/]+/data=[^!]*!1s(0x[0-9a-f]+:0x[0-9a-f]+)` (hex CID pair — accepted as-is; the review-sync edge function already normalises hex CIDs)
   - `/@[-0-9.]+,[-0-9.]+,[0-9.]+z/data=[^!]*!1s(0x[0-9a-f]+:0x[0-9a-f]+)`
3. On success: `setGooglePlaceId(match)` + `setIsDirty(true)`, close popover, toast "Google Place ID captured".
4. On failure: toast "Couldn't find a Place ID in that URL — open the place page in Google Maps first, then copy the address bar URL." Keep popover open.

### Tooltip expansion
Replace the current single-line tooltip content with a short list:
- "Google Place ID (used for reviews & Maps embed)."
- "How to get it: open Google Maps → find your property → click the pin → copy the address bar URL → click **Paste Google URL**."

### Files touched
- `src/pages/PropertyForm.tsx` only.
- Imports already available: `Popover`/`PopoverTrigger`/`PopoverContent`, `Button`, `Textarea`, `TooltipContent`, `toast`. Verify `Textarea` and `Popover` are imported at the top; add if missing.

## Non-goals
- No shortlink (`maps.app.goo.gl/…`) resolution — those redirect server-side; if pasted, extraction fails with the guidance toast telling the user to open the link first.
- No changes to save/persistence, no DB migration, no changes to review-cache / xAI sync (they already accept both `ChIJ…` and hex CID forms).

## Verification
- General tab: HyperGuest and Beds24 rows are gone regardless of `selectedPMS`.
- Google ID row shows **Paste Google URL** button; pasting a real Maps URL (e.g. `https://www.google.com/maps/place/…/@…/data=…!1s0x1e…:0x…`) fills the field.
- Save still round-trips the existing HG/Beds24/Google values for a property that already has them.
