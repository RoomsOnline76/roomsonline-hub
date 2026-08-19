# Calendar shows three rate types when the property has one

## What is wrong

RU Test Clone A has exactly one rate plan in ROL'OS Rate Plans: **Rack** (per unit, base 1000). The Calendar's Rate Types filter offers three: **Rack**, **Standard Rate** and **Mosselkraker** — and every rate row is labelled "Standard Rate PER ROOM" instead of "Rack".

Confirmed causes (verified against the property's stored data):

1. The booking orchestrator publishes native ROL'OS nightly prices under an invented identity — id `rolos-rate`, name `Standard Rate` — instead of the real rate plan's id and name. The Calendar overlays those prices, so the only rate with money on it is called "Standard Rate".
2. The property's legacy room records still link to rate-type ids that no longer exist (`wizard-rate-*`, `9cc07b7e…`, `38d6a957…`). When none resolve, the Calendar falls back to labelling the rate after the room itself, which is where **Mosselkraker** comes from.
3. The real plan, **Rack**, is listed from the saved legacy rate-type copy but marked as having no rates, because no rate on the grid carries its id.

## The fix

**1. Publish the real rate plan identity (backend)**

In the native ROL'OS branch of the booking orchestrator, emit the resolved rate plan's own id and name (`Rack`) plus its canonical pricing model, instead of the hardcoded `rolos-rate` / `Standard Rate`. Keep `Standard Rate` only as a last-resort label when no plan can be resolved. The wizard-fallback branch keeps its own `wizard-rate` identity, since no plan exists there.

**2. Make Rate Plans the only source of rate types on the Calendar (frontend)**

For native ROL'OS properties, build the Rate Types list from the property's active rate plans (id + name) rather than from the legacy saved rate-type copy, and:
- drop the "label the rate after the room" fallback, so no room name can ever appear as a rate type;
- keep the "only rate types with data are pre-selected" behaviour, which will now select Rack because the overlay carries its id;
- de-duplicate strictly by rate plan id.

Non-native (external PMS) properties keep today's behaviour untouched.

**3. Clear the dead links**

The stale `wizard-rate-*` / orphaned uuid entries in the property's room records are what forced the room-name fallback. Once step 2 lands they are no longer read on the Calendar; leave the stored data alone in this change so nothing else that reads it is disturbed, and revisit pruning separately if you want the records tidied.

## Result

The Rate Types filter for RU Test Clone A shows a single entry, **Rack**, pre-selected, and each unit's rate row reads "Rack PER ROOM" with the resolved nightly price.

## Technical detail

- `supabase/functions/booking-orchestrator-api/index.ts` — native synthetic `rate_types[0]` gains the plan's `rate_type_id` / `rate_type_name` / price type from the already-resolved plan record.
- `src/pages/CalendarAccommodation.tsx` — `rateTypeOptions` gains a native path sourced from `rolos_rate_plans`; the orphan branch stops using `room.name` as a rate type name; the live overlay keeps whatever identity the orchestrator now sends.
- No schema changes, no data migration.
