---
name: PMS Adapter Locks
description: Locked PMS adapter files/functions that require explicit user approval before any modification. Prevents silent regressions to availability/booking logic.
type: constraint
---
PMS adapter code marked with `🔒 ADAPTER LOCK` or listed in `.lovable/ADAPTER_LOCKS.md` MUST NOT be modified unless the user explicitly asks for a change to that adapter in the same message.

**Locked regions (2026-07):**
- `supabase/functions/hostfully-api/index.ts` — `handleFetchAvailability`, `fetchHostfullyUnitTypeInventory`, `mapHostfullyCalendarToAvailability`, `extractHostfullyLeads`, `DEAD_STATUSES`
- `supabase/functions/booking-orchestrator-api/index.ts` — ARI resolution + `NO_BOOKING_FROM_CACHE`
- `supabase/functions/ru-reservation-handler/index.ts`
- `supabase/functions/nightsbridge-reservations-sync/index.ts`
- `supabase/functions/beds24-api/index.ts` — `handleFetchAvailability`, `handleFetchRates`

**Invariants:**
1. Availability MUST come from each PMS's authoritative inventory surface (Rooms-to-Sell / unit-type endpoint), NEVER from summed leaf-unit calendars alone.
2. Never silently fall back to a less-authoritative surface — log and mark authority.
3. Snake_case on the wire, camelCase in TS.
4. `NO_BOOKING_FROM_CACHE` — bookings always go through live PMS verification.
5. Preserve adapter contract response shape `{ success, data, error }`.

**Why:** Regressions here caused the ONE46 ON M availability drift (2026-07): summing Hostfully leaf calendars overcounts because OTA/channel bookings held on the parent Room never flip a leaf. See `.lovable/ADAPTER_LOCKS.md` for change procedure.
