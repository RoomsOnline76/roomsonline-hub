

# System Control Menu — Consolidation Plan

## Current State (10 items, significant overlap)

```text
SYSTEM (current)
├── System Overview      ← global health dashboard (PMS adapters, edge fns, pipelines)
├── PMS Control          ← PMS adapter on/off, sync triggers
├── Integrations         ← 4,400-line monster: API keys, PMS credentials, config
├── Supporting Systems   ← external tool credential vault (URLs, logins)
├── System Health        ← component-level health checks, latency monitoring
├── Data & Logs          ← audit log viewer
├── Feature Flags        ← toggle flags (reads from api_keys table)
├── AI Testing           ← AI test scenario generator (niche, rarely used)
├── Danger Zone          ← destructive ops: cache clear, stuck sync reset
└── Task Tracker         ← Kanban dev task board
```

## Overlap Analysis

| Overlap | Why |
|---------|-----|
| **System Overview ↔ System Health** | Both answer "is the system healthy?" — Overview shows adapters/pipelines summary, Health shows per-component latency checks. Same audience, same question. |
| **Integrations ↔ Supporting Systems** | Both manage credentials. Integrations handles PMS + API keys. Supporting Systems handles external tools (hosting, email, analytics logins). Same concept: "where are our credentials?" |
| **Danger Zone → System Health** | Danger Zone has 3 destructive actions used rarely. Better as an "Actions" tab within the health dashboard than a standalone page. |
| **AI Testing** | Niche tool, used during development sprints only. Not critical to daily ops. Candidate for archive. |

## Proposed Menu (6 items, from 10)

```text
SYSTEM (proposed)
├── System Health        ← MERGED: Overview + Component Health + Danger Zone (3 tabs)
├── PMS Control          ← keep as-is (adapter management is specific enough)
├── Integrations         ← MERGED: API Keys + Supporting Systems (add tab)
├── Data & Logs          ← keep as-is
├── Feature Flags        ← keep as-is
└── Task Tracker         ← keep as-is
```

### What changes

**1. System Health** — merge 3 pages into 1 tabbed page
- **Tab: Overview** — current DevOverview content (PMS adapter summary, edge function status, sync pipeline status, error rate, uptime gauge, daily health report button)
- **Tab: Components** — current AdminSystemHealth content (per-component health checks with latency, auto-refresh, time range filters)
- **Tab: Actions** — current DevDanger content (cache purge, stuck sync reset, pending booking clear — behind confirmation dialogs)
- Route: `/dev/system-health` (consolidate both old routes)
- Old routes `/dev/overview`, `/admin/system-health`, `/dev/danger` redirect to new page

**2. Integrations** — add Supporting Systems as a tab
- **Existing tabs/sections** in AdminKeys stay untouched (API keys, PMS credentials, etc.)
- **New tab: External Tools** — current SupportingSystems content (credential vault for hosting, email, analytics tools)
- Route stays `/admin-keys`
- Old route `/admin/supporting-systems` redirects

**3. Removed from menu**
- **AI Testing** → moved to `/dev/testing-archive`, accessible via direct URL only. Not deleted, just unlisted. Can be reviewed post-upgrade.
- **NB Widget** → already absent from sidebar in current state. Route stays for direct access.

### What stays unchanged
- **PMS Control** (`/dev/pms`) — distinct adapter management, no overlap
- **Data & Logs** (`/dev/logs`) — unique audit log viewer
- **Feature Flags** (`/dev/features`) — unique toggle interface
- **Task Tracker** (`/dev/tasks`) — unique project management

## Implementation Steps

1. **Create new `DevSystemHealth.tsx`** — tabbed page with Overview, Components, and Actions tabs. Extract existing component logic from DevOverview, AdminSystemHealth, and DevDanger into tab content sections within this single page.

2. **Add "External Tools" tab to `AdminKeys.tsx`** — import SupportingSystems content as an inline tab within the existing page structure. Given the file is already large, the tab content will be extracted to a `<SupportingSystemsTab />` component.

3. **Update `navigation.ts`** — reduce systemControlSection items from 10 to 6 with updated labels/routes.

4. **Update `AppSidebar.tsx`** — update systemItems array to match new 6-item config.

5. **Update `App.tsx`** — add redirect routes for old paths, add new consolidated route, remove AI Testing from sidebar routing (keep route accessible).

6. **Delete or archive old standalone files** — `DevOverview.tsx`, `AdminSystemHealth.tsx`, `DevDanger.tsx`, `SupportingSystems.tsx` become unused after merge (code moved into new components).

## Files Affected
- **New**: `src/pages/DevSystemHealth.tsx`, `src/components/system/SupportingSystemsTab.tsx`
- **Edit**: `src/config/navigation.ts`, `src/components/layout/AppSidebar.tsx`, `src/App.tsx`, `src/pages/AdminKeys.tsx`
- **Archive** (delete after code extracted): `src/pages/DevOverview.tsx`, `src/pages/AdminSystemHealth.tsx`, `src/pages/DevDanger.tsx`, `src/pages/SupportingSystems.tsx`

