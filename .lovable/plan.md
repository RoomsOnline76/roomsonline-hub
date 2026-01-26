
# Fix Calendar Hostfully Sync Error: `.includes()` Type Mismatch

## Problem

When syncing Hostfully calendar data, the error "Dt.error.includes is not a function" occurs because:

1. The `hostfully-api` edge function returns errors as **objects**: `{ code: "AUTH_FAILED", message: "Hostfully API key is invalid or expired" }`
2. The calendar code in `CalendarAccommodation.tsx` (line 473) tries to call `.includes()` directly on this error object, which only works for strings/arrays

## Root Cause

```typescript
// Line 472-478 - CURRENT (BROKEN)
if (data?.error) {
  if (data.error.includes("credentials") || data.error.includes("not configured")) {
    // ❌ Fails because data.error is { code: string, message: string }, not a string
```

The Hostfully adapter response format:
```json
{
  "success": false,
  "error": {
    "code": "AUTH_FAILED",
    "message": "Hostfully API key is invalid or expired"
  }
}
```

## Solution

Update the error handling in `CalendarAccommodation.tsx` to:
1. Check if `data.error` is a string or an object
2. Extract the message properly before calling `.includes()`
3. Handle both legacy string errors and new adapter object errors

## Implementation

### File: `src/pages/CalendarAccommodation.tsx`

**Lines 472-480** - Update error handling:

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

This change:
- Safely extracts error message regardless of type (string or object)
- Checks for `AUTH_FAILED` error code specifically (common Hostfully error)
- Adds "invalid" and "expired" to credential-related error detection
- Works with all PMS adapters (Benson, Hostfully, Checkfront, etc.)

---

## Files Modified

| File | Change |
|------|--------|
| `src/pages/CalendarAccommodation.tsx` | Fix error handling at lines 472-480 to handle object errors from adapter responses |

---

## Expected Outcome

After this fix:
- Hostfully calendar sync will properly display "API credentials not configured or expired" instead of crashing
- Other PMS adapters that return object errors will also work correctly
- Legacy string errors continue to work unchanged
