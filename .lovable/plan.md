
# Fix Hostfully API Key Validation - Use Tracker Environment

## Problem

When adding a Hostfully API key for an owner on the Admin Users page, the system shows **"Hostfully API key is invalid or expired"** even though the key is valid. This happens because the **sandbox API key is being validated against the production endpoint**.

## Root Cause

In `supabase/functions/hostfully-api/index.ts`, line 1220:

```typescript
const response = await handleValidateApiKey(body.api_key, body.environment || "production");
```

The fallback is **hardcoded to `"production"`**. While the frontend DOES send `environment` in the request body, the `validate_api_key` action is unique because it:
1. Is handled BEFORE the `getCredentials()` function is called
2. Does NOT read from `pms_tracker_status` like all other actions
3. Falls back to production if environment is missing or undefined

This means even when `pms_tracker_status.active_environment` is set to `sandbox`, the validation ignores it.

## Solution

Update the `validate_api_key` handler to read from `pms_tracker_status` when no explicit environment is provided, matching the behavior of all other actions.

### Code Change

Update line 1212-1224 in `supabase/functions/hostfully-api/index.ts`:

```typescript
// Handle validate_api_key with provided key
if (action === "validate_api_key") {
  if (!body.api_key) {
    return new Response(
      JSON.stringify(createErrorResponse(ERROR_CODES.INVALID_REQUEST, "api_key is required", action)),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    );
  }
  
  // Use provided environment OR read from tracker (same as other actions)
  let environment = body.environment;
  if (!environment) {
    environment = await getTrackerEnvironment(supabase, "hostfully");
  }
  
  const response = await handleValidateApiKey(body.api_key, environment);
  return new Response(JSON.stringify(response), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
```

## Files Modified

| File | Change |
|------|--------|
| `supabase/functions/hostfully-api/index.ts` | Update `validate_api_key` handler to read environment from tracker when not provided in request |

## Why This Fixes the Issue

```text
BEFORE:
┌──────────────────────────┐
│  API Key Validation      │
│                          │
│  body.environment = ?    │
│         ↓                │
│  Fallback: "production"  │ ← WRONG!
│         ↓                │
│  Call api.hostfully.com  │
│         ↓                │
│  401 Unauthorized        │
└──────────────────────────┘

AFTER:
┌──────────────────────────┐
│  API Key Validation      │
│                          │
│  body.environment = ?    │
│         ↓                │
│  Query pms_tracker_status│ ← READ TRACKER
│  active_environment      │
│         ↓                │
│  "sandbox" from DB       │
│         ↓                │
│  Call sandbox.hostfully  │
│         ↓                │
│  200 OK - Agency Found!  │
└──────────────────────────┘
```

## Verification

After this fix:
1. Set Hostfully toggle to "Sandbox" on Integrations page
2. Go to Admin Users → Expand owner "Hostfully SandBox"
3. Enter sandbox API key → Click Connect
4. API key should validate successfully against sandbox.hostfully.com

## Technical Notes

### Consistency with Other Actions
All other Hostfully actions use `getCredentials()` which reads from `pms_tracker_status`. This fix aligns `validate_api_key` with the same pattern.

### Backward Compatibility
- If `body.environment` is explicitly provided, it's still used (no change)
- Only when environment is missing does it now consult the tracker instead of hardcoding production

### Edge Function Deployment
The edge function must be redeployed for this fix to take effect.
