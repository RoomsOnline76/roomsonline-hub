
# Universal Sandbox/Production Toggle for All PMS API Cards

## Problem

Each PMS API card should have a **Sandbox/Production toggle** that controls which API endpoint is used. Currently:
- Some systems have toggles (Cloudbeds, Hostfully) but stored inconsistently
- Some systems have hardcoded endpoints or no toggle at all
- Environment settings are scattered across different credential records

## Solution Overview

Add an `active_environment` column to the `pms_tracker_status` table to store the environment preference for each PMS system. This centralizes the setting at the system level (not credential level) and makes it available across all API cards.

---

## Database Changes

### Add `active_environment` column to `pms_tracker_status`

```sql
ALTER TABLE pms_tracker_status 
ADD COLUMN active_environment text NOT NULL DEFAULT 'sandbox' 
CHECK (active_environment IN ('sandbox', 'production'));

COMMENT ON COLUMN pms_tracker_status.active_environment IS 
  'Controls which API endpoint is used: sandbox for testing, production for live';
```

---

## Frontend Changes

### Part 1: Update PMSTrackerStatus Interface

Update `src/lib/pmsTrackerConfig.ts` to include the new field:

```typescript
export interface PMSTrackerStatus {
  // ... existing fields ...
  active_environment: 'sandbox' | 'production';  // NEW
}
```

### Part 2: Create Reusable Environment Toggle Component

Create a new component `src/components/pms/EnvironmentToggle.tsx`:

```typescript
interface EnvironmentToggleProps {
  systemType: string;
  currentEnvironment: 'sandbox' | 'production';
  onEnvironmentChange: (newEnv: 'sandbox' | 'production') => void;
  disabled?: boolean;
}

export function EnvironmentToggle({ 
  systemType, 
  currentEnvironment, 
  onEnvironmentChange,
  disabled 
}: EnvironmentToggleProps) {
  return (
    <div className="flex items-center justify-between p-4 rounded-lg border bg-primary/5 border-primary/20">
      <div className="space-y-1">
        <Label className="text-sm font-medium">Active Environment</Label>
        <p className="text-xs text-muted-foreground">
          API calls will use {currentEnvironment} endpoint
        </p>
      </div>
      <div className="flex items-center gap-2">
        <span className={`text-sm ${currentEnvironment === 'sandbox' ? 'font-semibold text-primary' : 'text-muted-foreground'}`}>
          Sandbox
        </span>
        <Switch
          checked={currentEnvironment === 'production'}
          onCheckedChange={(checked) => onEnvironmentChange(checked ? 'production' : 'sandbox')}
          disabled={disabled}
        />
        <span className={`text-sm ${currentEnvironment === 'production' ? 'font-semibold text-primary' : 'text-muted-foreground'}`}>
          Production
        </span>
      </div>
    </div>
  );
}
```

### Part 3: Update AdminKeys.tsx

1. **Fetch `active_environment` from tracker data:**

```typescript
const fetchTrackerData = async () => {
  const { data } = await supabase.from("pms_tracker_status").select("*");
  if (data) {
    const mapped = data.map(row => ({
      // ... existing fields ...
      active_environment: row.active_environment || 'sandbox',
    }));
    setTrackerData(mapped);
  }
};
```

2. **Create unified environment change handler:**

```typescript
const handleEnvironmentChange = async (systemType: string, newEnv: 'sandbox' | 'production') => {
  const { error } = await supabase
    .from("pms_tracker_status")
    .update({ active_environment: newEnv })
    .eq("system_type", systemType);
    
  if (error) {
    toast({ title: "Error", description: error.message, variant: "destructive" });
  } else {
    toast({ 
      title: "Environment updated", 
      description: `${systemType} now using ${newEnv} endpoint` 
    });
    fetchTrackerData(); // Refresh data
  }
};
```

3. **Add toggle to each API card:**

Replace individual environment toggles with the reusable component:

```tsx
<EnvironmentToggle
  systemType="hostfully"
  currentEnvironment={trackerData.hostfully?.active_environment || 'sandbox'}
  onEnvironmentChange={(env) => handleEnvironmentChange('hostfully', env)}
/>
```

---

## Edge Function Changes

### Part 1: Update All PMS Adapters to Read Environment from Tracker

Each edge function should:
1. Accept `environment` in request body (explicit override)
2. Fall back to `pms_tracker_status.active_environment` if not provided
3. Use environment to select the correct base URL

Example for `hostfully-api/index.ts`:

