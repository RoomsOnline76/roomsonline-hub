# Static Content API Coverage — Gap Closure

## Verification against the checklist

I audited `roomsonline-pms-api`, `booking-portfolio-api`, and the `properties` / `rolos_room_types` schema. The **source data exists** for every checklist item (mostly on `properties` columns + the `properties.amenities` JSONB, plus `rolos_room_types` and `property_contact_details`), but the **API surface has gaps** and one **naming inconsistency in the public docs**.

### Coverage matrix (checklist → today's API)

| Checklist item | Source | `roomsonline-pms-api` | `booking-portfolio-api?include_static_content=true` |
|---|---|---|---|
| Property Name | `properties.name` | ✅ via `get_capabilities` / room actions | ✅ |
| Property type (apartment/villa/…) | `properties.property_type` | ❌ not returned by any get_* | ❌ not in payload |
| Location geocoordinates | `properties.latitude/longitude` | ❌ | ✅ |
| Property address line | `properties.address` | ❌ | ❌ |
| Property city | `properties.city` | ❌ | ✅ |
| Property country | `properties.country` | ❌ | ❌ |
| Zipcode / Postal code | `properties.amenities.address_details.postal_code` | ❌ | ❌ |
| Photos | `properties.images` (+ room fallback) | ❌ (property-level) | ✅ |
| Check-in & check-out time | `properties.amenities.house_rules.check_in_from/to`, `check_out_from/to`, `check_in_24h` | ❌ | ❌ |
| Amenities | `properties.amenities.facilities` (+ nested flags) | ❌ | Partial (only `space_description`, `key_highlights`) |
| Room types (bedrooms/bathrooms/kitchen) | `rolos_room_types` + `amenities.room_types[]` | ✅ `get_rolos_room_types` (name, base/max occupancy, images, amenities) — but missing bathrooms/bedConfiguration | ❌ not per-room |
| Beds compositions | `amenities.room_types[].bedConfiguration` | ❌ | ❌ |
| Cancellation policies | `rolos_policies` | ✅ `get_cancellation_policies` | ✅ |
| Payment methods | `properties.payment_providers` + registry | ✅ `get_payment_methods` | ✅ |
| Maximum number of guests | `properties.max_guests`, `rolos_room_types.max_occupancy` | Partial (per room only) | Partial (per room only) |
| Standard number of guests (base included) | `rolos_room_types.base_occupancy`, `amenities.room_types[].maxAdults` | Partial (via `get_rolos_room_types`) | ❌ |
| Arrival information & instructions | `amenities.house_rules.*` (no dedicated field) | ❌ | ❌ |
| Landlord / Reception contact details | `property_contact_details` (+ `amenities.contact`) | ✅ **but action is named `get_property_contact_details`** — public docs & TOBI advertise it as `get_contact_details` | ✅ (as `contacts`) |

### Verdict

Roughly **half the checklist is fully covered**, but the two headline gaps are:

1. **Core property profile fields** (`property_type`, `address`, `country`, `postal_code`, `check_in_time`, `check_out_time`, `arrival_instructions`, top-level `amenities`, `max_guests`, `standard_guests`) are not returned anywhere — even though the data exists on `properties` / `properties.amenities`.
2. **Naming drift**: real action = `get_property_contact_details`; public docs (`src/data/rolos-api-actions.ts`) and TOBI system prompt say `get_contact_details`. Any integrator following the docs will get "invalid action".

## What this plan changes

### 1. New API action: `get_property_profile` (roomsonline-pms-api)

Returns everything a booking flow needs to render a property page in one call, drawn from `properties` + `properties.amenities`:

