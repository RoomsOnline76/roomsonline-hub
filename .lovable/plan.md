## Goal

Extend the sidebar action-needed badge (already live on Review Queue) to every menu item that holds an approval or admin action, and make all badges refresh reliably.

## Current state

`src/components/layout/AppSidebar.tsx` already holds two counters — `pendingRequests` (Access Requests, `access_requests.status = 'pending'`) and `reviewQueueCount` — loaded once in a `useEffect` when `isAdmin || isDev`, and rendered through `getBadge()` for both expanded and collapsed (tooltip) states. So Access Requests already has a badge; what's missing is coverage of the other queues and any refresh after the counts change.

## Badges to add

Counts confirmed against the live database:

| Menu item | Counted as needing action |
| --- | --- |
| Contracts (`/admin/contracts`) | `owner_contracts` with status `sent` or `viewed` (sent out, not yet signed) — currently 42 |
| Commission Reports | `rep_commission_reports.status = 'pending_approval'` — currently 0 |
| Payments | `payment_transactions.status = 'pending'` — currently 11 |
| Onboarding | properties whose most recent onboarding token has `used_at` set (owner submitted) and whose `listing_status` is not yet `live`/`activation_ready` — currently 0 |
| Task Tracker (dev) | `dev_tasks.status = 'new'` — currently 27 |
| Access Requests | unchanged: `access_requests.status = 'pending'` |
| Review Queue | unchanged |

Every count excludes soft-deleted and inactive properties where the table joins to `properties`, matching the existing Review Queue rule.

## Implementation

**1. Extract a `useAdminActionCounts` hook** (`src/hooks/useAdminActionCounts.ts`)
- Runs only for `admin`, `dev`, or `fearless_leader`; the dev-tasks count only for dev/fearless-leader.
- Issues all counts as parallel `head: true, count: 'exact'` queries in one `Promise.all`, so the sidebar makes one round of lightweight queries instead of several sequential ones.
- Returns a keyed map (`{ 'access-requests': n, contracts: n, ... }`) plus a `refresh()`.
- Refreshes on mount, on route change into/out of any of the badged routes, and on window focus, so acting on a queue clears its badge without a hard reload.
- Failures per query degrade to `0` rather than breaking the sidebar.

**2. Wire it into `AppSidebar.tsx`**
- Replace the two local `useState` counters and their loaders with the hook.
- `getBadge(item)` becomes a lookup of `counts[item.id] ?? item.badge`, so adding future badges is a config-only change.
- Badge rendering (pill + collapsed tooltip) stays exactly as-is.

**3. Section-level roll-up**
Collapsible sections (System Control holds Task Tracker) hide their items when collapsed, so show a small dot/count on the section header when any item inside it has a pending count — otherwise a dev would never see the Task Tracker badge with the section closed.

**4. Mobile**
`mobileNavItems` has no badged entries; the "Admin" mobile item gets a dot when any admin queue is non-zero, so the signal isn't desktop-only.

### Technical notes
Read-only change — no migrations, no edge functions. Onboarding needs a two-step read (most recent token per property, then property status), done client-side in the hook the same way `AdminOnboarding.tsx` builds its token map.
