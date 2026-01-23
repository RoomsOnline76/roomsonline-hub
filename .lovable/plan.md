

# Fix Contract Signing Data Flow Issues

## Summary of Issues

After investigating Julius Erasmus's contract signing, I found **four distinct issues** that need to be addressed:

| Issue | Status | Root Cause |
|-------|--------|------------|
| Property data not fully saved | Data IS saved correctly | UI display issue - owner email is in DB |
| Owner not created in /team | Profile missing | Trigger/sync failure |
| Contract shows "No Contract" | Needs investigation | Likely working but may need UI refresh |
| Onboarding email not sent | Missing code | Fixed in previous update |

---

## Detailed Analysis

### Issue 1: Profile Not Created for New Owner

**Current State:**
- Auth user exists: `id: 06ea9dbd-98ad-433b-8035-88e58b1f0457`, `email: dawie.julius@polka.co.za`
- Profile does NOT exist for this user
- User role does NOT exist for this user

**Root Cause:**
The `handle_new_user` database trigger on `auth.users` should create a profile automatically, but it either failed silently or has a race condition when users are created via the admin API (`auth.admin.createUser`).

The `send-owner-contract` function has fallback logic (lines 76-90) to create the profile if it wasn't auto-created, but the contract for Julius was sent BEFORE the user was created (the user is created when the contract is sent to a new owner).

**The Fix:**
Update `process-signature` to ensure profile + user_role are created after property creation for new owners.

### Issue 2: Property Data IS Actually Saved Correctly

**Verification Query Results:**
```
Property: 3c4c2a4e-7506-4ed7-af0f-d9d198500c18
- name: "Julius Erasmus" ✅
- owner_email: "dawie.julius@polka.co.za" ✅  
- owner_name: "Julius Erasmus" ✅
- address: "38 Geelhout Street" ✅
- city: "Still bay" ✅
- amenities.telephone: "795242837" ✅
```

**Why It Appears Empty in UI:**
The property form "Owner" dropdown is populated from the `profiles` table. Since Julius's profile doesn't exist, the dropdown shows "Select owner" even though `owner_email` IS correctly saved in the database.

### Issue 3: Contract Status Display

**Database Verification:**
```
Contract: e9393be9-cd0b-4a71-a783-753eff4a9087
- owner_email: "dawie.julius@polka.co.za"
- status: "signed" ✅
```

The contract IS signed and the `owner_email` matches. The `ContractManagementPanel` uses `formData.owner_email` which comes from the property's `owner_email` column. Since that value IS correct, the contract SHOULD display.

**Possible Cause:**
- Browser caching
- React Query stale data

---

## Implementation Plan

### Part 1: Update `process-signature` Edge Function

**File:** `supabase/functions/process-signature/index.ts`

After creating the property for new owners (around line 157), add logic to:
1. Check if profile exists
2. Create profile if missing
3. Create user_role if missing

```typescript
// After property creation (line 157), add:
if (createdPropertyId) {
  // Ensure profile exists for the owner
  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", contract.owner_email)
    .maybeSingle();

  if (!existingProfile) {
    // Find the auth user
    const { data: authUsers } = await supabase.auth.admin.listUsers();
    const authUser = authUsers?.users?.find(u => u.email === contract.owner_email);
    
    if (authUser) {
      // Create profile
      await supabase.from("profiles").insert({
        id: authUser.id,
        email: contract.owner_email,
        full_name: signee_name,
        role: "user",
      });
      console.log("Created profile for new owner:", contract.owner_email);

      // Create user role
      await supabase.from("user_roles").upsert({
        user_id: authUser.id,
        role: "user",
      }, { onConflict: "user_id,role" });
      console.log("Created user role for new owner");
    }
  }
}
```

### Part 2: Fix Existing Data (Julius Erasmus)

Run a one-time data fix to create the missing profile:

```sql
-- Create profile for existing auth user
INSERT INTO public.profiles (id, email, full_name, role)
SELECT 
  id,
  email,
  'Julius Erasmus',
  'user'
FROM auth.users 
WHERE email = 'dawie.julius@polka.co.za'
ON CONFLICT (id) DO NOTHING;

-- Create user role
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'user'
FROM auth.users 
WHERE email = 'dawie.julius@polka.co.za'
ON CONFLICT (user_id, role) DO NOTHING;
```

### Part 3: Improve Owner Dropdown Resilience

**File:** `src/pages/PropertyForm.tsx`

Update the owner dropdown to show the current `owner_email` even if no matching profile exists:

Currently (around line 4380), the dropdown only shows profiles from the database. If the property has an `owner_email` that doesn't match any profile, it shows "Select owner".

Add a fallback to display the current owner email if not in the profiles list.

---

## Files to Modify

| File | Change |
|------|--------|
| `supabase/functions/process-signature/index.ts` | Add profile + role creation for new owners |
| `src/pages/PropertyForm.tsx` | Improve owner dropdown to show unmatched owner_email |
| Database migration | Fix Julius's missing profile (one-time) |

---

## Expected Outcome

After implementation:
1. New owners signing contracts will have their profile and user_role created automatically
2. They will appear in the /team page
3. The property form will correctly display their email even if profile sync fails
4. The contract panel will correctly show the signed contract status

