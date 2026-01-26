
# Fix Hostfully API Key Validation - Database + Frontend Fix

## Problem

The API key validation is STILL failing because:

1. **Database issue**: The existing `owner_pms_credentials` record has `environment: 'production'` saved
2. **Frontend logic issue**: The component prioritizes the existing credential's environment over everything else

```
Current Priority (Wrong):
1. existingCredential.environment → 'production' ← WINS but wrong!
2. Sandbox detection from name/email
3. Default to production
```

## Evidence

**Database query results:**

| Table | Column | Value |
|-------|--------|-------|
| `pms_tracker_status` | `active_environment` | `sandbox` ✅ |
| `owner_pms_credentials` | `environment` | `production` ❌ |

The frontend sees `existingCredential.environment = 'production'` and sends that to the edge function, bypassing both sandbox detection AND the tracker setting.

## Solution

### Part 1: Fix the existing credential in database

Update the owner credential to use sandbox environment:

```sql
UPDATE owner_pms_credentials 
SET environment = 'sandbox' 
WHERE owner_id = '2ac69111-5c58-453e-a635-7bd39e7fbb7a'
  AND system_type = 'hostfully';
```

### Part 2: Fix the frontend logic

Update `OwnerPMSConnectionCard.tsx` to prioritize the global tracker environment over stored credential environment for API calls:

**Current (line 62-64):**
```typescript
const isSandboxOwner = ownerName?.toLowerCase().includes('sandbox') || 
                       ownerEmail?.toLowerCase().includes('sandbox');
const environment = existingCredential?.environment || (isSandboxOwner ? 'sandbox' : 'production');
```

**Fixed - Add state to fetch tracker environment:**
```typescript
const [trackerEnvironment, setTrackerEnvironment] = useState<'sandbox' | 'production'>('sandbox');

// Fetch tracker environment on mount
useEffect(() => {
  const fetchTrackerEnv = async () => {
    const { data } = await supabase
      .from('pms_tracker_status')
      .select('active_environment')
      .eq('system_type', 'hostfully')
      .maybeSingle();
    
    if (data?.active_environment) {
      setTrackerEnvironment(data.active_environment as 'sandbox' | 'production');
    }
  };
  fetchTrackerEnv();
}, []);

// Use tracker environment as the source of truth
const environment = trackerEnvironment;
```

This ensures:
- API calls use the global tracker environment (what the toggle controls)
- New credentials are saved with the correct environment
- Existing credentials don't override the global setting

## Files Modified

| File | Change |
|------|--------|
| Database (direct update) | Fix existing credential environment to 'sandbox' |
| `src/components/pms/OwnerPMSConnectionCard.tsx` | Fetch and use tracker environment instead of credential environment |

## Data Flow After Fix

```text
User clicks "Connect" for Hostfully SandBox owner
              │
              ▼
┌─────────────────────────────────────┐
│  Fetch pms_tracker_status           │
│  active_environment = 'sandbox'     │
└─────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────┐
│  Call hostfully-api                 │
│  body.environment = 'sandbox'       │
└─────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────┐
│  Edge function uses sandbox URL     │
│  sandbox.hostfully.com/api/v3       │
└─────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────┐
│  SUCCESS! API key validated         │
└─────────────────────────────────────┘
```

## Why Previous Fixes Didn't Work

| Fix Attempt | Why It Failed |
|-------------|---------------|
| Edge function fallback | Frontend was sending `environment: 'production'` explicitly |
| Sandbox detection in frontend | Existing credential's environment overrode it |
| Tracker environment in edge function | Request body had explicit environment, so tracker was never consulted |

## Expected Result

After this fix:
1. Toggle on Integrations page controls ALL Hostfully API calls
2. Owner credentials use the global environment setting
3. The sandbox API key will validate against sandbox.hostfully.com
