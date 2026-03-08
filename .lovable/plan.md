

# ROL'OS Property Staff Management System

## Overview
Property owners/GMs can create and manage staff users scoped to their property. Each staff member gets a PMS role that controls which modules they can access. The system uses a dedicated `property_staff` table (separate from the platform-level `user_roles`) to scope permissions per-property.

## PMS Staff Roles

| Role | Key Access |
|------|-----------|
| **general_manager** | Full operational access (dashboard, calendar, rooms, rates, guests, housekeeping, reports, branding). Cannot access platform settings or other properties. |
| **front_desk** | Dashboard, Calendar (create/modify bookings), Guest CRM, Room Inventory (read-only status). No rates or reports. |
| **housekeeping** | Housekeeping board (full), Maintenance dockets (create/update), Room Inventory (read-only). No bookings/rates/financials. |
| **maintenance** | Maintenance dockets (full), Housekeeping board (read-only). No other PMS access. |
| **accountant** | Reports (financial), Folios (read-only), Guest CRM (read-only for billing). No operational modules. |
| **auditor** | Read-only access to all PMS modules. |

## Database Changes

### New enum: `pms_staff_role`
```sql
CREATE TYPE public.pms_staff_role AS ENUM (
  'property_owner', 'general_manager', 'front_desk', 
  'housekeeping', 'maintenance', 'accountant', 'auditor'
);
```

### New table: `property_staff`
```
id, property_id (FK→properties), user_id (FK→auth.users), 
staff_role (pms_staff_role), display_name, is_active, 
must_change_password (bool, default true), 
invited_by (FK→auth.users), created_at, updated_at
```

RLS: Property owners can manage staff for their own properties. Staff can read their own record. Admins/devs can manage all.

## New Edge Function: `manage-property-staff`

Handles three actions:
1. **create** — Creates auth user with password, profile, `user` app_role, and `property_staff` record. Sets `must_change_password = true`.
2. **reset-password** — Owner resets a staff member's password (via `admin.updateUserById`). Re-sets `must_change_password = true`.
3. **deactivate** — Sets `is_active = false`.

Authorization: Caller must be property owner (checked via `is_property_owner` or `is_linked_owner`) OR admin/dev.

## New PMS Page: `/pms/staff`

`src/pages/pms/PMSStaff.tsx` — Staff management page with:
- Table of current staff (name, email, role, status, last login)
- "Add Staff" dialog: email, full name, role selector, initial password fields
- Per-staff actions: Edit role, Reset password, Deactivate/Reactivate
- Role descriptions shown in the add dialog for clarity

## Force Password Change Flow

When `must_change_password = true`:
- After login, check `property_staff` record for the user
- If flagged, show a modal forcing password change before any PMS access
- On successful change, update flag to `false`

Implemented as a `useForcePasswordChange` hook used in `PMSLayout`.

## Sidebar & Route Updates

1. **PMSSidebar**: Add "Staff" nav item with `Users` icon at `/pms/staff`
2. **App.tsx**: Add route `/pms/staff` → `PMSStaff`
3. **PMS Permission Hook** (`usePmsStaffRole`): Returns the current user's staff role for the active property. Used by PMS pages to show/hide modules and toggle read-only mode.
4. **PMSSidebar**: Filter nav items based on staff role permissions.

## Permission Matrix (sidebar visibility)

```text
Module          | owner/GM | front_desk | housekeep | maint | accountant | auditor
Dashboard       |   ✓      |    ✓       |           |       |            |   ✓(RO)
Rooms           |   ✓      |    ✓(RO)   |   ✓(RO)   |       |            |   ✓(RO)
Rate Plans      |   ✓      |            |           |       |            |   ✓(RO)
Guests          |   ✓      |    ✓       |           |       |   ✓(RO)    |   ✓(RO)
Housekeeping    |   ✓      |    ✓(RO)   |   ✓       |  ✓(RO)|            |   ✓(RO)
Reports         |   ✓      |            |           |       |   ✓        |   ✓(RO)
Branding        |   ✓      |            |           |       |            |   ✓(RO)
Integrations    |   ✓      |            |           |       |            |
Staff           |   ✓      |            |           |       |            |
```

## Files to Create
- `src/pages/pms/PMSStaff.tsx` — Staff management page
- `src/hooks/usePmsStaffRole.ts` — Resolves staff role for current user + property
- `src/lib/pmsPermissions.ts` — PMS module permission matrix
- `src/components/pms/ForcePasswordChangeModal.tsx` — Modal for first-login password change
- `supabase/functions/manage-property-staff/index.ts` — Edge function

## Files to Edit
- `src/components/layout/PMSSidebar.tsx` — Add Staff nav + role-based filtering
- `src/components/layout/PMSLayout.tsx` — Add force password change check
- `src/App.tsx` — Add `/pms/staff` route
- 1 migration for enum, table, RLS policies

