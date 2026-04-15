

## RU Sub-Account (User) Management Per Owner

### Problem
Currently all properties push to RU under a single hardcoded `owner_id: 738925` on the ROL master account. Each property owner (e.g., the owner of Seesig + Tidalpools + Fonteinhutte + Dassiesingel) needs their own RU sub-account so they can log into RU independently and see only their properties.

### How RU Sub-Accounts Work
- `Push_CreateUser_RQ` creates a sub-account under ROL's master account. Returns a `UserAccountId`.
- `Pull_ListMyUsers_RQ` lists all sub-accounts created under the master.
- `Push_FillCompanyDetails_RQ` fills company info for channel onboarding.
- Properties are associated with a sub-account via the `OwnerID` field in `Push_PutProperty_RQ`.

### Design

**1. New database table: `ru_owner_accounts`**

Tracks which ROL owner email maps to which RU sub-account:

| Column | Type | Description |
|---|---|---|
| id | uuid PK | |
| owner_email | text UNIQUE NOT NULL | The ROL property owner email |
| ru_user_id | text | RU UserAccountId returned by Push_CreateUser_RQ |
| ru_owner_id | text | RU OwnerID (for use in Push_PutProperty_RQ) |
| ru_login_email | text | The email used for the RU sub-account |
| ru_login_url | text | Static: `https://new.rentalsunited.com` |
| company_details_sent | boolean DEFAULT false | Whether Push_FillCompanyDetails_RQ was sent |
| created_at / updated_at | timestamps | |

RLS: Admins/devs full access; property owners can SELECT their own row.

**2. Add XML builders + action handlers to `rentalsunited-api/index.ts`**

New actions:
- `create_user` — `Push_CreateUser_RQ` with FirstName, LastName, Email, Password
- `list_users` — `Pull_ListMyUsers_RQ` to list all sub-accounts
- `fill_company_details` — `Push_FillCompanyDetails_RQ`

**3. Update `push-property-to-ru/index.ts` — auto-create sub-account**

Before pushing a building/property:
1. Look up `properties.owner_email` for the property being pushed
2. Check `ru_owner_accounts` for that `owner_email`
3. If no record exists:
   - Call `create_user` action with owner's name/email and a generated secure password
   - Store the returned `UserAccountId` in `ru_owner_accounts`
   - Call `list_users` or derive owner_id from the response
4. Use the stored `ru_owner_id` in the `<OwnerID>` field of the property XML instead of hardcoded `738925`

**4. UI: Show RU account details to owners**

Update the "Push to Rentals United" panel (`src/components/property/PushToRentalsUnited.tsx`):
- Query `ru_owner_accounts` for the property's `owner_email`
- If a sub-account exists, show a card with:
  - RU Login URL (link to `https://new.rentalsunited.com`)
  - RU Login Email
  - A note that password was set during account creation
- Visible to property owners and admins

### Files to Create
- Migration: `ru_owner_accounts` table + RLS policies

### Files to Update
- `supabase/functions/rentalsunited-api/index.ts` — add `create_user`, `list_users`, `fill_company_details` XML builders and action handlers
- `supabase/functions/push-property-to-ru/index.ts` — auto-resolve/create RU sub-account before property push, pass correct `owner_id`
- `src/components/property/PushToRentalsUnited.tsx` — display RU sub-account login details

### What Does NOT Change
- Cron jobs — they call `push-property-to-ru` which will now handle sub-accounts automatically
- Existing RU property/building IDs — the `OwnerID` change is transparent to RU
- No changes to reservation handling

