## Root cause

`pricelabs-api` push fails with "Property not found". Edge function logs show the error is thrown by `buildListingsPayload` at line 61 of `supabase/functions/pricelabs-api/index.ts`. It's not a missing row — the Supabase select references two columns that don't exist on `public.properties`:

- `currency` — does not exist
- `country_code` — actual column is `country`

The Supabase client returns an error, `data` is null, and the code throws `Property not found` for every property (not just Dassiesingel).

## Fix

In `supabase/functions/pricelabs-api/index.ts`:

1. `buildListingsPayload` — change the properties select to use existing columns:
   - drop `currency` from the select; derive currency from `pricelabs_config.currency` if present, else default to `"ZAR"`
   - replace `country_code` with `country`
   - update the `listings[].location.country` and `listings[].currency` mapping accordingly
2. Sanity-check the `rolos_reservations` select (`id, check_in, check_out, total_amount, room_type_id, status`) against the actual schema in the same pass and adjust if any column is missing, so the reservations push doesn't fail next.

No frontend or DB schema changes needed.
