

# Reorder Sidebar Sections for Admin/Dev Users & Hide System Config

## Problem
For admin/dev users, Administration should be the primary section at the top of the sidebar, expanded by default. Current order doesn't reflect admin workflow priority. Also, the "System Config" item links to an empty page and should be hidden.

## Changes

### 1. Reorder `navigationConfig` in `src/config/navigation.ts`

Change the array order from:
`[workspace, insights, pms, admin, editAudit, systemControl]`

To:
`[admin, pms, workspace, insights, systemControl, editAudit]`

This puts Administration first, ROL'OS PMS second, Workspace third, then Insights, System Control, and Edit & Audit last.

### 2. Make Administration expanded by default
- Set `collapsible: false` (already set) — keeps it always expanded for admin/dev users

### 3. Hide "System Config" item
- Remove the `admin-system` entry (`{ id: 'admin-system', title: 'System Config', ... }`) from the `adminSection.items` array since it points to an empty page (currently redirects to `/admin/dashboard` anyway)

## Files

| Action | File | Purpose |
|--------|------|---------|
| Modify | `src/config/navigation.ts` | Reorder sections, remove System Config item |

