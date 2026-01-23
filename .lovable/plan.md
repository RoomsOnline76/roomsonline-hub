
# Fix Create User Logic for Existing Users

## Problem Analysis

From the database:
- `admin@roomsonline.co.za` has a **pending access request** AND already exists with the `admin` role
- When trying to approve this request, the edge function throws: "User with this email already exists and is fully set up"

The current logic at lines 88-97 treats "already exists with role" as an error, but this is incorrect for the access request approval flow.

---

## The Logic Flaw

```text
Current Flow:
┌─────────────────────────────────────────────────────────────┐
│ User exists with same role?                                 │
│                    ↓                                        │
│                   YES → ERROR (wrong!)                      │
│                                                             │
│ What SHOULD happen:                                         │
│                    ↓                                        │
│                   YES → Send password email + SUCCESS       │
└─────────────────────────────────────────────────────────────┘
```

---

## Solution

Modify `supabase/functions/create-user/index.ts` to handle all scenarios gracefully:

### Scenario 1: User exists with SAME role already
- Don't error
- Send password setup/reset email
- Return success (user is ready to use)

### Scenario 2: User exists with DIFFERENT role
- Add the new role
- Send email about new role/access
- Return success

### Scenario 3: New user
- Create auth user
- Create profile
- Add role
- Send welcome email
- Return success

---

## Code Changes

### File: `supabase/functions/create-user/index.ts`

**1. Remove the error throw for existing users (lines 95-97)**

Replace:
```typescript
if (existingProfile && existingRole) {
  throw new Error('User with this email already exists and is fully set up');
}
```

With logic that:
- Sets a flag `isExistingWithRole = true`
- Continues to the email sending section
- Skips profile/role upserts (already done)

**2. Add tracking variable for existing user state**

Add after line 78:
```typescript
let userId: string;
let isExistingWithRole = false;
let isExistingWithDifferentRole = false;
```

**3. Update the existing user check block (lines 80-101)**

```typescript
if (existingAuthUser) {
  userId = existingAuthUser.id;
  
  const { data: existingProfile } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('id', existingAuthUser.id)
    .maybeSingle();

  const { data: existingRole } = await supabaseAdmin
    .from('user_roles')
    .select('id, role')
    .eq('user_id', existingAuthUser.id)
    .eq('role', role)
    .maybeSingle();

  if (existingProfile && existingRole) {
    // User already fully set up with this role
    // Don't error - just send password reset email and succeed
    console.log('User already exists with requested role, will send password reset');
    isExistingWithRole = true;
  } else if (existingProfile) {
    // User exists but with different/no role - add the new role
    console.log('User exists with different role, adding new role:', role);
    isExistingWithDifferentRole = true;
  } else {
    // User in auth but no profile - create profile
    console.log('User exists in auth but missing profile, creating...');
  }
} else {
  // Create new user...
}
```

**4. Wrap profile/role creation in condition**

Only run profile/role upserts if NOT `isExistingWithRole`:

```typescript
if (!isExistingWithRole) {
  // Create or update profile
  const { error: profileError } = await supabaseAdmin
    .from('profiles')
    .upsert({ id: userId, email, full_name }, { onConflict: 'id' });
  if (profileError) throw profileError;

  // Create or update role
  const { error: roleError } = await supabaseAdmin
    .from('user_roles')
    .upsert({ user_id: userId, role }, { onConflict: 'user_id,role' });
  if (roleError) throw roleError;
}
```

**5. Always send password email (lines 177-258)**

The email section already runs for all cases - just ensure it doesn't fail silently for existing users.

**6. Update email subject/content for existing users**

```typescript
const isNewUser = !existingAuthUser;
const emailSubject = isNewUser 
  ? 'Welcome to RoomsOnline - Set Up Your Account'
  : 'RoomsOnline - Your Access Has Been Approved';

const emailIntro = isNewUser
  ? `Your ${roleLabel} account has been created.`
  : `Your access request has been approved! You now have ${roleLabel} access.`;
```

---

## Summary of Changes

| Change | Purpose |
|--------|---------|
| Remove error for existing user+role | Allow approving already-setup users |
| Add `isExistingWithRole` flag | Track state without breaking flow |
| Conditional profile/role creation | Skip redundant DB writes |
| Dynamic email content | Appropriate messaging for new vs existing users |

---

## Edge Cases Handled

| Scenario | Current Behavior | New Behavior |
|----------|-----------------|--------------|
| User exists + same role | ERROR | Send email + SUCCESS |
| User exists + different role | Add role + email | Add role + email (unchanged) |
| User in auth only (no profile) | Create profile/role | Create profile/role (unchanged) |
| Brand new user | Create all | Create all (unchanged) |

---

## Files Modified

1. `supabase/functions/create-user/index.ts` - Logic update to handle existing users gracefully
