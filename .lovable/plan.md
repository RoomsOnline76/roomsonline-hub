

# Fix Hostfully Property Connection & Ingestion Issues

## Problem Summary

The user is experiencing multiple failures when clicking "Connect Hostfully" in the property edit page:

1. **OAuth returns `INCORRECT_REQUEST`** - The OAuth flow fails before any tokens are exchanged
2. **Redirect goes to admin page** - After failure, redirects to `/admin/users` instead of staying on property page
3. **User gets logged out** - Unclear side effect, possibly from redirect chain
4. **No rooms/rates imported** - Because OAuth fails, no ingestion runs
5. **Calendar sync still fails** - No room types or rate types exist for the property

---

## Root Cause Analysis

### Issue 1: OAuth Configuration Mismatch

From the edge function logs:
```
status: "INCORRECT_REQUEST"
Hostfully OAuth callback - Full URL: http://qmprswbgkpzcvexmmcbf.supabase.co/hostfully-oauth-callback
```

The OAuth fails because:
1. **Client is using production OAuth URL** (`api.hostfully.com`) for a **sandbox property**
2. The property name is `[SANDBOX] Victorian House (Sample)` with `hostfully_property_uid: 818e799c-df32-4d53-8765-dd8b7e2b0ff0`
3. **The `VITE_HOSTFULLY_CLIENT_ID` may be missing** from frontend environment - the code falls back to empty string

```typescript
// PropertyForm.tsx line 410
const clientId = import.meta.env.VITE_HOSTFULLY_CLIENT_ID || '';  // Falls back to empty!
```

### Issue 2: Error Redirect Goes to Wrong Page

When OAuth returns `INCORRECT_REQUEST`, the callback redirects to:
```
/admin/users?hostfully_error=incorrect_request
```

But when initiated from PropertyForm, it should return to:
```
/admin/properties/{property_id}?hostfully_error=...
```

The callback doesn't preserve the `property_id` in error redirects (lines 54-56 in callback):
```typescript
return Response.redirect(
  `${appUrl}/admin/users?hostfully_error=incorrect_request...`,  // Wrong path!
  302
);
```

### Issue 3: No Existing Owner Credentials

The query shows:
- `owner_pms_credentials` table: **0 Hostfully records**
- `pms_credentials` table: **1 Hostfully record** (staging environment, has API key)

The ingestion system uses `owner_pms_credentials` but the sandbox API key is stored in `pms_credentials`. These are different credential sources!

### Issue 4: Property Has No Rooms/Rates

- `hostfully_room_types`: 0 entries for this property
- `pms_rate_types_cache`: 0 entries for this property

The property was created but **full ingestion never ran successfully**.

---

## Solution Plan

### Part 1: Fix OAuth Error Redirect Path

**File**: `supabase/functions/hostfully-oauth-callback/index.ts`

Include `property_id` in error redirects so users return to the property page:

**Lines 51-67** - Update `INCORRECT_REQUEST` and `DECLINED` handlers:

```typescript
if (status === 'INCORRECT_REQUEST') {
  console.error('Hostfully returned INCORRECT_REQUEST - check clientId and redirectUri');
  const appUrl = getAppUrl();
  // Parse state to get property_id for redirect
  let redirectPath = '/admin/users';
  if (state) {
    try {
      const stateData = JSON.parse(atob(state));
      if (stateData.property_id) {
        redirectPath = `/admin/properties/${stateData.property_id}`;
      }
    } catch {}
  }
  return Response.redirect(
    `${appUrl}${redirectPath}?hostfully_error=incorrect_request&error_description=${encodeURIComponent('The authorization request was invalid. Please check your Hostfully configuration.')}`,
    302
  );
}

if (status === 'DECLINED') {
  console.error('Hostfully authorization was declined by user');
  const appUrl = getAppUrl();
  let redirectPath = '/admin/users';
  if (state) {
    try {
      const stateData = JSON.parse(atob(state));
      if (stateData.property_id) {
        redirectPath = `/admin/properties/${stateData.property_id}`;
      }
    } catch {}
  }
  return Response.redirect(
    `${appUrl}${redirectPath}?hostfully_error=declined&error_description=${encodeURIComponent('Authorization was declined.')}`,
    302
  );
}
```

**Lines 69-77** - Update generic error handler:

```typescript
if (error) {
  console.error('OAuth error:', error, errorDescription);
  const appUrl = getAppUrl();
  let redirectPath = '/admin/users';
  if (state) {
    try {
      const stateData = JSON.parse(atob(state));
      if (stateData.property_id) {
        redirectPath = `/admin/properties/${stateData.property_id}`;
      }
    } catch {}
  }
  return Response.redirect(
    `${appUrl}${redirectPath}?hostfully_error=${encodeURIComponent(error)}&error_description=${encodeURIComponent(errorDescription || '')}`,
    302
  );
}
```

