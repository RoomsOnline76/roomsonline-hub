

## Plan: Fix Smart Button URL, Improve Direct Link Description, Brand-Style Embeds

### 1. Smart Button — Fix incorrect URL

**Problem:** `SmartBookButtonGenerator.tsx` line 55 uses `${PRODUCTION_DOMAIN}/book/${property.slug}` which points to `https://sleepinafrica.roomsonline.co.za/book/...` (admin domain, wrong path).

**Fix:** Use the canonical booking URL from config: `${PUBLIC_DOMAIN}/booking/${property.slug}?source=website&integration=smart_button&property_id=${property.id}` — matching the `getBookingUrl()` helper pattern, plus tracking params.

Also add tracking params so Smart Button bookings are attributed correctly.

---

### 2. Direct Link — Improve description and owner guidance

Update `DirectLinkTab.tsx` description and "How to use" section:

- Clarify the route: "This link directs guests to the Sleeping In Africa booking portal. They will be redirected to your property's booking page where they can select rooms and complete their reservation."
- Add commission note: "Bookings made through this link incur the commission percentage as specified in your property agreement."
- Keep the same URL structure (it's correct: `book.sleepinafrica.roomsonline.co.za/property/{slug}`).

---

### 3. Widget / Booking Bar / Full Embed / WordPress — Property brand colors in embed URLs

**Current state:** Embed URLs don't pass brand colors. The snippets use generic styling.

**Fix:** Pass the property's brand color as a URL parameter (`&brand_color=`) in all embed URLs so the iframe content can render in the property's palette. Also update the generated snippet styles to use the property's `brand_primary_color` instead of hardcoded `#e91e63`.

For each component:
- **WidgetTab**: Add `&brand_color=${encodeURIComponent(color)}` to embed URL. Update iframe `box-shadow` and wrapper styling to reference property color.
- **BookingBarTab**: Same brand_color param. Update the bar style to use property color for the background accent.
- **FullEmbedTab**: Accept `brand_primary_color` in props, pass to embed URL.
- **WordPressTab**: Accept `brand_primary_color` in props, pass in shortcode as `color` attribute and in the PHP embed URL param.

Add a cost/commission info box to all embed tabs: "Bookings through this widget use the ROL'OS platform. The platform fee is as per your property agreement — no additional integration costs."

Style the info/description sections to reference NightsBridge-style clean iframe approach: full-width, borderless, with the property's brand color as the accent.

---

### Files to modify

| File | Change |
|------|--------|
| `src/components/integrations/SmartBookButtonGenerator.tsx` | Fix URL to use `PUBLIC_DOMAIN + /booking/` with tracking params |
| `src/components/integrations/DirectLinkTab.tsx` | Rewrite description with booking portal route explanation and commission note |
| `src/components/integrations/WidgetTab.tsx` | Add brand_color to embed URL, use property color in snippet styles, add commission info |
| `src/components/integrations/BookingBarTab.tsx` | Add brand_color param, use property color in bar accent, add commission info |
| `src/components/integrations/FullEmbedTab.tsx` | Accept brand_primary_color prop, pass to embed URL, add commission info |
| `src/components/integrations/WordPressTab.tsx` | Accept brand_primary_color prop, pass color in shortcode/URL, add commission info |

