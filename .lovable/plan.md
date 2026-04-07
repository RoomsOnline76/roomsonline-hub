

# Phase 3: Standardize Data Model Naming + PMS Zod Schemas

## Scope Assessment

**Important clarification**: `src/integrations/supabase/types.ts` is auto-generated and already uses snake_case (matching the database). It must NOT be edited manually. The real inconsistency is at **API boundaries** — edge function request/response payloads mix camelCase and snake_case, and PMS adapter responses have no runtime validation.

Local JavaScript variables using camelCase (`propertyId`, `roomTypeId`) is standard JS convention and should NOT be changed — forcing snake_case on local vars would violate JS/TS style guides. The fix targets **API contracts** (what crosses the wire).

**8,316 matches** of `propertyId` across 199 files — bulk-renaming local vars is high-risk with no benefit. Instead, we enforce snake_case at the API boundary and validate with Zod.

## Sub-phase breakdown

### Sub-phase 3A: Create PMS Zod schemas (`src/lib/schemas/pms.ts`)
**New file** with runtime validation schemas for all PMS response shapes:

- `AvailabilityResponseSchema` — the unified `room_types[]` contract returned by `booking-orchestrator-api`
- `RoomTypeSchema`, `DailyAvailabilitySchema`, `RateTypeSchema`, `DailyRateSchema`
- `ReservationSchema` — common booking/reservation shape
- `FolioSchema`, `FolioTransactionSchema`, `PaymentSchema`, `InvoiceSchema`
- `GuestProfileSchema`
- `HousekeepingTaskSchema`
- `AdapterResponseSchema` — the wrapper `{ success, data, error, source, fetched_at, action }`

Each schema uses snake_case field names (matching the adapter contract). Exported both as Zod schemas and inferred TypeScript types.

### Sub-phase 3B: Wire Zod validation into edge function responses
Update the key orchestrator/adapter edge functions to validate outbound responses:

1. **`booking-orchestrator-api`** — parse the unified ARI response through `AvailabilityResponseSchema` before returning
2. **`benson-api`** — validate transformed response
3. **`hostfully-api`** — validate transformed response
4. **Shared helper**: Create `supabase/functions/_shared/validate.ts` with a `safeParseResponse()` utility that logs validation errors but still returns data (soft validation to avoid breaking production)

### Sub-phase 3C: Standardize edge function request payloads
Audit and fix edge functions that still accept camelCase request fields:

- `hotelbeds-api`: `startDate`/`endDate` → accept both, normalize internally to `start_date`/`end_date`
- `send-itinerary-email`: `propertyId`/`propertyName` → normalize with existing `normalizeStay()` pattern
- `booking-orchestrator-api`: already uses snake_case in request — verify and add Zod input validation

### Sub-phase 3D: Update `pmsUtils.ts` to use Zod types
Replace the `any`-typed helper functions with Zod-inferred types:
- `extractRoomTypes()` → typed with `z.infer<typeof RoomTypeSchema>[]`
- `getDailyRateValues()` → typed return
- `getDailyAvailabilityValues()` → typed return
- Keep the dual-format fallback logic (camelCase → snake_case) but type the outputs

## Files changed per sub-phase

| Sub-phase | Files | Type |
|---|---|---|
| 3A | `src/lib/schemas/pms.ts` | New |
| 3B | `booking-orchestrator-api/index.ts`, `supabase/functions/_shared/validate.ts` | New + Modified |
| 3C | `hotelbeds-api/index.ts`, `send-itinerary-email/index.ts` | Modified |
| 3D | `src/lib/pmsUtils.ts` | Modified |

## What does NOT change
- `src/integrations/supabase/types.ts` — auto-generated, untouched
- `src/types/pmsTypes.ts` — already snake_case, untouched
- Local variable naming in components — stays camelCase per JS convention
- No database migrations
- No user-facing behavior changes

## Recommended implementation order
Start with **3A** (schemas) since everything else depends on it, then **3D** (pmsUtils types), then **3B** (edge function validation), then **3C** (request normalization).

Shall I proceed with Sub-phase 3A first?

