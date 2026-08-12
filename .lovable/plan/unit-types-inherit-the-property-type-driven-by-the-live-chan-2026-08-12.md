# Unit types inherit the property type, driven by the live channel type list

Today each unit's **Channel property type** is a hand-picked value from a hardcoded list of 18 options in the editor, and it does not inherit anything from the property. The property's own **Type** (Identity & Location) is a separate list. This plan makes the property type the master, lets each unit override it, and replaces the hardcoded list with the type list pulled live from the channel (Rentals United).

## What changes for the user

1. **Property type is the master.** When a unit has no explicit channel type, it shows and publishes the property's type, labelled "Inherited from property type". A per-unit dropdown lets an owner change one unit without touching the rest.
2. **One list, straight from the channel.** The dropdown offers exactly the types the channel accepts, fetched from Rentals United and refreshed on demand (Refresh list button on the Rooms tab, plus a refresh in the admin channel monitor). If the list has never been pulled, the current built-in list is used as a fallback so nothing breaks.
3. **The property Type dropdown in Identity & Location uses the same channel list**, so master and unit values are always comparable and always publishable.
4. **Readiness/gate stays honest:** a unit counts as satisfied when it has an explicit mapped type *or* inherits a mapped property type. Units that inherit an unmapped property type still flag, pointing at Identity & Location.

## Technical outline

**Cache table** `ru_property_types` (mirrors the `ru_amenities` pattern): `ru_type_id int primary key`, `name text`, `slug text`, `is_active bool`, `synced_at timestamptz`. GRANTs: `select` to `authenticated` and `anon` (read-only reference data), `all` to `service_role`; RLS enabled with a read policy for authenticated + anon, writes service-role only.

**Fetch path** — add a `list_property_types` action to `supabase/functions/rentalsunited-api/index.ts` that issues `Pull_ListPropTypes_RQ` with the existing credential/auth helpers, parses `ID`/`Name` (and the ObjectType variants RU returns), and upserts into `ru_property_types` with `synced_at`. Reuse existing XML logging (`ru_api_log`) and retry helpers. No new secrets.

**Client config** — `src/config/channelPropertyTypes.ts` keeps its normalise/label/isMapped helpers and the current array as `FALLBACK_CHANNEL_PROPERTY_TYPES`. New `src/hooks/useChannelPropertyTypes.ts` reads `ru_property_types` (react-query, long stale time), falls back to the built-in list when the table is empty, and exposes `options`, `isMapped`, `label`, `refresh()`.

**Inheritance** — in `src/components/property/RoomManagerTab.tsx` the unit dropdown gains an explicit "Inherit from property (<label>)" option that stores `null` on `hostfully_room_types.property_type`, and the effective value is resolved as `unit.property_type ?? property.property_type`. `src/pages/PropertyForm.tsx` normalises on load (no more silent fallback to the PMS free-text type) and on save writes `null` for inherited units instead of a copied value.

**Push** — `supabase/functions/push-property-to-ru/index.ts` resolves each unit's type as unit → property → existing default, and maps through the RU id from `ru_property_types` when present, keeping `PROPERTY_TYPE_MAP` as the fallback for slugs not in the cache.

**Readiness** — `src/config/propertyFieldRequirements.ts` and `supabase/functions/_shared/ruReadiness.ts` treat inheritance as satisfied when the inherited property type maps, so the editor score and the server gate agree.
