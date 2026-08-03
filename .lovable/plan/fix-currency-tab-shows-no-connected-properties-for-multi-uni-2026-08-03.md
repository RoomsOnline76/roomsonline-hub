# Fix: Currency tab shows "no connected properties" for multi-unit pushes

## What's wrong

Tidal Pools pushed successfully, but it is a **multi-unit** property. On a multi-unit push the Rentals United IDs are stored per unit, not on the property:

```text
properties.rentalsunited_property_id      = (empty)
properties.rentalsunited_building_id      = 48103
hostfully_room_types.rentalsunited_property_id = 5655615 / 5655616 / 5655617 / 5655618
```

The Currency tab (and the currency refresh/reconcile jobs behind it) decide "is this property on Rentals United?" by looking **only** at `properties.rentalsunited_property_id`. Tidal Pools has no value there, so it is filtered out of the list — even though its currency decision was already recorded (location 83272, publishing in ZAR, `already_set`).

Single-unit properties are unaffected; every multi-unit property is invisible here.

## The fix

Change the connected-property test everywhere currency work runs, from a single-column check to: the property has an RU property ID **or** an RU building ID **or** at least one unit with an RU property ID.

1. **Currency tab list** — load candidate properties plus their unit RU IDs, then keep any property that is connected by any of the three signals. Show a small badge on multi-unit rows ("Building 48103 · 4 units") so it is clear which listing form the property takes.
2. **Currency refresh / reconcile job** — apply the same widened filter when it selects properties to act on, so multi-unit properties are actually reconciled and not just displayed.
3. **Empty state** — when nothing matches, say why (no property pushed to Rentals United yet) rather than an unqualified "no connected properties".

## Verification

After the change, the Currency tab should list Tidal Pools with location 83272, authored ZAR, published ZAR, conversion off — matching the row already stored — and a dry-run reconcile scoped to it should return a result instead of an empty set.

## Technical notes

- Frontend: `src/components/integrations/RuCurrencyPanel.tsx` — replace the `.not("rentalsunited_property_id", "is", null)` query with a fetch of `id, name, country, rentalsunited_property_id, rentalsunited_building_id` joined against `hostfully_room_types(rentalsunited_property_id, is_active)`, then filter client-side.
- Edge function: `supabase/functions/push-property-to-ru/index.ts` — the `refresh_ru_location_currencies` and `reconcile_ru_location_currency` branches (both currently filter on `rentalsunited_property_id`) get the same widened selection; redeploy after the change.
- No schema change and no data change required.
