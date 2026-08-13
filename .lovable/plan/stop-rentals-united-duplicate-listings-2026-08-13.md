# Stop Rentals United duplicate listings

## What is actually happening

The push is not "forgetting" the channel id. The channel is being told to create new listings because **ROL'OS itself holds duplicate unit rows**, and the push loops over every active row.

Verified in the database just now:

```text
Seesig Self Catering Chalets   oester      19 rows, 3 active, 6 distinct channel ids
                               witmossel   19 rows, 3 active, 5 channel ids
                               tobie       19 rows, 3 active, 5 channel ids
                               swartmossel 19 rows, 3 active, 6 channel ids
                               albatros / anemoon / duiker / seester  2 rows, 1 active
                               strandloper 1 row + "STANDLOPER" 1 inactive row
Tidal Pools                    elf / geelstert / leervis / wildeperd  8 rows, 4 active each
```

Correct inventory is 9 units in Seesig and 4 in Tidal — which matches the distinct names exactly. Every extra *active* row becomes its own channel listing on the next push, which is why the account now shows 15 and 12 listings with 12 / 8 duplicates.

Two code paths let this grow:

1. **Unit save (PropertyForm)** — when a unit has no UUID, it looks for an existing row with an exact, case-sensitive name match using `maybeSingle()`. `ALBATROS` vs `Albatros` misses, and once two rows share a name `maybeSingle()` errors and returns nothing, so the save inserts *another* row. Each save multiplies the rows.
2. **Push (push-property-to-ru)** — a unit row with no stored channel id is pushed as a create (`ru_property_id: 0`). There is no check against the account's own listing list first, so a duplicated row always mints a brand-new listing instead of matching the one that already exists by name.

A third, related defect shows in the channel log: **every** content push currently gets rejected once with status 92 "Duplicate value in distances." and then succeeds on the automatic retry. On updates that is only noise, but on a create the first attempt may already have registered a listing, so the retry can leave a second one behind.

## The fix

### 1. Collapse the duplicate unit rows (data repair)

Pick one canonical row per property + normalised (lower/trimmed) unit name — preferring the active row that already carries a channel id and the most recent content — then:

- move any bookings, room mappings, image tags and rate-plan links from the losing rows onto the canonical row,
- keep the losing rows' channel ids in a repair record so the surplus listings can be cleaned on the channel,
- delete the losing rows.

### 2. Make duplicates impossible

- Add a unique index on `hostfully_room_types (property_id, lower(trim(name)))` so no path can ever create a second row for the same unit name.
- Rewrite the unit save so it matches on the normalised name, tolerates existing duplicates instead of erroring, and never inserts when any row matches.

### 3. Make the push idempotent

- Before any create, read the owner account's own listing list (`Pull_ListOwnerProp_RQ`) and match the unit by name. If a listing already exists, adopt its id, store it, and push as an **update** — never a create.
- Persist the returned channel id immediately after a successful create, before ARI is attempted, so an ARI failure can never leave an unlinked listing behind.
- Never blind-retry a create at transport level: on a transport failure during a create, re-read the account listing list and adopt the id if the listing landed.
- Fix the distances block so status 92 stops firing (dedupe by destination *and* value before building the XML, drop the block entirely when fewer than two usable entries remain), and if a create returns 92 with an `<ID>`, adopt that id instead of retrying as a new create.

### 4. Clean up the surplus listings on the channel

Extend the existing Channel reconciliation panel so the surplus ids from step 1 are cleaned in one action: listings with no reservations are removed; anything with reservation history is archived rather than deleted, and reported. Target end state is 9 live listings for Seesig and 4 for Tidal Pools, with billing counts matching.

### 5. Guard against a repeat

- Automatic delta pushes for a property are paused while its unit rows fail the "one row per unit name" check, with the reason shown in the channel panel.
- The Channel Monitor duplicate counter turns into an actionable warning (which unit names are duplicated locally) rather than just a number.

## Technical notes

- Data repair and the unique index ship as a migration; the row-merge runs before the index is created.
- `src/pages/PropertyForm.tsx`: normalised-name lookup, remove `maybeSingle()` fragility on the unit upsert path.
- `supabase/functions/push-property-to-ru/index.ts`: add an "adopt existing listing by name" resolver used by both the standalone-unit and building/unit paths before any `ru_property_id: 0` call; persist ids ahead of ARI.
- `supabase/functions/rentalsunited-api/index.ts` and `_shared/ruDistances.ts`: value+destination dedupe, drop-block threshold, adopt `<ID>` from a status-92 create response.
- `supabase/functions/_shared/ruInvokeRetry.ts`: creates are excluded from blind transport retries.
- Reconciliation cleanup reuses the existing `Push_DeleteProperty_RQ` / archive flow in the Channel Monitor.
