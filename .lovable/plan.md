

# Phase 0: Experience Engine Foundation

## Overview

Create the isolated experience-engine layer with two new tables, one new edge function, minor schema extensions, and shared helper functions. Everything deploys dormant behind a feature flag.

## 1. Database Migration

### New table: `rolos_policies`
```sql
CREATE TABLE public.rolos_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid REFERENCES public.properties(id) ON DELETE CASCADE NOT NULL,
  policy_type text NOT NULL,  -- 'cancellation' | 'deposit' | 'modification' | 'no_show'
  rule jsonb NOT NULL,
  is_ai_generated boolean DEFAULT false,
  last_evaluated_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(property_id, policy_type)
);
```
RLS: admins/devs/fearless_leader full access; property owners read-only on own properties.

### New table: `rolos_experience_configs`
```sql
CREATE TABLE public.rolos_experience_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid REFERENCES public.properties(id) ON DELETE CASCADE NOT NULL,
  experience_type text NOT NULL,  -- 'brand_kit' | 'guest_email' | 'guest_portal' | 'portfolio' | 'agent_command'
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(property_id, experience_type)
);
```
Same RLS pattern.

### Schema extensions
- `rolos_ui_configs` → `ALTER TABLE ADD COLUMN IF NOT EXISTS experience_engine_enabled boolean DEFAULT false`
- `pms_mappings` → `ALTER TABLE ADD COLUMN IF NOT EXISTS experience_mapping jsonb`
- `user_roles` enum → `ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'guest'`

All with `updated_at` triggers.

## 2. Edge Function: `experience-engine`

New file: `supabase/functions/experience-engine/index.ts`

Follows the exact adapter-contract pattern — imports `createSuccessResponse` / `createErrorResponse` from `_shared/adapter-contract.ts`. Accepts:
```json
{ "property_id": "uuid", "experience_type": "string", "payload": {} }
```

Routing by `experience_type`:
- `cancellation_policy` → reads `rolos_policies`, optionally calls PMS adapter for live occupancy
- `brand_kit` / `guest_email` / `guest_portal` / `portfolio` / `agent_command` → reads `rolos_experience_configs`, renders config

Guard: checks `experience_engine_enabled` on `rolos_ui_configs` for the property. Returns 403 if disabled.

Auth: validates JWT via `getClaims()` for authenticated types; public for guest-portal reads.

## 3. Shared Helpers (`_shared/`)

### `experience-helpers.ts` (new file)
Two exported functions:

**`resolveExperienceConfig(supabase, property_id, experience_type)`**
- Queries `rolos_experience_configs` for property + type
- Falls back to global default (property_id IS NULL) if no property-specific config
- Returns merged config JSONB

**`callPmsAdapterWithLiveCheck(supabase, property_id, payload)`**
- Looks up `pms_tracker_status` for property's PMS system
- Invokes the correct adapter edge function with `fetch_availability`
- Enforces NO_BOOKING_FROM_CACHE invariant — never reads from `pms_availability_cache`
- Returns live adapter response or throws with `PMS_UNAVAILABLE` error code

## 4. Manifest Updates

Update `docs/system-export/rol-system-manifest.json`:
- Add `experience_engine` to architecture section
- Add `rolos_policies` and `rolos_experience_configs` to table registry

Update `docs/system-export/data-authority-model.json` (if exists, else note in manifest):
- Policies: admin-authoritative, AI-assisted
- Experience configs: admin-authoritative

## 5. UI Toggle

In `BrandingTab.tsx` (or the relevant property form branding section), add a toggle card for "Experience Engine" that writes to `rolos_ui_configs` with `component_type = 'experience_engine'` and `experience_engine_enabled` in config JSONB. Default OFF.

## 6. PMS Tracker Update

Insert a row into `pms_tracker_status` noting "Experience Engine: Foundation" — audit trail for the new subsystem's deployment status.

## Files

| Action | File |
|--------|------|
| Migration | Create `rolos_policies`, `rolos_experience_configs`, extend `rolos_ui_configs` + `pms_mappings`, add `guest` to `app_role` |
| Create | `supabase/functions/experience-engine/index.ts` |
| Create | `supabase/functions/_shared/experience-helpers.ts` |
| Modify | `src/components/property/BrandingTab.tsx` — add Experience Engine toggle |
| Modify | `docs/system-export/rol-system-manifest.json` — register new tables + engine |
| DB Insert | `pms_tracker_status` audit row |

## Exit Criteria

All existing features unchanged. New tables empty. Edge function deployed but returns 403 for all properties (flag OFF). Toggle visible in property branding for admin/dev only.

