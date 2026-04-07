

# Phase 2: Create `booking-orchestrator-api` Edge Function — Enforce Adapter Pattern in Booking Flow

## Current State

`Booking.tsx` (3,191 lines) contains **~350 lines of direct PMS adapter switching** (lines 867–1210) that branch on `externalSystem` to call `benson-api`, `hostfully-api`, `hotelbeds-api`, `hyperguest-api`, or fall through to cache/ROL'OS/wizard synthetic rate generation. This violates the adapter pattern — the UI knows about every PMS system and duplicates logic already partly captured in `pmsLiveAvailability.ts`.

`AISearchContext.tsx` (134 lines) only calls `ai-property-search` — this is **not a PMS call** and does not belong in the booking orchestrator. It should stay as-is.

## What This Phase Does

Create a single **`booking-orchestrator-api`** edge function that the frontend calls with `(propertyId, checkIn, checkOut)`. The orchestrator:

1. Looks up the property's `external_system` from the database
2. Routes to the correct PMS adapter function internally (Benson, Hostfully, HotelBeds, HyperGuest, cache, ROL'OS rate plans, or wizard)
3. Returns a **unified ARI response** in the standard `room_types[]` contract format
4. Handles voucher validation by proxying to `validate-voucher`

The frontend becomes PMS-agnostic — it calls one endpoint and gets one response shape.

## Implementation Steps

### Step 1: Create `supabase/functions/booking-orchestrator-api/index.ts`

**Actions handled:**
- `fetch_availability` — resolves ARI from the correct PMS adapter or local data
- `validate_voucher` — proxies to existing `validate-voucher` function

**Internal routing for `fetch_availability`:**

```text
┌─────────────────────────────────────┐
│  booking-orchestrator-api           │
│                                     │
│  1. Query properties table          │
│     → get external_system,          │
│       is_rol_property, amenities    │
│                                     │
│  2. Route by external_system:       │
│     benson     → call benson-api    │
│     hostfully  → call hostfully-api │
│     hotelbeds  → call hotelbeds-api │
│     hyperguest → call hyperguest-api│
│     other/pms  → pms_avail_cache    │
│     none/rol   → rolos_rate_plans   │
│     none/wiz   → wizard synthetic   │
│                                     │
│  3. Normalize to room_types[] contract│
│  4. Return unified response         │
└─────────────────────────────────────┘
```

**Key logic moved from Booking.tsx:**
- PMS adapter dispatch (lines 867–926) — the `if/else if` chain
- ROL'OS rate plan resolution (lines 969–1076) — querying `rolos_rate_plan_room_types` + `rolos_rate_plans`
- Wizard synthetic availability (lines 1080–1204) — season/rate resolution from `amenities` JSONB
- Cache-based availability (lines 928–950) — `pms_availability_cache` query
- Embed-rate fallback (lines 1221–1245)
- Manual availability blocks from `property_availability` (lines 1093–1112)

**What stays in Booking.tsx:**
- SessionStorage preload check (lines 845–865) — client-side optimization
- Cost calculation from the unified `room_types[]` response (lines 1214+)
- Booking creation mutation (lines 2060+)
- Payment gateway routing
- All UI rendering

### Step 2: Update `Booking.tsx` — Replace PMS switch with single orchestrator call

Replace the ~350-line PMS switch block (lines 867–1210) with:

```typescript
const { data, error } = await supabase.functions.invoke("booking-orchestrator-api", {
  body: {
    action: "fetch_availability",
    property_id: property.id,
    start_date: checkIn,
    end_date: checkOut,
    embed_rate: embedRate || undefined,
    embed_room_type_id: preSelectedRoomTypeId || undefined,
    embed_pricing_model: embedPricingModel || undefined,
    embed_linked_rolos_id: embedLinkedRolosId || undefined,
  },
});
if (error) throw error;
availability = data?.data || data;
```

Also replace the voucher call (line 1800) to route through the orchestrator:
```typescript
const { data, error } = await supabase.functions.invoke("booking-orchestrator-api", {
  body: {
    action: "validate_voucher",
    code: voucher.trim(),
    property_id: property.id,
    subtotal: accommodationSubtotal,
  },
});
```

### Step 3: Update `supabase/config.toml`

Add:
```toml
[functions.booking-orchestrator-api]
verify_jwt = false
```

`verify_jwt = false` because the booking/checkout flow is used by unauthenticated guests.

### Step 4: Update `pmsLiveAvailability.ts` (optional consolidation)

The existing `fetchLiveRates()` in `pmsLiveAvailability.ts` duplicates the same PMS routing logic for the portfolio showcase context. After the orchestrator exists, this file can be updated to call the orchestrator instead of maintaining its own adapter switch. This is a low-risk follow-up and can be done in the same step.

## What does NOT change

- `AISearchContext.tsx` — not a PMS call, stays as-is
- Booking creation/payment mutation in `Booking.tsx`
- All existing PMS adapter edge functions (`benson-api`, `hostfully-api`, etc.)
- `push-booking` and payment ITN flows
- `validate-voucher` edge function (orchestrator proxies to it)

## Files changed

| File | Change |
|---|---|
| `supabase/functions/booking-orchestrator-api/index.ts` | **New** — unified ARI + voucher orchestrator |
| `src/pages/Booking.tsx` | Remove ~350 lines of PMS switch; replace with single orchestrator call |
| `supabase/config.toml` | Add `booking-orchestrator-api` entry |
| `src/lib/pmsLiveAvailability.ts` | Optional: redirect to orchestrator instead of maintaining parallel adapter switch |

## Risk mitigation

- The orchestrator returns the exact same `room_types[]` shape that the current PMS calls return — no downstream calculation changes
- SessionStorage preload remains client-side and is checked **before** calling the orchestrator, preserving the optimization
- Embed-rate fallback parameters are passed through to the orchestrator, maintaining backward compatibility with widget/embed flows

