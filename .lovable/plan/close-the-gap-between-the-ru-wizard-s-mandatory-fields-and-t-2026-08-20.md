# Close the gap between the RU wizard's mandatory fields and the delta-push field list

The wizard's mandatory requirements come from two places: the phase gate (`ruPhaseGate`) and the readiness scorecard (`ruReadiness`, every check flagged `mandatory: true`). The save-time delta list (`channelPushFields`) and the backend content fingerprints (`ruStaticDelta`) were grown field-by-field, so several mandatory requirements are not tracked. When one of those is edited and saved, the toast says nothing changed and — worse — the backend fingerprint hashes identical, so the push is skipped as "unchanged".

Goal: every mandatory wizard requirement is (a) named in the save-time changed-field list, and (b) part of the fingerprint that decides whether a delta is sent.

## Mandatory requirements vs. current tracking

Already tracked: name, property type, description, images + main image + photo tags, street/city/country/postal code, Channel Manager location, coordinates, max guests, bedrooms, bathrooms, amenity set, units (`amenities.room_types`, which carries beds, room size, floor, toilets, kitchen per unit), currency, seasons/rates/charges/policies, cancellation master mode, check-in/out times and arrival instructions (inside `amenities.house_rules`), company profile fields, representative nationality and country of residence.

Not tracked at save time (mandatory in the gate):

| Mandatory requirement | Where it is saved | Status |
|---|---|---|
| Number of toilets | `toilets` column | missing from delta list |
| Kitchen declared | `separate_kitchen` column | missing from delta list |
| Payment methods (≥1, authored) | `amenities.payment_methods` | missing from delta list |
| Cancellation policy (≥1, authored) | `amenities.cancellation_policies` | only master mode tracked |
| Changeover rule (authored) | `amenities.changeover`, `changeover_rules`, `changeover_by_unit` | missing from delta list |
| Property floor | `amenities.property_floor` | missing from delta list |
| Property size (Space) | `amenities.property_size_sqm` | missing from delta list |

Backend fingerprint gaps in the unit column list (`UNIT_STATIC_COLUMNS`): `currency`, `house_rules`, `extra_guest_fee`, `room_size_unit`, `total_units` (rooms-to-sell), `raw_data` (holds per-unit floor/toilet values), `address_city`, `address_country`, `min_guests`. A unit-level edit to any of these currently hashes as unchanged. (The property-level column list already includes `amenities`, so property nested edits are covered once the labels are added.)

## Changes

1. `src/lib/channelPushFields.ts` — add the seven missing field specs with operator-language labels ("toilets", "kitchen", "payment methods", "cancellation policy", "changeover rule", "floor", "property size"), all in the `content`/`rates` sections so the toast reads naturally.
2. `supabase/functions/_shared/ruStaticDelta.ts` — extend `UNIT_STATIC_COLUMNS` with the unit columns listed above so a unit-only edit changes the fingerprint. Property list stays as is.
3. Derive the delta list from one place instead of two hand-maintained lists: add a short exported mapping in `channelPushFields.ts` that names, per mandatory readiness check key, the payload path(s) that satisfy it. This gives a single table to audit and lets a test assert coverage.
4. Tests in `src/lib/__tests__/channelPushFields.test.ts`:
   - a coverage test asserting every mandatory readiness check key has at least one tracked path;
   - per-field change tests for the seven newly added fields (edit-one-field payload → expect that label reported).

## Technical notes

- No schema change, no new tables, no RLS work.
- `deriveChangedChannelFields` already dedupes by `section:label`, so adding sibling paths for one concept (e.g. three changeover paths) produces a single toast entry.
- Values that are objects (changeover rules, payment method arrays) are compared with the existing stable JSON comparison, so key order noise will not produce false positives.
- The fingerprint change means the first save after deploy on an existing property may push once even with no visible change; that is intentional and harmless (one Push_PutProperty per property).