```json
{
  "property": {
    "id": "...", "name": "...", "slug": "...", "property_type": "villa",
    "description": "...", "short_description": "...", "timezone": "...",
    "location": {
      "address": "...", "city": "...", "country": "...",
      "postal_code": "...", "suburb": "...",
      "latitude": -33.9, "longitude": 18.4,
      "google_maps_link": "..."
    },
    "occupancy": { "max_guests": 8, "standard_guests": 4, "bedrooms": 3, "bathrooms": 2 },
    "check_in": { "from": "15:00", "to": "20:00", "is_24h": false },
    "check_out": { "from": "06:00", "to": "11:00" },
    "amenities": ["wifi", "pool", ...],       // flattened from amenities.facilities + nested flags
    "meal_types": ["Self Catering"],
    "arrival_instructions": "...",             // amenities.house_rules.arrival_instructions (fallback to check_in copy)
    "images": [...]                            // property images; room fallback preserved
  }
}
```

### 2. Enrich `get_rolos_room_types` output

Add `bathrooms`, `bed_configuration`, `standard_occupancy`, `room_size`, `min_stay`, `max_stay` per room (join `rolos_room_types` with the matching entry in `amenities.room_types[]` by name/code). No new columns — pull from existing JSONB.

### 3. Enrich `booking-portfolio-api?include_static_content=true`

For each property in the response, add the same fields as `get_property_profile` under `profile: {...}`, plus expand room objects with `bed_configuration`, `bathrooms`, `standard_occupancy`, `max_occupancy`, `room_size`. This keeps the "one call, everything a booking flow needs" promise honest.

### 4. Add a docs-compatible alias `get_contact_details`

Register `get_contact_details` in the action dispatch as an alias of `get_property_contact_details` so both work. The public docs already advertise `get_contact_details` — this avoids a doc rewrite and keeps back-compat for the existing action name.

### 5. Documentation sync (`src/data/rolos-api-actions.ts`)

- Add `get_property_profile` and the updated `get_rolos_room_types` (bathrooms / bed_configuration / standard_occupancy) entries under the **Static Content** category.
- Keep `get_contact_details` as the documented name (backed by the new alias).
- Update the Portfolio API entry to note the new `profile` block and enriched room fields.

### 6. TOBI system prompt (`connect-assistant/index.ts`)

- Add `get_property_profile` to the Static Content action list.
- Update the "What static content can I pull?" answer to mention property_type, address/country/postal_code, check-in/out times, arrival instructions, standard vs max guests, and bed compositions.

## Technical details

- All reads are additive; no schema migrations. Everything comes from `properties` columns, `properties.amenities` JSONB (`address_details`, `house_rules`, `contact`, `facilities`, `meal_types`, `room_types`), `rolos_room_types`, and `property_contact_details`.
- `amenities` flattening rule: union of `amenities.facilities[]` (string list) with `true`-valued boolean keys under known sub-objects (e.g. `wifi`, `pool`, `parking`), de-duplicated. Unknown keys pass through as-is.
- `standard_guests` fallback order: `rolos_room_types.base_occupancy` → `amenities.room_types[].maxAdults` → `max_guests`.
- `arrival_instructions` fallback: explicit `amenities.house_rules.arrival_instructions` → composed string from `check_in_from/to` + `check_in_24h` flag.
- `get_contact_details` alias is dispatch-only (single `case "get_contact_details":` falling through to the existing handler). Action-name string in the response stays `get_property_contact_details` so telemetry is unaffected.
- No changes to the WordPress plugin or Portfolio API query params — existing `include_static_content=true` continues to be the single opt-in flag.

## Files touched

- `supabase/functions/roomsonline-pms-api/index.ts` — new `get_property_profile` handler, enriched `get_rolos_room_types`, `get_contact_details` alias.
- `supabase/functions/booking-portfolio-api/index.ts` — add `profile` block and expanded room fields when `include_static_content=true`.
- `src/data/rolos-api-actions.ts` — 1 new action entry, 1 updated entry, Portfolio API note.
- `supabase/functions/connect-assistant/index.ts` — action list + static-content Q&A.

## Out of scope

- No new database columns or migrations.
- No changes to authoring UIs (contacts/policies/payments are already manageable in ROLOS).
- No changes to booking checkout consumption or channel push.
