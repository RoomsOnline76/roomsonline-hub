

# Fix Calendar Hostfully Sync Error: `.includes()` Type Mismatch

## Status: NOT YET IMPLEMENTED

The plan was approved but the fix has not been applied to the codebase. The current code at lines 472-480 still has the broken implementation.

## Current Code (Line 472-480) - BROKEN

```typescript
if (data?.error) {
  if (data.error.includes("credentials") || data.error.includes("not configured")) {
    setPmsSyncStatus("not_configured");
    setPmsSyncError(`${selectedPropertyData.external_system} API credentials not configured. Please configure them in Admin > API Keys.`);
  } else {
    setPmsSyncStatus("error");
    setPmsSyncError(data.error);
  }
  return;
}
```

## Required Fix (Lines 472-485)

```typescript
if (data?.error) {
  // Handle both string errors (legacy) and object errors (adapter contract)
  const errorMessage = typeof data.error === 'string' 
    ? data.error 
    : (data.error.message || data.error.code || JSON.stringify(data.error));
  
  if (errorMessage.includes("credentials") || 
      errorMessage.includes("not configured") ||
      errorMessage.includes("invalid") ||
      errorMessage.includes("expired") ||
      (typeof data.error === 'object' && data.error.code === 'AUTH_FAILED')) {
    setPmsSyncStatus("not_configured");
    setPmsSyncError(`${selectedPropertyData.external_system} API credentials not configured or expired. Please configure them in Admin > API Keys.`);
  } else {
    setPmsSyncStatus("error");
    setPmsSyncError(errorMessage);
  }
  return;
}
```

## File to Modify

| File | Lines | Change |
|------|-------|--------|
| `src/pages/CalendarAccommodation.tsx` | 472-480 | Add error type detection and safe message extraction |

## What This Fix Does

1. Safely extracts error message regardless of type (string or object)
2. Checks for `AUTH_FAILED` error code specifically from Hostfully adapter
3. Adds "invalid" and "expired" to credential-related error detection
4. Works with all PMS adapters (Benson, Hostfully, Checkfront, etc.)

## Expected Outcome

After applying this fix:
- Hostfully calendar sync will display a proper error message instead of crashing
- The error "Dt.error.includes is not a function" will be resolved
- Users will see: "Hostfully API credentials not configured or expired. Please configure them in Admin > API Keys."

