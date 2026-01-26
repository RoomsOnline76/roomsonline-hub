
# Fix Hostfully Sync, Logout, and Screen Width Issues

## Problem Summary

Three persistent issues affecting the Hostfully integration and UI:

| Issue | Description | Root Cause |
|-------|-------------|------------|
| **1. Room/Rate Types Not Importing** | "Connect Hostfully" button doesn't import data | OAuth fails with `INCORRECT_REQUEST` - missing frontend environment variable |
| **2. Logout After Sync** | User kicked out completely after sync attempt | Redirect to different domain causes session cookie issues |
| **3. Screen Width** | PropertyForm doesn't fill screen width | Inner container still uses `max-w-7xl` instead of full width |

---

## Root Cause Analysis

### Issue 1: OAuth Configuration Problems

From the edge function logs:
```
status: "INCORRECT_REQUEST"
Hostfully OAuth callback - Full URL: http://qmprswbgkpzcvexmmcbf.supabase.co/...
state: {"owner_id":"...","property_id":"...","environment":"production"}
```

**Problems identified:**
1. **Missing `VITE_HOSTFULLY_CLIENT_ID`** - The frontend uses `import.meta.env.VITE_HOSTFULLY_CLIENT_ID` but this is NOT set. Secrets like `HOSTFULLY_CLIENT_ID` are only available to edge functions, not the frontend.

2. **Environment Mismatch** - Property is `[SANDBOX] Victorian House` but OAuth sends `environment: production`. Sandbox properties should use sandbox OAuth.

3. **No Owner Credential Linked** - Property's `owner_pms_credential_id` is `NULL`, so there's no OAuth token stored for it.

### Issue 2: Session Logout

When OAuth fails, the redirect goes from:
- Hostfully domain → Supabase edge function → App URL

The `APP_URL` secret returns `https://sleepinafrica.roomsonline.co.za` but the user is on the Lovable preview URL. This **cross-domain redirect causes the auth session cookie to be lost**.

### Issue 3: Screen Width

The `AppLayout.tsx` correctly has `max-w-[2000px]`:
```typescript
<div className="w-full mx-auto px-4 md:px-6 lg:px-8 py-4 md:py-6 max-w-[2000px] animate-fade-in">
```

But `PropertyForm.tsx` has an **inner container** with `max-w-7xl`:
```typescript
<div className="max-w-7xl mx-auto">
```

This inner constraint limits the width to ~1280px.

---

## Solution

### Part 1: Fix Screen Width (PropertyForm.tsx)

Remove the inner width constraint so the page uses the full available width from AppLayout.

**File:** `src/pages/PropertyForm.tsx` (line ~3807)

```typescript
// FROM:
<div className="max-w-7xl mx-auto">

// TO:
<div className="w-full">
```

---

### Part 2: Add VITE_HOSTFULLY_CLIENT_ID to Frontend Environment

The OAuth flow requires a client ID available at build time. Since `VITE_` prefixed variables are embedded in the frontend bundle, we need to:

1. Add `VITE_HOSTFULLY_CLIENT_ID` to the `.env` file (it's a publishable key, safe for frontend)

**File:** `.env`

Add:
```
VITE_HOSTFULLY_CLIENT_ID=your_hostfully_client_id_here
```

This requires the user to provide the Hostfully Client ID value.

---

### Part 3: Fix OAuth Redirect Domain Mismatch

Update the `hostfully-oauth-callback` to detect if the user came from a preview URL and redirect back to the same domain.

**File:** `supabase/functions/hostfully-oauth-callback/index.ts`

Add Referer header tracking to redirect to the originating domain:

```typescript
// Parse origin from state or use APP_URL
const getAppUrl = (state?: string, referer?: string): string => {
  // First try to extract origin from state
  if (state) {
    try {
      const stateData = JSON.parse(atob(state));
      if (stateData.origin_url) {
        return stateData.origin_url;
      }
    } catch {}
  }
  
  // Fallback to ENV
  const envUrl = Deno.env.get('APP_URL');
  if (envUrl && (envUrl.startsWith('http://') || envUrl.startsWith('https://'))) {
    return envUrl;
  }
  return 'https://sleepinafrica.roomsonline.co.za';
};
```

And in `PropertyForm.tsx`, include the origin URL in state:

```typescript
const stateData = {
  owner_id: user.id,
  property_id: propertyId,
  credential_id: ownerPmsCredentialId || ownerHostfullyCredential?.id,
  environment,
  origin_url: window.location.origin, // ADD: Track origin for redirect
};
```

---

### Part 4: Fix Sandbox Environment Detection

The property name contains `[SANDBOX]` but the OAuth sends `environment: production`. The "Connect Hostfully" button should detect sandbox properties.

**File:** `src/pages/PropertyForm.tsx`

Update the Connect Hostfully handler to detect sandbox:

```typescript
// Determine if this is a sandbox property
const isSandboxProperty = formData.name?.includes('[SANDBOX]') || 
                          formData.name?.toLowerCase().includes('sandbox') ||
                          formData.name?.toLowerCase().includes('sample');

// Use sandbox OAuth for sandbox properties
const useSandbox = isSandboxProperty;
```

---

### Part 5: Improve Manual Sync Fallback

The "Sync Property Data" button exists but needs better visibility and should work with `pms_credentials` fallback.

The current `handleSyncHostfullyProperty` function already passes `property_id`, which triggers the fallback credential lookup in the edge function. However, the property has no `owner_pms_credential_id` linked.

**Solution:** Update the edge function to be more explicit about using `pms_credentials` when the property doesn't have an owner credential.

---

## Files Modified

| File | Change |
|------|--------|
| `src/pages/PropertyForm.tsx` | 1. Remove `max-w-7xl` width constraint 2. Add `origin_url` to OAuth state 3. Detect sandbox properties automatically |
| `supabase/functions/hostfully-oauth-callback/index.ts` | Use `origin_url` from state for redirects |
| `.env` | Add `VITE_HOSTFULLY_CLIENT_ID` (requires user to provide value) |

---

## Expected Outcome

1. **Screen fills width** - PropertyForm uses full available width
2. **OAuth redirects correctly** - Returns to the same preview/production URL user started on
3. **Sandbox detection works** - Properties with `[SANDBOX]` in name use sandbox OAuth
4. **Manual sync works** - "Sync Property Data" button imports room types using existing API credentials
5. **No logout** - Session preserved across OAuth flow

---

## Technical Notes

### Why OAuth is Failing

The OAuth flow uses Partner/Agency level OAuth which requires:
1. Valid `clientId` - Currently empty because `VITE_HOSTFULLY_CLIENT_ID` not set
2. Matching `environment` - Sandbox properties need sandbox OAuth URL
3. Valid `redirectUri` - Must match exactly what's registered in Hostfully

### Frontend vs Backend Environment Variables

| Variable | Scope | Access |
|----------|-------|--------|
| `VITE_*` | Frontend | `import.meta.env.VITE_*` in React |
| `HOSTFULLY_*` | Backend | `Deno.env.get('HOSTFULLY_*')` in Edge Functions |

The Hostfully Client ID is a **publishable key** (safe for frontend) - it's not a secret. It's similar to how Google Maps API keys work in frontend code.

### Workaround: Use "Sync Property Data" Button

Until the OAuth issues are fully resolved, the **"Sync Property Data"** button in the property editor header should work as it uses the stored API key from `pms_credentials` table (which has a valid staging API key). This bypasses OAuth entirely.

---

## User Action Required

Please provide the **Hostfully Client ID** that was registered for the OAuth integration. This needs to be added as `VITE_HOSTFULLY_CLIENT_ID` in the environment configuration.
