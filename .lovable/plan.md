# Archive orphan distribution accounts from Channel Monitor → Advanced

The four accounts showing as "Not bound in ROL'OS" are leftovers from earlier Step A runs. The retirement registry that permanently excludes an account from every channel read already exists in the backend, but there is no way to put an account into it from the app. This adds that control to the existing "Orphan distribution accounts" panel.

## What changes

The orphan panel in Channel Monitor → Advanced becomes actionable:

- Each unbound account row gets an **Archive** button. Clicking it asks for confirmation (naming the login and OwnerID), optionally takes a short reason, and on confirm the account is retired.
- Once archived, the account disappears from the orphan list and from every active read: listing counts, cost attribution, compliance checks, binding and health alerts all skip it, the same way the six existing retired test accounts are skipped today.
- A collapsed **Archived accounts** section below the list shows what has been retired (login, OwnerID, reason, date) with a **Restore** button per row for the rare case an account was archived by mistake.
- An account that a property or portfolio is actually bound to is never offered for archiving — it does not appear in the orphan list in the first place, and archiving is refused if a binding appears in between.

The panel keeps its current counter and roster-read timestamp, so it stays clear how fresh the list is.

## Technical notes

- No new table or backend function: `ru_retired_accounts` already exists with a staff-only (admin / dev / fearless_leader) manage policy, and `_shared/ruRetiredAccounts.ts` is already the source of truth consumed by `rentalsunited-api` `list_users`, `ru-cert-portal` binding and the listings/compliance sweeps.
- File: `src/components/admin/channel-monitor/OrphanSubAccountsPanel.tsx`.
  - Its query additionally selects `ru_retired_accounts` (`ru_owner_id, portal_email, reason, retired_at`) and filters retired OwnerIDs out of the roster-derived orphan list — the panel reads `ru_roster_cache` directly, so it needs the same exclusion the edge functions apply.
  - Archive: `upsert` into `ru_retired_accounts` on conflict `ru_owner_id`, writing `portal_email` (login or contact email), `reason`, and `retired_by` from the current session user id. Restore: delete by `ru_owner_id`.
  - Both actions invalidate the panel query plus the channel cost/reconciliation query keys so counts refresh, and report success/failure with a toast.
  - Confirmation uses the existing `AlertDialog` primitive; the reason is a single optional input defaulting to "Orphan distribution account — retired from Channel Monitor".
- No change to the roster cache TTL and no extra channel traffic: archiving is a database write only. The next roster read simply excludes the OwnerID.
