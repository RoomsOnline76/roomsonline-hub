

# Plan: Bidirectional Sync Between Edit Property and PMS Rate/Room Data

## Problem Summary

The Edit Property form stores rate data in `amenities.pms_rate_types` (JSONB) with `baseRate` values, but:
1. The sync to `rolos_rate_plans` only writes name/code/min_stay — NOT the base rate amount
2. `rolos_rate_plans` has no `base_rate` column at all
3. The Dungeon room's `default_rate` in `rolos_room_types` is null despite a "Per Person" rate of R650 being configured
4. PMS Rate Plans page shows "configure rate amount" because it has no price data
5. PMS Dashboard calendar falls back to `rolos_room_types.default_rate` — missing for Dungeon
6. PMS edits (rate plans, room types) never write back to `amenities`

## Architecture

```text
EDIT PROPERTY (source of truth if PMS has no data)
  amenities.pms_rate_types[].baseRate ──┐
  amenities.room_types[].baseRate  ──┐  │
                                     │  │
    ┌────────────────────────────────┘  │
    ▼                                   ▼
rolos_room_types.default_rate    rolos_rate_plans.base_rate (NEW COLUMN)
    ▲                                   ▲
    │                                   │
PMS Room Types page ◄──────────── PMS Rate Plans page
    │                                   │
    └───────────── writes back ─────────┘
                      to amenities
```

## Implementation Steps

### 1. Database Migration — Add `base_rate` column to `rolos_rate_plans`

```sql
ALTER TABLE public.rolos_rate_plans ADD COLUMN IF NOT EXISTS base_rate numeric DEFAULT 0;
```

This stores the actual rate amount alongside the plan metadata.

### 2. Fix PropertyForm Save Sync (PropertyForm.tsx)

**Rate plans sync** (~line 3964-4005): Include `baseRate` in the `ratePlanData` payload:
```
base_rate: rateType.baseRate || 0,
```

**Room types sync** (~line 3879-3961): When syncing rooms, also write the baseRate from linked pms_rate_types to `rolos_room_types.default_rate` for rooms that currently have null. Specifically for the Dungeon case: find the linked rate type for each room and write its baseRate as default_rate.

**Room-rate link sync**: After creating rate plans, auto-create `rolos_rate_plan_room_types` entries based on room `linkedRateTypes` in amenities data. Currently this only happens when saving in PMS Rate Plans dialog.

### 3. Fix PMS Rate Plans Page (PMSRatePlans.tsx)

**Fetch base_rate**: Add `base_rate` to the select query and display it in the UI cards.

**Save base_rate**: Add a base_rate input field in the create/edit dialog. On save, include `base_rate` in the payload.

**Write-back to amenities**: When a rate plan is saved in PMS, update `amenities.pms_rate_types` for the matching rate type (match by name or code).

### 4. Fix PMS Room Types Page (PMSRoomTypes.tsx)

**Write-back to amenities**: When `default_rate` is edited in PMS Room Types, update the matching entry in `amenities.room_types[].baseRate` and the linked entry in `amenities.pms_rate_types[].baseRate`.

### 5. Fix PMS Dashboard Calendar Rate Display (PMSDashboard.tsx)

**Enhance `getRateForDate`** (~line 412-422): After checking seasons/prices, if no rate found, also check `rolos_rate_plans.base_rate` for linked plans before falling back to `rolos_room_types.default_rate`. Fetch rate plans with base_rate in the query.

### 6. Fix PMS Rate Plans Auto-Sync on Page Load (PMSRatePlans.tsx)

Add an auto-sync similar to what PMSRoomTypes does: on load, read `amenities.pms_rate_types` and upsert missing rate plans into `rolos_rate_plans` with their `base_rate`. This ensures rate plans appear without requiring a manual save in Edit Property first.

### 7. Auto-link rate plans to room types on sync

When auto-syncing rate plans from amenities, also create `rolos_rate_plan_room_types` entries based on `amenities.room_types[].linkedRateTypes` mapping to the synced rate plan IDs.

## Files Modified

| File | Change |
|------|--------|
| **DB Migration** | Add `base_rate` column to `rolos_rate_plans` |
| `src/pages/PropertyForm.tsx` | Write `base_rate` in rate plan sync; write `default_rate` for rooms from linked rate; auto-create rate-room links |
| `src/pages/pms/PMSRatePlans.tsx` | Fetch/display/edit `base_rate`; auto-sync from amenities on load; write-back to amenities on save |
| `src/pages/pms/PMSRoomTypes.tsx` | Write-back `default_rate` changes to amenities |
| `src/pages/pms/PMSDashboard.tsx` | Fetch rate plan `base_rate`; use as fallback in `getRateForDate` |

## Conflict Rule

Last save wins — whichever screen (Edit Property or PMS) saves most recently writes its values to both the PMS tables and the amenities JSONB.

