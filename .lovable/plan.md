

# Fix: Owner Edit Not Saving for Fearless Leader

## Root Cause Found

**Two issues identified:**

### 1. Owner Dropdown is Empty for Fearless Leader
The owner picker queries `user_roles` table to find users with role `'user'`, then loads their profiles. But the `user_roles` table has a restrictive RLS SELECT policy:
```
"Users can view their own roles" → auth.uid() = user_id
```
This means Fearless Leader can only see **her own** roles. Since she only has the `fearless_leader` role (not `user`), the query returns zero results → the owner dropdown shows "No owner found."

**This also affects admins/devs** — they can only see their own roles too, meaning the owner dropdown likely only works if admins happen to also have the `user` role.

### 2. Potential Save Failure
Even if an owner is somehow selected, the save could fail silently if Zod validation catches an unrelated field error (shown as a quick toast that may be missed).

## Fix Plan

### Migration: Add SELECT policy on `user_roles` for privileged roles
Add an RLS policy allowing `admin`, `dev`, and `fearless_leader` to SELECT all rows from `user_roles`:

```sql
CREATE POLICY "Admins devs and fearless can view all roles"
ON public.user_roles FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin') OR
  has_role(auth.uid(), 'dev') OR
  has_role(auth.uid(), 'fearless_leader')
);
```

This single change fixes the owner dropdown for all privileged users.

### No code changes needed
The `PropertyForm.tsx` owner loading logic (lines 278-296) and save logic (lines 3770-3780) are already correct — they just need the data to actually flow through.

## Files

| Action | File | What |
|--------|------|------|
| DB migration | `user_roles` RLS | Add SELECT policy for admin/dev/fearless_leader to view all roles |

