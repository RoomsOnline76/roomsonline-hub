

# Fix Hostfully Calendar Sync: Credential Resolution Issue

## Problem Analysis

The calendar sync is failing with "AUTH_FAILED: Hostfully API key is invalid or expired", but the user confirms the sandbox credentials are configured correctly in the API Keys page.

### Root Cause

The `hostfully-api` edge function has a credential resolution order that causes issues:

```text
Current flow in getCredentials():
1. Check request.api_key (not passed by calendar)
2. Check request.owner_credential_id (not passed by calendar)  
3. Fallback to pms_credentials table → BUT then override with HOSTFULLY_API_KEY secret if set
```

**Line 223-224 in hostfully-api/index.ts:**
```typescript
const apiKeyFromEnv = Deno.env.get("HOSTFULLY_API_KEY");
const apiKey = apiKeyFromEnv || data.api_key;  // ENV takes precedence!
```

The `HOSTFULLY_API_KEY` secret exists and takes precedence over the database value. If this secret contains an old/expired key, the database value is ignored.

### Evidence from Logs

```
[Hostfully] GET https://sandbox.hostfully.com/api/v3/properties/818e799c-df32-4d53-8765-dd8b7e2b0ff0/calendar
Response: 401 AUTH_FAILED - "Hostfully API key is invalid or expired"
```

The edge function IS successfully:
- Connecting to the sandbox environment (correct)
- Using the property UID (correct)
- Sending an API key (but it's being rejected)

---

## Solution

Reverse the credential priority order: **Database value should take precedence over environment variable** since the database is the user-editable source of truth.

### File: `supabase/functions/hostfully-api/index.ts`

**Lines 223-224** - Change priority order:

```typescript
// FROM (current - ENV takes precedence):
const apiKeyFromEnv = Deno.env.get("HOSTFULLY_API_KEY");
const apiKey = apiKeyFromEnv || data.api_key;

// TO (fix - Database takes precedence, ENV is fallback):
const apiKeyFromEnv = Deno.env.get("HOSTFULLY_API_KEY");
const apiKey = data.api_key || apiKeyFromEnv;  // DB first, then ENV fallback
```

This ensures:
1. If user sets API key in Admin > API Keys page → that key is used
2. If database has no key → fallback to environment variable
3. Consistent with user expectation that the UI controls the credentials

---

## Additional Recommendation

The user should verify the API key in the Admin > API Keys page is correct for the Hostfully sandbox environment. The current database value is:

| Field | Value |
|-------|-------|
| API Key | `EJOnIxlU7yrLbmNp` |
| Environment | `staging` (maps to sandbox) |

If this key is expired, it needs to be regenerated from the Hostfully dashboard.

---

## Files Modified

| File | Change |
|------|--------|
| `supabase/functions/hostfully-api/index.ts` | Swap priority order at lines 223-224 so database API key takes precedence over environment variable |

---

## Expected Outcome

After this fix:
1. The API key from `pms_credentials` table (editable via Admin > API Keys) will be used
2. If the database key is valid, calendar sync will work
3. If the database key is also expired, the user will know to update it in the Admin UI
4. The environment variable serves as a fallback only

