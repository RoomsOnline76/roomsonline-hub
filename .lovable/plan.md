# Nearby Attractions capture in Facilities

Property Surroundings on the Facilities tab currently only has three free-text pairs (restaurants, transport, airport). The real attractions tool (`LocalExperiencesManager`, which feeds channel Distances) exists but lives in `InfoFacilitiesTab.tsx`, which is no longer rendered anywhere — so there is no surface to capture attractions. This plan surfaces it inside Facilities and adds map search plus explicit channel destination mapping.

## What the user will see

Inside Facilities, the "Property Surroundings" card gains a **Nearby attractions** section:

1. **Search a place** — type an attraction name; suggestions come from Google Places. Picking one auto-fills the title, and the distance in km is calculated from the property's own coordinates (straight-line, one decimal, editable).
2. **Attraction list** — the existing add/edit/delete/AI-suggest manager (title, category, distance, description, why locals love it, etc.), now reachable from the property editor.
3. **Channel destination** — each attraction gets a dropdown of the channel's generic destination options (beach, museum, airport, town centre, …) loaded from the cached dictionary. Left on "Auto", the current keyword/category matching applies; set explicitly, that choice wins when the Distances block is pushed.
4. **Coverage hint** — a small line showing how many attractions currently carry a distance and will therefore push as Distances (recommended, never blocking).

The three legacy free-text pairs stay where they are; they remain the quick summary fields.

## Technical notes

- `src/pages/PropertyForm.tsx` (Facilities tab, Property Surroundings card): render a new `NearbyAttractionsPanel` that wraps `LocalExperiencesManager`, passing `propertyId`, name, city, country and the loaded `latitude`/`longitude`. Only rendered for saved properties (needs an id); show a hint to save first otherwise.
- New `src/components/experiences/AttractionPlaceSearch.tsx`: Places API (New) `AutocompleteSuggestion.fetchAutocompleteSuggestions` via `VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY` (loaded with `loading=async` + callback, following the existing map components' loader pattern), debounced input, session token. On select, fetch place location and compute haversine distance from the property coordinates.
- `LocalExperiencesManager`: accept optional `propertyLat`/`propertyLng` and a prefill from the search box; add the destination dropdown fed by a `ru_destinations` query filtered to `is_generic = true`, ordered by name.
- Migration: add nullable `ru_destination_id integer` to `public.local_experiences` (no RLS/grant change needed beyond what the table already has).
- `supabase/functions/_shared/ruDistances.ts`: prefer an explicit `ru_destination_id` on the row before falling back to `GENERIC_DESTINATION_KEYWORDS` / category fallback; behaviour unchanged when null.
- Saving an attraction keeps the existing `queueChannelContentSync` call so the change auto-pushes to the channel.
- `InfoFacilitiesTab.tsx` stays untouched (dead code, still exports `MIN_DESCRIPTION_CHARS`).
