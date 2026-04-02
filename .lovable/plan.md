

# Plan: Consolidate Audit Logs, Fix Role Display, Filter Archived Properties

## Three Issues to Fix

### 1. Remove `/dev/logs` (DevLogs) — Keep `/admin/audit` (AdminAudit)

The `/admin/audit` page (used by contracts audit trail links) is the better implementation. The `/dev/logs` page is a separate, less capable view.

**Changes:**
- Remove `src/pages/DevLogs.tsx`
- Update `src/config/navigation.ts`: change the "Data & Logs" nav item to point to `/admin/audit` instead of `/dev/logs`, lower `minRole` to `'admin'` so fearless_leader can access it
- Update `src/App.tsx`: remove the `/dev/logs` route and `DevLogs` lazy import

### 2. Carike's Role Showing as "owner" in Audit Logs

Carike has the `fearless_leader` role in `user_roles`. The `get_user_audit_role()` function correctly maps `fearless_leader` → `admin` (fixed in the April 2 migration). However, the `audit_user_role` enum only has values: `admin`, `dev`, `owner`, `system` — there is no `fearless_leader` value.

**This means:** Audit entries written **before** the April 2 fix will show `owner` for Carike. New entries should show `admin`. The screenshot showing "owner" is likely from old audit data.

**This is NOT causing the create/edit properties issues** — the `fearless_leader` role is checked directly via `has_role()` in RLS policies, not via `audit_user_role`. The audit role is only used for labeling log entries.

**Action:** No code change needed for the role mapping (already fixed). Old entries will retain their original labels — this is expected for an immutable audit trail.

### 3. Property Dropdown — Exclude Archived/Deleted by Default

The property dropdown in `AdminAudit.tsx` (line 118-122) loads all properties without filtering by `is_active`. This should default to active-only, with a toggle to show archived.

**Changes in `src/pages/AdminAudit.tsx`:**
- Add `showArchived` state (default `false`)
- Update property fetch query: add `.eq("is_active", true)` unless `showArchived` is toggled on
- Add a small toggle/switch next to the Property dropdown: "Show archived"
- When toggled, re-fetch properties to include inactive ones (remove the `.eq` filter)

## Files to Modify

| File | Change |
|------|--------|
| `src/pages/DevLogs.tsx` | **Delete** |
| `src/App.tsx` | Remove DevLogs import and `/dev/logs` route |
| `src/config/navigation.ts` | Point "Data & Logs" to `/admin/audit`, set minRole to `'admin'` |
| `src/pages/AdminAudit.tsx` | Add archived toggle for property dropdown filter |

