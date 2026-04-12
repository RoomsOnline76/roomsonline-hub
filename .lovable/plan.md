

## Plan: Fix Push_PutProperty_RQ and Add Automation

### Problem Summary
The Push_PutProperty_RQ function has several data mapping issues causing incomplete/incorrect pushes to Rentals United. Additionally, the push is not automated (no cron, no auto-push on save).

### Data Issues for Fonteinhutte
- `max_guests` is 2 in DB but should be 46 (sum across 6 room types, each sleeps 6)
- Cancellation policy from `amenities.cancellation_policies` is ignored; a hardcoded default is used instead
- `DetailedLocationID` is hardcoded to `1` instead of resolved via RU location lookup
- Check-in/out times not read from `amenities.house_rules`
- Security deposit (R400) not read from amenities
- `space` (sqm) hardcoded to 50

### Implementation Steps

#### 1. Update Fonteinhutte property data in DB
- Set `max_guests` to 46 (from LekkeSlaap: "Sleeps 46 guests")
- Confirm cancellation policies already stored correctly (they are: >2mo 10% forfeit, <30 days 100% forfeit)

#### 2. Fix `push-property-to-ru` edge function mapping
- **Cancellation policies**: Read from `property.amenities.cancellation_policies` and map to RU format (days → `from_days`/`to_days`, forfeit % → `PercentPrice`). Fall back to hardcoded default only if none exist.
- **max_guests**: Use `MAX(room_type.max_guests) * count(room_types)` or sum, whichever is appropriate. If property `max_guests` is set and > 1, use it; otherwise aggregate from room types.
- **Check-in/out**: Read from `property.amenities.house_rules.check_in_from`, `check_in_to`, `check_out_to`; fall back to room type values, then defaults.
- **Security deposit**: Read from `property.amenities.banking` or room type `security_deposit`.
- **Space**: Read from property data if available, default to 50.
- **DetailedLocationID**: Add a step that calls `rentalsunited-api` with action `get_location_by_coordinates` using property lat/lng. Cache the result. If lookup fails, fall back to `1`.

#### 3. Add `get_location_by_coordinates` action to `rentalsunited-api`
- Implement `Pull_GetLocationByCoordinates_RQ` XML builder
- Returns the RU LocationID for given lat/lng coordinates

#### 4. Auto-push on property save
- In `PropertyForm.tsx`, after the successful `.update()` call (line ~2942), if the property has a `rentalsunited_property_id`, fire-and-forget invoke `push-property-to-ru` (non-blocking, no dry_run).
- Show a subtle toast: "Syncing to Rentals United..."

#### 5. Weekly cron job
- Create a new edge function `cron-push-all-properties-to-ru` that queries all properties with `rentalsunited_property_id IS NOT NULL`, then invokes `push-property-to-ru` for each.
- Set up a `pg_cron` job to run it weekly (every Sunday at 02:00 UTC).

### Technical Details

**Cancellation policy mapping** (from DB format to RU XML):
```
DB: [{days: 999, forfeit: 10, type: "% of Total"}, {days: 30, forfeit: 100, type: "% of Total"}]
→ RU: 
  - Rule 1: from_days=0, to_days=30, percentage=100 (forfeit 100% if <30 days)
  - Rule 2: from_days=31, to_days=60, percentage=50 (forfeit 50% if 30-60 days)  
  - Rule 3: from_days=61, to_days=365, percentage=10 (forfeit 10% if >60 days)
```

**Files to modify:**
- `supabase/functions/push-property-to-ru/index.ts` — fix data mapping
- `supabase/functions/rentalsunited-api/index.ts` — add `get_location_by_coordinates` action
- `src/pages/PropertyForm.tsx` — add auto-push after save
- New: `supabase/functions/cron-push-all-properties-to-ru/index.ts`
- DB: Update Fonteinhutte `max_guests` to 46; add pg_cron schedule

