

# Phase 6: Isolate AI Concierge from PMS Logic

## Problem

`ai-booking-concierge/index.ts` (1,012 lines) contains **direct PMS adapter switching** in `fetchLiveAvailability()` (lines 244–277) — a `switch` on `externalSystem` calling `hostfully-api`, `benson-api`, `hotelbeds-api`, and falling back to cache. This duplicates the same adapter logic that Phase 2 centralized into `booking-orchestrator-api`.

The `help-assistant` edge function is a separate concern (internal docs chatbot) and is already isolated — no changes needed.

## Plan

### Step 1: Replace PMS adapter switch with orchestrator call

Rewrite `fetchLiveAvailability()` to call `booking-orchestrator-api` instead of branching per PMS. This removes ~35 lines of adapter switching and replaces with a single invocation:

```typescript
const pmsResponse = await supabase.functions.invoke('booking-orchestrator-api', {
  body: {
    property_id: propertyId,
    start_date: dates.check_in,
    end_date: dates.check_out,
  }
});
```

The response parsing (extracting room types, rates, availability) stays the same since the orchestrator returns the identical `room_types[]` shape.

### Step 2: Remove direct `properties.external_system` lookup

The function currently queries `properties` for `external_system` and `external_id` just to decide which PMS to call. Since the orchestrator handles that internally, this query can be simplified to only fetch `currency` (still needed for formatting).

### Step 3: Verify no other PMS leakage

Audit remaining code paths:
- `fetchPropertyContext()` — queries `properties` and `local_experiences` for context data (not PMS) — **clean**
- `fetchOwnerAlternatives()` — calls `fetchLiveAvailability()` recursively for cross-sell — **fixed by Step 1**
- `generateValueBasedDelight()` — queries `properties` and `local_experiences` — **clean**
- AI gateway calls (xAI/Lovable) — **clean, no PMS**

No other PMS cross-contamination exists.

## Files changed

| File | Change |
|---|---|
| `supabase/functions/ai-booking-concierge/index.ts` | Replace `fetchLiveAvailability` PMS switch with orchestrator call; simplify property query |

## What does NOT change
- `help-assistant` edge function — already isolated
- `booking-orchestrator-api` — no modifications needed
- All three frontend consumers (`AIConciergePanel`, `EmbedConciergeChat`, `TobiJourneyAssistant`) — unchanged
- AI narrative generation, delight engine, NLP parsing — untouched
- No database migrations
- No user-facing behavior changes

## Outcome
AI concierge becomes PMS-agnostic. All availability resolution flows through a single orchestrator, eliminating duplicate adapter logic and preventing future PMS changes from requiring concierge updates.

