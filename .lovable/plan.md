# Fix rejected changeover pushes (channel status 147)

## What the log shows

Every availability push for the affected listing is rejected:

```text
Push_PutAvbUnits_RQ -> Status ID 147
"Changeover is invalid. Use number 1, 2, 3 or 4."
```

The request XML we send contains `<C>0</C>` on some days (and `<C>3</C>` on the rest).

Root cause: we use two different code scales.

- ROL'OS internal scale (UI + `amenities.changeover` / `changeover_rules`): `0 = no arrival or departure, 1 = arrival only, 2 = departure only, 3 = both`.
- Channel wire scale: `1 = arrival and departure, 2 = arrival only, 3 = departure only, 4 = neither`.

So `0` is illegal on the wire (the rejection), and the days that *were* accepted were published with the wrong meaning: our default `3` ("both") lands on the channel as "departure only". The read-back calendar confirms `Changeover=3` stored for every open day.

## Fix

1. Add a single translation layer in the shared channel helpers:
   - `toWireChangeover(internal)` : `0->4, 1->2, 2->3, 3->1`, anything unknown/null -> `1` (arrival and departure).
   - `fromWireChangeover(wire)` : inverse, for read-backs.
2. Apply `toWireChangeover` in the availability XML builder (the only place `<C>` is written) so no caller can emit a raw internal code. Keep the internal scale everywhere else, so the UI, the readiness gate and the stored rules stay unchanged.
3. Translate the calendar read-back with `fromWireChangeover` before the post-push verification compares requested vs returned, so verification stops reporting false or masked mismatches.
4. Re-push availability for the affected listing's units and confirm status 0 plus a read-back where open days come back as "arrival and departure" (and any authored no-changeover day as `4`).

## Technical notes

- Wire mapping helpers: `supabase/functions/_shared/` (next to the existing availability parsing helper), imported by both the API layer and the push function.
- `<C>` emission: `buildPushAvailabilityXml` in `supabase/functions/rentalsunited-api/index.ts` (its `1..4` comment is already correct; the value passed in is not).
- Read-back parse: `parse...Calendar` in `supabase/functions/_shared/ruAvailabilityParsing.ts`; verification comparison in `push-property-to-ru/index.ts` (changeover mismatch check).
- No database or UI change; `CHANGEOVER_CODES` in `src/config/channelPropertyTypes.ts` keeps its current `0..3` values and labels.
