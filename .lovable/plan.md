

# Fix Hostfully API Key Validation Using Stale Environment

## Problem Identified

When adding a new Hostfully client on the AdminUsers page (`/admin-keys`), the API key validation fails because it uses a **stale environment value** instead of the currently-toggled production environment.

### Root Cause

The `OwnerPMSConnectionCard` component has a race condition:

| Component State | Tracker DB Value | What Gets Sent to Edge Function |
|-----------------|------------------|----------------------------------|
| Initial: `'sandbox'` (line 60) | Was `sandbox` when mounted | `environment: "sandbox"` |
| After toggle: still `'sandbox'` | Updated to `production` | `environment: "sandbox"` (stale!) |

The component fetches the environment once on mount via `useEffect(() => {...}, [])`. When you toggle the environment on the same page, the other mounted `OwnerPMSConnectionCard` instances don't refresh their state.

### Evidence from Logs

```
15:35:31Z - PATCH pms_tracker_status → active_environment = "production"
15:35:38Z - Edge function receives: environment: "sandbox" ← STALE!
15:35:40Z - Edge function receives: environment: "sandbox" ← STALE!
```

## Solution

**Don't send the environment from the frontend at all** for API key validation. Let the Edge Function fetch the current tracker environment itself (which it already supports!).

### Change 1: OwnerPMSConnectionCard - Remove Environment Override

Remove the explicit `environment` parameter from the `validate_api_key` call. The edge function's fallback logic (lines 1292-1296) will query the tracker for the current value.

**File**: `src/components/pms/OwnerPMSConnectionCard.tsx`

**Current (line 121-127):**
```typescript
const { data, error } = await supabase.functions.invoke('hostfully-api', {
  body: {
    action: 'validate_api_key',
    api_key: apiKey,
    environment,  // ← Sending stale cached value
  },
});
```

**Fixed:**
```typescript
const { data, error } = await supabase.functions.invoke('hostfully-api', {
  body: {
    action: 'validate_api_key',
    api_key: apiKey,
    // environment is NOT sent - edge function will fetch from tracker
  },
});
```

### Change 2: OwnerOnboardingWizard - Also Remove Hardcoded Environment

The wizard currently hardcodes `environment: "production"` which conflicts with the tracker-based model. Remove it so the edge function uses the tracker.

**File**: `src/components/onboarding/OwnerOnboardingWizard.tsx`

**Current (line 96-103):**
```typescript
const { data, error } = await supabase.functions.invoke("hostfully-api", {
  body: {
    action: "validate_api_key",
    api_key: hostfullyApiKey.trim(),
    environment: hostfullyEnvironment,  // ← Hardcoded "production"
  },
});
```

**Fixed:**
```typescript
const { data, error } = await supabase.functions.invoke("hostfully-api", {
  body: {
    action: "validate_api_key",
    api_key: hostfullyApiKey.trim(),
    // environment is NOT sent - edge function will use tracker
  },
});
```

### Change 3: Remove Unused Environment Code

Since we're no longer using the environment state in `OwnerPMSConnectionCard`, we can also remove:
- The `trackerEnvironment` state variable (line 60)
- The `useEffect` that fetches it (lines 63-76)
- The `environment` constant (line 79)

However, keep the tracker fetch if it's used elsewhere in the component (e.g., for display or other API calls). If only used for validation, it can be fully removed.

## Technical Details

### Why This Works

The edge function already has robust fallback logic:

```typescript
// supabase/functions/hostfully-api/index.ts lines 1292-1296
let environment = body.environment;
if (!environment) {
  environment = await getTrackerEnvironment(supabase, "hostfully");
}
```

By not sending `environment`, the edge function will:
1. See `body.environment` is `undefined`
2. Call `getTrackerEnvironment()` which queries `pms_tracker_status`
3. Get the **current** value (`production`) not a stale cached value

### Data Flow After Fix

```text
User toggles Hostfully to Production
            │
            ▼
pms_tracker_status.active_environment = 'production'
            │
            │ (No more caching issue!)
            ▼
User tries to validate real client API key
            │
            ▼
┌─────────────────────────────────────────────────────────┐
│ Frontend sends:                                         │
│   { action: "validate_api_key", api_key: "FzNl..." }    │
│   (NO environment parameter)                            │
└─────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────┐
│ Edge function:                                          │
│   if (!body.environment) {                              │
│     environment = getTrackerEnvironment()               │
│     → queries DB → returns 'production'                 │
│   }                                                     │
└─────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────┐
│ Validates against:                                      │
│   https://api.hostfully.com/api/v3/agencies             │
│   (PRODUCTION endpoint!)                                │
└─────────────────────────────────────────────────────────┘
            │
            ▼
    ✓ API key validated successfully
```

## Files Modified

| File | Changes |
|------|---------|
| `src/components/pms/OwnerPMSConnectionCard.tsx` | Remove `environment` parameter from `validate_api_key` call |
| `src/components/onboarding/OwnerOnboardingWizard.tsx` | Remove `environment` parameter from `validate_api_key` call; remove unused `hostfullyEnvironment` constant |

## Expected Result

After this fix:
1. Switching the Hostfully environment toggle takes effect immediately
2. API key validation uses the **current** tracker environment (not a cached value)
3. Real production clients can be added without false "invalid key" errors
4. Sandbox testing still works when the toggle is set to sandbox
