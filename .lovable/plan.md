

# Fix Hostfully OAuth DNS Error

## Problem

When trying to connect Hostfully from the property edit page, users get:
```
This site can't be reached
Check if there is a typo in pmp.hostfully.com.
DNS_PROBE_FINISHED_NXDOMAIN
```

The domain `pmp.hostfully.com` does not exist. The OAuth flow uses incorrect URLs for the Hostfully authorization and token exchange endpoints.

## Root Cause

The OAuth URLs are inconsistent with the working Hostfully API URLs:

| Location | Current (Broken) | Should Be |
|----------|-----------------|-----------|
| `PropertyForm.tsx` (production auth) | `https://pmp.hostfully.com/api/auth/oauth/authorize` | `https://api.hostfully.com/api/auth/oauth/authorize` |
| `hostfully-oauth-callback/index.ts` (production token) | `https://pmp.hostfully.com/api/auth/oauth/code-exchange` | `https://api.hostfully.com/api/auth/oauth/code-exchange` |

The `hostfully-api/index.ts` correctly uses `https://api.hostfully.com/api/v3` for production API calls.

## Solution

Update both files to use the correct Hostfully domain for production OAuth:
- Authorization: `https://api.hostfully.com/api/auth/oauth/authorize`
- Token exchange: `https://api.hostfully.com/api/auth/oauth/code-exchange`

---

## Changes Required

### File 1: `src/pages/PropertyForm.tsx`

**Line 413-415** - Update production OAuth authorize URL:

```typescript
// From:
const baseUrl = useSandbox
  ? 'https://sandbox-api.hostfully.com/api/v3.2/auth/oauth/authorize'
  : 'https://pmp.hostfully.com/api/auth/oauth/authorize';

// To:
const baseUrl = useSandbox
  ? 'https://sandbox-api.hostfully.com/api/v3.2/auth/oauth/authorize'
  : 'https://api.hostfully.com/api/auth/oauth/authorize';
```

---

### File 2: `supabase/functions/hostfully-oauth-callback/index.ts`

**Lines 85-87** - Update production token exchange URL:

```typescript
// From:
const tokenUrl = environment === 'sandbox'
  ? 'https://sandbox-api.hostfully.com/api/v3.2/auth/oauth/code-exchange'
  : 'https://pmp.hostfully.com/api/auth/oauth/code-exchange';

// To:
const tokenUrl = environment === 'sandbox'
  ? 'https://sandbox-api.hostfully.com/api/v3.2/auth/oauth/code-exchange'
  : 'https://api.hostfully.com/api/auth/oauth/code-exchange';
```

---

## Files Modified

| File | Change |
|------|--------|
| `src/pages/PropertyForm.tsx` | Update production OAuth authorize URL from `pmp.hostfully.com` to `api.hostfully.com` |
| `supabase/functions/hostfully-oauth-callback/index.ts` | Update production token exchange URL from `pmp.hostfully.com` to `api.hostfully.com` |

---

## Expected Outcome

After implementation:
1. Clicking "Connect Hostfully" on a property will redirect to the correct Hostfully authorization page
2. Users can complete the OAuth flow without DNS errors
3. Token exchange will work correctly after authorization
4. Production Hostfully connections will function properly

---

## Technical Notes

- The `sandbox-api.hostfully.com` URLs remain unchanged (they work correctly)
- This aligns with `hostfully-api/index.ts` which uses `api.hostfully.com` for production
- The edge function will need to be redeployed after the change

