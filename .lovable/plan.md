

# Fix Edge Function Admin Permission Checks

## Problem Summary

The "Add Admin" and "Add Owner" buttons are failing with "Edge Function returned a non-2xx status code" because the `create-user` edge function (and several other admin functions) do not recognize the `fearless_leader` role as having admin privileges.

**Current Behavior:**
- Frontend (`useAuth.tsx` line 45): `fearless_leader` IS treated as admin
- Edge functions: `fearless_leader` is NOT recognized as admin

**Error from logs:**
```
Error creating user: Error: Only admins can create users
```

---

## Root Cause

The edge functions check for roles like this:
```javascript
.in('role', ['admin', 'dev'])  // Missing 'fearless_leader'!
```

But the frontend treats `fearless_leader` as having admin access:
```javascript
const hasAdmin = roles.includes("admin") || hasDev || hasFearlessLeader;
```

---

## Files Requiring Updates

| File | Line | Current Check | Fix |
|------|------|---------------|-----|
| `supabase/functions/create-user/index.ts` | 50 | `['admin', 'dev']` | `['admin', 'dev', 'fearless_leader']` |
| `supabase/functions/reset-user-password/index.ts` | 63 | `['admin', 'dev']` | `['admin', 'dev', 'fearless_leader']` |
| `supabase/functions/add-pms-credential/index.ts` | 37 | `['admin', 'dev']` | `['admin', 'dev', 'fearless_leader']` |
| `supabase/functions/log-audit-event/index.ts` | 125 | `['admin', 'dev']` | `['admin', 'dev', 'fearless_leader']` |
| `supabase/functions/fetch-audit-logs/index.ts` | 110 | `['admin', 'dev']` | `['admin', 'dev', 'fearless_leader']` |

---

## Implementation Details

### 1. create-user/index.ts (Line 50)

```typescript
// BEFORE:
.in('role', ['admin', 'dev']);

// AFTER:
.in('role', ['admin', 'dev', 'fearless_leader']);
```

### 2. reset-user-password/index.ts (Line 63)

```typescript
// BEFORE:
.in('role', ['admin', 'dev']);

// AFTER:
.in('role', ['admin', 'dev', 'fearless_leader']);
```

### 3. add-pms-credential/index.ts (Line 37)

```typescript
// BEFORE:
.in("role", ["admin", "dev"])

// AFTER:
.in("role", ["admin", "dev", "fearless_leader"])
```

### 4. log-audit-event/index.ts (Line 125)

```typescript
// BEFORE:
const hasPermission = userRoles.some((r) => ["admin", "dev"].includes(r));

// AFTER:
const hasPermission = userRoles.some((r) => ["admin", "dev", "fearless_leader"].includes(r));
```

### 5. fetch-audit-logs/index.ts (Line 110)

```typescript
// BEFORE:
const hasPermission = userRoles.some((r) => ["admin", "dev"].includes(r));

// AFTER:
const hasPermission = userRoles.some((r) => ["admin", "dev", "fearless_leader"].includes(r));
```

---

## Deployment

After updating these files, the following edge functions will need to be redeployed:
- `create-user`
- `reset-user-password`
- `add-pms-credential`
- `log-audit-event`
- `fetch-audit-logs`

---

## Testing Verification

After deployment:
1. Log in as `carike@roomsonline.co.za` (who has `fearless_leader` role)
2. Go to Team page
3. Click "Add Admin" or "Add Owner"
4. Submit the form - should now succeed

---

## Note About Owner Creation

This same fix applies to both admin and owner creation since they use the same `create-user` edge function. The `role` parameter in the request body determines whether an admin or owner account is created.

