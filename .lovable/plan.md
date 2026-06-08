# Fix: WETU "Import from WETU" updates no fields

## Root cause

The `wetu-api` edge function (`import_to_property` action) reads top-level keys (`description`, `images`, `latitude`, `address`, `city`, `country`, `facilities`) that do **not** exist on WETU's `/Pins/{key}/Get` response. WETU's actual shape (verified live against the test key for Mount Nelson, id 1205) nests everything:

```text
{
  name, type, category, last_modified,
  position: { latitude, longitude, country, region, area, location, destination },
  content: {
    general_description, extended_description,
    contact_information: { email, telephone, website_url, address, ... },
    images: [{ url, url_fragment, label, description, width, height, ... }],
    logo, videos, panoramas
  },
  features: {
    property_facilities: [string, ...],
    room_facilities: [string, ...],
    available_services: [string, ...],
    stars, rating, check_in_time, check_out_time, spoken_languages, ...
  },
  rooms: [...], units: [...], suites: [...], ...
}
```

Because none of the legacy keys exist, every `trySet(...)` call receives `undefined` → `update` ends up with only `wetu_id` and `external_metadata`, so the UI reports "imported" while no visible fields change.

## Fix

Rewrite the field extraction in `supabase/functions/wetu-api/index.ts` (`importToProperty`) to read the correct nested keys:

| Property field | Source |
|---|---|
| `description` | `content.extended_description` ?? `content.general_description` |
| `short_description` | first ~280 chars of `general_description` (text-stripped) |
| `images` | `content.images[]` mapped to `{ url, caption: label \|\| description }`, filtered by min width/height ≥ 1024×683 (per project image rule) |
| `latitude` / `longitude` | `position.latitude` / `position.longitude` |
| `address` | `content.contact_information.address` |
| `city` | `position.area` ?? `position.location` |
| `country` | `position.country` |
| `amenities` | merge of `features.property_facilities` + `features.room_facilities` + `features.available_services` (snake_cased keys → `true`) |
| `external_metadata` | add `wetu_name`, `wetu_stars`, `wetu_check_in_time`, `wetu_check_out_time`, `wetu_contact: { email, telephone, website_url }`, plus existing `wetu_pin_id` / `wetu_last_import_at` |

Also:
- Keep `pms_managed_fields` lock + "only fill if empty" guard for non-content fields (description / images / amenities continue to overwrite).
- Skip oversized-image filter only when image array is empty after filtering (fall back to all WETU images so user still gets something rather than nothing); log a warning in the response.
- Return a richer payload: `{ success, updated_fields, skipped_fields, image_count, raw_image_count, sample_field_values }` so the UI toast can show "Updated N fields".
- No DB / schema / RLS changes. No client changes needed — the existing `GeneralTab` button already invokes `import_to_property` and toasts the result.

## Verification

1. After deploy, on `/admin/properties/...` General tab, set WETU Pin ID to `1205` and click **Import from WETU**.
2. Confirm toast shows updated fields list and description/images/amenities/lat-lng/address/city/country populate.
3. Re-import → second run skips already-filled scalar fields (address/city/country/lat/lng) and refreshes description/images/amenities.
4. Check `wetu-api` edge logs for any field that resolved to `undefined`.