### Part 2: Add "Sync Property Data" Button (Non-OAuth)

Since the sandbox property already has credentials stored in `pms_credentials`, we need a way to trigger ingestion without OAuth.

**File**: `src/pages/PropertyForm.tsx`

Add a new function to manually trigger full ingestion using existing credentials:

```typescript
const handleSyncHostfullyData = async () => {
  if (!propertyId || !hostfullyPropertyUid) {
    toast({
      title: "Cannot Sync",
      description: "Property must have a Hostfully Property UID",
      variant: "destructive",
    });
    return;
  }

  setFullSyncingHostfully(true);
  try {
    const { data, error } = await supabase.functions.invoke("hostfully-api", {
      body: {
        action: "full_ingest_property",
        propertyUid: hostfullyPropertyUid,
        rol_property_id: propertyId,
        // Use property_id to let edge function find credentials
        property_id: propertyId,
      },
    });

    if (error || !data?.success) {
      throw new Error(data?.error?.message || error?.message || "Sync failed");
    }

    toast({
      title: "Sync Complete",
      description: `Imported ${data.data?.rooms_processed || 0} room(s) and ${data.data?.fields_written || 0} fields`,
    });

    // Reload room count
    const { count } = await supabase
      .from("hostfully_room_types")
      .select("*", { count: "exact", head: true })
      .eq("property_id", propertyId);
    setHostfullyRoomCount(count || 0);

  } catch (err) {
    toast({
      title: "Sync Failed",
      description: err instanceof Error ? err.message : "Unknown error",
      variant: "destructive",
    });
  } finally {
    setFullSyncingHostfully(false);
  }
};
```

### Part 3: Update hostfully-api to Find Credentials by Property

**File**: `supabase/functions/hostfully-api/index.ts`

When `owner_credential_id` is not provided but `property_id` is, look up credentials:

In `getCredentials` function (around line 180), add property-based lookup:

```typescript
// If owner_credential_id not provided, try to find via property's owner
if (!ownerId && body.property_id) {
  const { data: propData } = await supabase
    .from("properties")
    .select("owner_pms_credential_id")
    .eq("id", body.property_id)
    .maybeSingle();
  
  if (propData?.owner_pms_credential_id) {
    ownerId = propData.owner_pms_credential_id;
  }
}

// Fallback: Check pms_credentials table for staging/sandbox
if (!ownerId && body.property_id) {
  const { data: pmsData } = await supabase
    .from("pms_credentials")
    .select("*")
    .eq("system_type", "hostfully")
    .maybeSingle();
  
  if (pmsData?.api_key) {
    return {
      api_key: pmsData.api_key,
      environment: pmsData.environment || "production",
      owner_credential_id: pmsData.id,
    };
  }
}
```

---

## Files Modified

| File | Change |
|------|--------|
| `supabase/functions/hostfully-oauth-callback/index.ts` | Include `property_id` in error redirect paths |
| `supabase/functions/hostfully-api/index.ts` | Add fallback credential lookup by property_id and pms_credentials table |
| `src/pages/PropertyForm.tsx` | Add "Sync Property Data" button for manual ingestion trigger |

---

## Expected Outcome

After these fixes:

1. **OAuth errors redirect back to property page** - User sees error message on the property they were editing
2. **No logout** - Proper redirect chain preserves auth session
3. **Manual sync available** - "Sync Property Data" button triggers ingestion using existing sandbox credentials
4. **Rooms and rates imported** - Full ingestion populates `hostfully_room_types` and `pms_rate_types_cache`
5. **Calendar works** - With room types populated, calendar sync can fetch availability

---

## Technical Notes

### Hostfully OAuth Environments

- **Sandbox**: `https://sandbox-api.hostfully.com/api/v3.2/auth/oauth/authorize`
- **Production**: `https://api.hostfully.com/api/auth/oauth/authorize`

The PropertyForm correctly switches URLs based on `useSandbox` parameter, but:
1. The "Connect Hostfully" button must pass `useSandbox=true` for sandbox properties
2. The `VITE_HOSTFULLY_CLIENT_ID` environment variable must be set in the frontend

### Credential Tables

| Table | Purpose |
|-------|---------|
| `owner_pms_credentials` | Per-owner OAuth tokens (production flow) |
| `pms_credentials` | System-wide API keys (legacy/sandbox) |

The ingestion should check both tables as fallback.