```typescript
async function getEnvironment(systemType: string, body: any): Promise<string> {
  // 1. Explicit override in request
  if (body.environment) {
    return body.environment;
  }
  
  // 2. Read from tracker status
  const { data } = await supabase
    .from('pms_tracker_status')
    .select('active_environment')
    .eq('system_type', systemType)
    .single();
    
  return data?.active_environment || 'sandbox';
}
```

Then use this in URL selection:

```typescript
const environment = await getEnvironment('hostfully', body);
const baseUrl = HOSTFULLY_URLS[environment] || HOSTFULLY_URLS.sandbox;
```

### Part 2: PMS Systems to Update

| System | Current State | Change Needed |
|--------|---------------|---------------|
| Benson | Separate credentials per env | Read `active_environment` from tracker |
| Hostfully | Toggle → `pms_credentials` | Read from `pms_tracker_status` |
| Cloudbeds | Toggle → `pms_credentials` | Read from `pms_tracker_status` |
| HotelBeds | Hardcoded test/production | Read from tracker |
| Checkfront | No toggle | Add toggle, read from tracker |
| Little Hotelier | No toggle | Add toggle, read from tracker |
| NightsBridge | Iframe-based | Add toggle for future API use |
| Rentals United | In development | Add toggle |

---

## Files Modified

| File | Change |
|------|--------|
| `supabase/migrations/` | Add `active_environment` column to `pms_tracker_status` |
| `src/lib/pmsTrackerConfig.ts` | Add `active_environment` to interface |
| `src/components/pms/EnvironmentToggle.tsx` | New reusable toggle component |
| `src/pages/AdminKeys.tsx` | Unified handler, use new toggle for all cards |
| `supabase/functions/hostfully-api/index.ts` | Read environment from tracker |
| `supabase/functions/benson-api/index.ts` | Read environment from tracker |
| `supabase/functions/cloudbeds-api/index.ts` | Read environment from tracker |
| `supabase/functions/hotelbeds-api/index.ts` | Read environment from tracker |
| `supabase/functions/checkfront-api/index.ts` | Read environment from tracker |
| `supabase/functions/little-hotelier-api/index.ts` | Read environment from tracker |
| `supabase/functions/rentalsunited-api/index.ts` | Read environment from tracker |

---

## Data Flow After Implementation

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                          AdminKeys Page                                      │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐              │
│  │  Hostfully Card │  │  Benson Card    │  │  HotelBeds Card │  ...        │
│  │  [Sandbox|Prod] │  │  [Sandbox|Prod] │  │  [Sandbox|Prod] │              │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘              │
└───────────┼─────────────────────┼─────────────────────┼─────────────────────┘
            │                     │                     │
            └─────────────────────┼─────────────────────┘
                                  │
                                  ▼
            ┌─────────────────────────────────────────────┐
            │         pms_tracker_status table            │
            │  ┌───────────────────────────────────────┐  │
            │  │ system_type │ active_environment │ ... │ │
            │  │ hostfully   │ sandbox            │     │ │
            │  │ benson      │ production         │     │ │
            │  │ hotelbeds   │ sandbox            │     │ │
            │  └───────────────────────────────────────┘  │
            └─────────────────────────────────────────────┘
                                  │
                                  ▼
            ┌─────────────────────────────────────────────┐
            │            Edge Functions                    │
            │                                              │
            │  const env = await getEnvironment(system);   │
            │  const url = BASE_URLS[env];                 │
            │                                              │
            └─────────────────────────────────────────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    ▼                           ▼
          ┌─────────────────┐         ┌─────────────────┐
          │ Sandbox API     │         │ Production API  │
          │ (test data)     │         │ (live data)     │
          └─────────────────┘         └─────────────────┘
```

---

## Implementation Priority

1. **Database migration** - Add column (required first)
2. **PMSTrackerConfig** - Update interface
3. **EnvironmentToggle component** - Create reusable UI
4. **AdminKeys.tsx** - Add unified handler and toggles to all cards
5. **Edge functions** - Update each to read from tracker (can be parallelized)

---

## Technical Notes

### Why `pms_tracker_status` instead of `pms_credentials`?

- **Single source of truth**: One row per system, not per credential
- **Consistent**: Same place where milestones and status are tracked
- **Future-proof**: Works regardless of how credentials are structured

### Backward Compatibility

Edge functions will check for explicit `environment` in request body first, allowing overrides when needed. Existing calls that pass `environment` will continue to work.

### Default Behavior

All systems default to `sandbox` until explicitly switched to `production`, ensuring safe testing by default.
