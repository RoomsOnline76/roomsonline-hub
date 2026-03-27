# Fix: Reviews Not Showing on SIX ON N Property Showcase

## Problem

The `property_review_cache` table is completely empty — no reviews have ever been synced. The property `sixonn-3` has no `review_platforms` or `external_ids` configured (no Google place_id, no TripAdvisor ID), so the sync edge function skips it entirely.

## Solution

Two things need to happen:

### 1. Configure external IDs for SIX ON N (sixonn-3)

Update the property's `amenities` JSON to include the Google Place ID and TripAdvisor ID. SIX ON N's Google Place ID needs to be looked up (or you can provide it). The sibling property `sixonn-2` already has `tripadvisor_id: 33433520` — if that's the same physical property, we copy it over.

**Migration SQL:**

```sql
UPDATE properties 
SET amenities = jsonb_set(
  jsonb_set(
    COALESCE(amenities, '{}'::jsonb),
    '{external_ids,tripadvisor_id}', '"33433520"'
  ),
  '{external_ids,google_place_id}', '"<GOOGLE_PLACE_ID>"'
)
WHERE id = '5708de74-5ed4-4520-bc52-63f19c68c47f';
```

I'll need to look up the Google Place ID for SIX ON N Cape Town (or you can provide it).

### 2. Trigger initial sync

After the IDs are configured, invoke the `sync-property-reviews` edge function for this property to populate the cache immediately (rather than waiting for the 3 AM cron).

### 3. Add admin UI for configuring review platform IDs

Currently these IDs can only be set via SQL. The PMSBranding admin page should have fields for Google Place ID and TripAdvisor ID so property managers can configure this themselves. INlclude this as a items in the onbaording wizard.

## Files


| Action    | File                                                                                    |
| --------- | --------------------------------------------------------------------------------------- |
| Migration | Update `sixonn-3` amenities with external IDs                                           |
| Invoke    | `sync-property-reviews` edge function                                                   |
| Modify    | PMSBranding admin — add Google Place ID / TripAdvisor ID fields (optional, recommended) |
