
# Fix "Connect Hostfully" Button for Admin/Dev Users

## Problem Summary

When an admin/dev user clicks "Connect Hostfully" on the Victorian House property, the OAuth flow fails with `INCORRECT_REQUEST` and logs the user out. The root causes are:

### Issue 1: Wrong Button Displayed

The "Connect Hostfully" button is shown incorrectly because:

- The `ownerHostfullyCredential` state is **only loaded for owner users** (not admin/dev)
- Line 467: `if (!isOwnerUser || !user?.id) return;` - skips loading for admin/dev
- Since `ownerHostfullyCredential` is null, the condition `!ownerHostfullyCredential?.api_key` is TRUE
- This shows "Connect Hostfully" even though the property's owner HAS a valid credential

```text
Current State (Wrong):
┌───────────────────────────────────────────────────────────────┐
│ Admin/Dev viewing property                                    │
│                                                               │
│ ownerPmsCredentialId = '839ec420...' ← Loaded from property ✓│
│ ownerHostfullyCredential = null      ← NOT loaded (skipped)  │
│                                                               │
│ Condition: !null?.api_key → TRUE                             │
│ Result: Shows "Connect Hostfully" button incorrectly         │
└───────────────────────────────────────────────────────────────┘
```

### Issue 2: Missing Frontend OAuth Client ID

Even if the button was appropriate, the OAuth flow fails because:

- `VITE_HOSTFULLY_CLIENT_ID` is **NOT SET** in the `.env` file
- The frontend code (line 418): `const clientId = import.meta.env.VITE_HOSTFULLY_CLIENT_ID || ''`
- This sends an **empty clientId** to Hostfully
- Hostfully returns `status: "INCORRECT_REQUEST"`
- The redirect back to the app causes session issues

```text
Edge Function Logs:
┌─────────────────────────────────────────────────────────────────┐
│ Hostfully OAuth callback received:                              │
│   hasCode: false                                                │
│   status: "INCORRECT_REQUEST"  ← Invalid clientId               │
│                                                                 │
│ ERROR: "check clientId and redirectUri"                         │
└─────────────────────────────────────────────────────────────────┘
```

## Solution

### Part 1: Fix Button Visibility Logic

Update the `ownerHostfullyCredential` loading in `PropertyForm.tsx` to also load the property owner's credential when an admin/dev is editing, not just when the owner themselves is viewing.

**Current Code (lines 465-489):**
```typescript
useEffect(() => {
  const loadOwnerHostfullyCredential = async () => {
    if (!isOwnerUser || !user?.id) return; // ← Only loads for owners
    
    const { data } = await supabase
      .from("owner_pms_credentials")
      .select("*")
      .eq("owner_id", user.id) // ← Uses logged-in user's ID
      .eq("system_type", "hostfully")
      .maybeSingle();
    // ...
  };
}, [isOwnerUser, user?.id]);
```

**Fixed Code:**
```typescript
useEffect(() => {
  const loadOwnerHostfullyCredential = async () => {
    // For owners: load their own credential
    // For admin/dev: load the property owner's credential via ownerPmsCredentialId
    
    if (isOwnerUser && user?.id) {
      // Owner viewing their own property
      const { data } = await supabase
        .from("owner_pms_credentials")
        .select("*")
        .eq("owner_id", user.id)
        .eq("system_type", "hostfully")
        .maybeSingle();
      
      if (data) setOwnerHostfullyCredential(data);
    } else if ((isAdmin || isDev) && ownerPmsCredentialId) {
      // Admin/dev editing - load via property's credential link
      const { data } = await supabase
        .from("owner_pms_credentials")
        .select("*")
        .eq("id", ownerPmsCredentialId)
        .maybeSingle();
      
      if (data) setOwnerHostfullyCredential(data);
    }
  };
  
  loadOwnerHostfullyCredential();
}, [isOwnerUser, user?.id, isAdmin, isDev, ownerPmsCredentialId]);
```

### Part 2: Add VITE_HOSTFULLY_CLIENT_ID Environment Variable

The OAuth flow requires the `HOSTFULLY_CLIENT_ID` to be available in the frontend. This needs to be exposed as a `VITE_` prefixed variable.

**Option A: Fetch via Feature Flags (Recommended)**

Since the client ID is already stored as a secret (`HOSTFULLY_CLIENT_ID`), we can expose it via the existing `get-feature-flags` edge function, similar to how `google_maps_api_key` is exposed.

Update `supabase/functions/get-feature-flags/index.ts` to include:
```typescript
hostfully_client_id: Deno.env.get('HOSTFULLY_CLIENT_ID') || '',
```

Then update `PropertyForm.tsx` to use:
```typescript
const clientId = featureFlags?.hostfully_client_id || '';
```

**Option B: Add to .env (Not Recommended)**

This would require adding `VITE_HOSTFULLY_CLIENT_ID` to the environment, but since this is a secret, Option A is better.

## Files to Modify

| File | Change |
|------|--------|
| `src/pages/PropertyForm.tsx` | Fix `loadOwnerHostfullyCredential` to also load for admin/dev using `ownerPmsCredentialId` |
| `supabase/functions/get-feature-flags/index.ts` | Add `hostfully_client_id` to response |
| `src/pages/PropertyForm.tsx` | Update OAuth handler to use `featureFlags?.hostfully_client_id` |

## Expected Behavior After Fix

```text
Admin/Dev viewing Victorian House property:
┌───────────────────────────────────────────────────────────────┐
│ ownerPmsCredentialId = '839ec420...' ← From property          │
│ ownerHostfullyCredential = {api_key: '...', ...} ← NOW LOADED │
│                                                               │
│ Condition: !credential?.api_key → FALSE (has API key)        │
│ Result: "Connect Hostfully" button HIDDEN ✓                   │
│                                                               │
│ "Sync Property Data" button VISIBLE and WORKS ✓              │
└───────────────────────────────────────────────────────────────┘
```

## Data State (Already Correct)

The database is already correctly configured:

| Table | Field | Value |
|-------|-------|-------|
| `properties` | `owner_pms_credential_id` | `839ec420-2075-4f69-9f18-0617d127c9bb` ✓ |
| `owner_pms_credentials` | `api_key` | Present ✓ |
| `owner_pms_credentials` | `environment` | `sandbox` ✓ |
| `owner_pms_credentials` | `sync_status` | `connected` ✓ |

The fix is purely in the frontend logic for loading and displaying the credential state.

## Technical Details

### Why the Logout Happens

When Hostfully returns `INCORRECT_REQUEST`, the callback redirects with an error:
```
/admin/properties/{id}?hostfully_error=incorrect_request
```

The redirect goes through the Supabase edge function, and depending on session handling, this cross-origin redirect can clear the authentication state. The fix prevents users from triggering this broken flow in the first place.

### Sync Property Data vs Connect Hostfully

- **"Sync Property Data"** - Uses the existing `ownerPmsCredentialId` and API key to fetch data (works NOW)
- **"Connect Hostfully"** - OAuth flow to establish a NEW connection (not needed if credential exists)

Since the Victorian House property already has a valid credential, only "Sync Property Data" should be shown and used.
