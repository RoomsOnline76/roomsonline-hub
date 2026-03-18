

# Plan: NightsBridge-Style Embed Redesign + Review Platform Configuration

## Build Error Fix (Prerequisite)

The `ERR_MODULE_NOT_FOUND: Cannot find package 'rollup'` error is blocking the dev server. The TS type-check errors are pre-existing (the components do accept `className` — the environment's type resolution is stale). Fix: add `rollup` as a dev dependency in `package.json`.

---

## Part 1: Redesign EmbedProperty.tsx to NightsBridge-Style Layout

Referencing the uploaded NightsBridge screenshot, the embed should have these sections in order:

### Section A — Branded Header Bar
Already exists. Keep as-is (property name + logo).

### Section B — Date Picker Row + Controls
Replace current `EmbedDatePicker` pill with a **NightsBridge-style inline row**: `Check-in [DATE PICKER] – Check-out [DATE PICKER] | X NIGHTS | [CHECK AVAILABILITY] | [HIDE CALENDAR]`
- Use the existing `EmbedDatePicker` calendar dropdown but render as two separate date fields (check-in / check-out) with formatted dates like "WED 18 MAR 2026"
- Add "Check Availability" button that triggers rate fetch
- Add "Hide Calendar" / "Show Calendar" toggle

### Section C — Availability Calendar Grid (NEW — the key NightsBridge feature)
Replace the card-based room layout with a **date-column availability table**:
- **Rows** = Room types
- **Columns** = Dates (configurable: Day view with ~10 days, Week navigation with ‹ DAY ‹‹ WEEK ›› DAY ›)
- **Cells** = Rate amount (e.g., "1361.7") or "SOLD" badge (red background)
- Hover over price shows tooltip with details
- Table scrolls horizontally if needed but is designed for the visible date range
- Fetch availability from `pms_availability_cache` OR calculate from `rolos_rate_plans` + `rolos_inventory`
- Each room row has a small booking icon that links to `/booking/{slug}?roomTypeId=...&checkIn=...&checkOut=...&integration=...`

### Section D — Property Info (NightsBridge-style)
Keep existing but restructure to match screenshot:
- Left column: Hero image + thumbnail gallery (scrollable row of small images)
- Right column: "About us" description, "General facilities" list (two-column bullet points), "Contact Information" (phone + email)

### Section E — TripAdvisor Reviews (NEW in embed)
If property has `amenities.external_ids.tripadvisor_id` or `amenities.tripadvisor_id`:
- Invoke `tripadvisor-api` edge function from the embed page
- Render the same review widget as `TripAdvisorReviews.tsx` but with inline styles (embed doesn't use Tailwind)
- Show: TripAdvisor header bar, rating bubbles, review count, subratings grid, distribution bars, recent reviews

### Section F — Other Review Platforms (NEW)
If property has configured review platforms (see Part 2), show links/widgets for each:
- **Google Reviews**: Show Google star rating + review count + link to Google Maps page
- Other platforms: Show platform logo + rating + link

---

## Part 2: Review Platforms Configuration in ROL'OS PMS

### Database Change
Add `review_platforms` JSONB column to `properties` table (or store in `amenities`). Structure:
```json
{
  "platforms": [
    { "type": "tripadvisor", "id": "d123456", "enabled": true },
    { "type": "google", "place_id": "ChIJ...", "enabled": true },
    { "type": "booking_com", "url": "https://...", "enabled": true }
  ]
}
```

Store in `amenities.review_platforms` to avoid a migration — the amenities JSONB column already exists and is used for extensible config.

### UI: Add "Review Platforms" section to PMSBranding.tsx
Add a new Card section in the Branding & Stationery page:
- Title: "Review Platforms"
- Description: "Connect your review platforms to display ratings on your booking pages and embeds"
- For each platform type (TripAdvisor, Google Reviews, Booking.com):
  - Toggle to enable/disable
  - Platform-specific ID field (TripAdvisor ID, Google Place ID, Booking.com URL)
  - If TripAdvisor ID exists in `amenities.external_ids.tripadvisor_id`, auto-populate
- Save alongside existing branding config

---

## Part 3: Availability Data for Calendar Grid

The embed needs per-date, per-room availability. Two sources:

1. **`pms_availability_cache`** — for properties synced with external PMS (Benson, HotelBeds)
2. **ROL'OS native** — query `rolos_inventory` for availability counts and `rolos_rate_plans` + `rolos_rate_plan_room_types` for rates

The embed will:
1. On "Check Availability" click (or on load), fetch 10 days of data starting from check-in
2. For each room type, determine: rate per night and whether units are available (inventory > 0)
3. Display rate or "SOLD" accordingly

---

## Files Summary

| File | Action |
|------|--------|
| `package.json` | **Edit** — add `rollup` to devDependencies |
| `src/pages/EmbedProperty.tsx` | **Rewrite** — NightsBridge-style layout with calendar grid, property info, reviews |
| `src/components/embed/EmbedDatePicker.tsx` | **Edit** — add formatted date display mode for NightsBridge header style |
| `src/components/embed/EmbedAvailabilityGrid.tsx` | **Create** — date-column availability table component |
| `src/components/embed/EmbedTripAdvisorReviews.tsx` | **Create** — inline-styled TripAdvisor reviews for embed context |
| `src/components/embed/EmbedReviewPlatforms.tsx` | **Create** — renders configured review platform badges/widgets |
| `src/pages/pms/PMSBranding.tsx` | **Edit** — add Review Platforms configuration card |

