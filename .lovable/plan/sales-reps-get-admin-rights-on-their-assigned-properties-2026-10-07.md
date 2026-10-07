# Sales reps get admin rights on their assigned properties

## What changes for the user
- A sales rep signs in and sees the admin workspace, but only for the properties assigned to them (via the Property Referral card on each property).
- On those properties they can do everything an admin can: edit the property, onboarding, bookings, calendar, rates, channels, contracts view.
- They cannot see or change any other property, users, billing settings, system/dev pages, or other reps' commissions.
- Assigning or unassigning a rep (or marking the referral "Churned") grants or removes access immediately.

## How it works
Reuse the existing "scoped admin" model (already used for the channel tester account), with the rep's scope coming from their referrals instead of a hand-maintained list.

1. **Database access rule**: extend the shared property access check so a user with the sales rep role passes for any property where they have an active (not churned) referral. Every property-linked table that already relies on that check opens up for those properties only.
2. **Admin-only tables**: where policies check "is admin" directly (bookings, property editor tables, onboarding), add "or sales rep assigned to this property".
3. **App shell**: treat a sales rep as a scoped admin — admin routes allowed by the scoped allow-list, menus narrowed, property pickers and lists filtered to their assigned properties.
4. **Not granted**: user management, billing/commission configuration, global defaults, contracts issuing/revoking, dev and reports portal (reports stays admin/dev/fearless_leader only).

## Technical details
- New `public.rep_property_ids(_user_id)` security-definer function: properties from `property_referrals` joined to `sales_reps.user_id`, status <> 'churned'.
- `can_access_property`: add `(has_role(_user_id,'sales_rep') AND _property_id IN rep_property_ids(_user_id))`.
- Audit policies using `has_role(...,'admin')` on property-scoped tables; add rep clause via a helper `is_assigned_rep(_property_id, _user_id)`.
- `useAuth`: load rep scope ids; `isScopedAdmin` true for reps; `ProtectedRoute requireAdmin` passes for reps on allowed routes; `applyAdminScope`/`filterToAdminScope` use rep ids.
- Tests: rep allowed on assigned property, denied on unassigned, denied after churn; route allow-list for reps.

## Open question
Should reps also be allowed to issue/revoke contracts for their properties? Plan assumes no.
