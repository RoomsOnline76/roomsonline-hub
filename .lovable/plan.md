

# Fix Fearless Leader Access Rights

## Problem Summary

Fearless Leader cannot see new user access requests. The role is supposed to have the same permissions as DEV except for the Integrations page, but several permission gaps exist.

---

## Root Cause

### 1. Database RLS Policy (Critical - Blocks Access Requests)

The Row Level Security policies on the `access_requests` table explicitly check for `admin` and `dev` roles only:

```sql
-- Current (broken):
qual:(has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role))
```

This prevents `fearless_leader` from seeing or updating access requests at the database level.

### 2. Frontend Permission Gaps

Several components check `isDev` without including `isFearlessLeader`:

| File | Issue |
|------|-------|
| `src/hooks/useROLPulseData.tsx` | `canView = isAdmin \|\| isDev` (missing isFearlessLeader) |
| `src/components/dashboard/PulseViewToggle.tsx` | `!isAdmin && !isDev` (missing isFearlessLeader) |
| `src/contexts/HelpContext.tsx` | `isAdminUser = isAdmin \|\| isDev` (missing isFearlessLeader) |
| `src/pages/Bookings.tsx` | `canViewAllProperties = isAdmin \|\| isDev` (missing isFearlessLeader) |
| `src/components/contract/ContractManagementPanel.tsx` | Admin override visible for `isAdmin \|\| isDev` only |
| `src/pages/PropertyOverview.tsx` | "Show on website" switch for `isAdmin \|\| isDev` only |
| `src/pages/Dashboard.tsx` | Uses `isAdmin \|\| isDev` |

**Note:** While `useAuth` sets `isAdmin = true` when `isFearlessLeader` is true, explicit `isDev` checks bypass this.

---

## Implementation Plan

### Phase 1: Database Migration (Critical Fix)

Update RLS policies on `access_requests` to include `fearless_leader`:

```sql
-- Drop existing policies
DROP POLICY IF EXISTS "Admins and devs can view access requests" ON public.access_requests;
DROP POLICY IF EXISTS "Admins and devs can update access requests" ON public.access_requests;

-- Recreate with fearless_leader included
CREATE POLICY "Admins devs and fearless leaders can view access requests"
ON public.access_requests FOR SELECT
TO public
USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'dev'::app_role) OR 
  has_role(auth.uid(), 'fearless_leader'::app_role)
);

CREATE POLICY "Admins devs and fearless leaders can update access requests"
ON public.access_requests FOR UPDATE
TO public
USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'dev'::app_role) OR 
  has_role(auth.uid(), 'fearless_leader'::app_role)
);
```

### Phase 2: Frontend Permission Fixes

Update 6 files to include `isFearlessLeader` in permission checks:

#### 1. `src/hooks/useROLPulseData.tsx` (Line 50-51)
```typescript
// BEFORE:
const { isAdmin, isDev } = useAuth();
const canView = isAdmin || isDev;

// AFTER:
const { isAdmin, isDev, isFearlessLeader } = useAuth();
const canView = isAdmin || isDev || isFearlessLeader;
```

#### 2. `src/components/dashboard/PulseViewToggle.tsx` (Lines 11-14)
```typescript
// BEFORE:
const { isAdmin, isDev } = useAuth();
if (!isAdmin && !isDev) return null;

// AFTER:
const { isAdmin, isDev, isFearlessLeader } = useAuth();
if (!isAdmin && !isDev && !isFearlessLeader) return null;
```

#### 3. `src/contexts/HelpContext.tsx` (Lines 132-134)
```typescript
// BEFORE:
const { user, isAdmin, isDev } = useAuth();
const isAdminUser = isAdmin || isDev;

// AFTER:
const { user, isAdmin, isDev, isFearlessLeader } = useAuth();
const isAdminUser = isAdmin || isDev || isFearlessLeader;
```

#### 4. `src/pages/Bookings.tsx` (Lines 74, 88)
```typescript
// BEFORE:
const { user, isAdmin, isDev } = useAuth();
const canViewAllProperties = isAdmin || isDev;

// AFTER:
const { user, isAdmin, isDev, isFearlessLeader } = useAuth();
const canViewAllProperties = isAdmin || isDev || isFearlessLeader;
```

#### 5. `src/components/contract/ContractManagementPanel.tsx` (Lines 30, 362)
```typescript
// BEFORE:
const { isAdmin, isDev } = useAuth();
{(isAdmin || isDev) && !hasValidContract && (...)}

// AFTER:
const { isAdmin, isDev, isFearlessLeader } = useAuth();
{(isAdmin || isDev || isFearlessLeader) && !hasValidContract && (...)}
```

#### 6. `src/pages/PropertyOverview.tsx` (Lines 40, 682)
```typescript
// BEFORE:
const { user, isAdmin, isDev } = useAuth();
{(isAdmin || isDev) ? (...) : (...)}

// AFTER:
const { user, isAdmin, isDev, isFearlessLeader } = useAuth();
{(isAdmin || isDev || isFearlessLeader) ? (...) : (...)}
```

---

## What Stays Unchanged

The following correctly exclude `fearless_leader`:

| Location | Reason |
|----------|--------|
| `src/components/layout/AppSidebar.tsx` line 125 | Integrations page - dev only (correct) |
| `src/hooks/useOwnerOnboarding.tsx` | Owner detection - excluding all admins (correct) |
| `src/components/bank-export/SignoffCeremonyModal.tsx` | Separate signoff roles - intentional differentiation |

---

## Files Modified Summary

### Database (1 migration)
- Update RLS policies on `access_requests` table

### Frontend (6 files)
1. `src/hooks/useROLPulseData.tsx`
2. `src/components/dashboard/PulseViewToggle.tsx`
3. `src/contexts/HelpContext.tsx`
4. `src/pages/Bookings.tsx`
5. `src/components/contract/ContractManagementPanel.tsx`
6. `src/pages/PropertyOverview.tsx`

---

## Testing Verification

After implementation:
1. Log in as `fearless_leader` user
2. Navigate to Access Requests page - should now see all requests
3. Approve/decline a request - should work
4. Verify Revenue Pulse toggle visible
5. Verify all bookings visible
6. Verify "Show on Website" switch visible on Property Overview
7. Verify contract override button visible when applicable
8. Confirm Integrations page (`/admin-keys`) still returns 404/redirect

