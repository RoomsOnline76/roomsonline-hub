# Retire the six test sub-accounts permanently

## What I checked first

- None of these six OwnerIDs exist in our own records: `ru_owner_accounts` holds only **741761** (Jongensfontein) and **742004** (RentalsUnited TEST), and `ru_api_credentials` holds keys for **741761** only.
- They appear in reports purely because the reconciliation reads the channel's own sub-account roster (`list_users` → `Pull_ListMyUsers_RQ`) and then treats every returned OwnerID as something to read, count and label ("Not bound in ROL'OS").
- The same roster read feeds the certification portal (candidate list, identity matching, coverage probe), so the noise is not limited to the monitor.

So there is nothing to delete locally — what's needed is a permanent retirement registry that every channel read honours.

## What to build

### 1. A retirement registry
A new table of retired channel sub-accounts (OwnerID, portal email, reason, who retired it, when), seeded with the six accounts:

- 741765 rooms@roomsonline.co.za
- 741769 rolos-apitest-544d36@roomsonline.co.za
- 741771 Archived_julius@polka.co.za
- 741776 test-owner@example.com
- 741777 Archived_dawie.julius@polka.co.za
- 741778 Archived_dawie@rydr.co.za

### 2. Filter at the source, so nothing can leak
The roster read itself drops retired OwnerIDs, which means every consumer inherits the exclusion without its own guard:

- Reconciliation stops reading, counting, labelling and alerting on them — no listing pulls, no "unverifiable — cannot prove empty", no owner-violation banner, and the account totals stop including their listings.
- The certification portal stops offering them as bind candidates and never matches an identity to them.
- No availability, price, notification, LNM or company-details call is ever addressed to them again.
- An explicit "include retired" switch exists for one place only: the admin list where retirement can be reviewed or undone.

### 3. Visible, reversible, and honest
- The monitor's "Sub-accounts read" section gains a small collapsed line: "6 retired test sub-accounts excluded" listing them, so the exclusion is auditable rather than silent.
- Retiring / restoring an account is an admin action from that section, writing to the registry with a reason (no code change needed next time a test account appears).
- Retiring an account is refused if it is bound to a portfolio or property in ROL'OS — that would hide a real account.

### 4. Left alone at the channel
Whatever these accounts still hold upstream stays untouched: we make no calls to them at all. If you later want their live listings archived in the portal, that's a separate, explicit cleanup — say the word and I'll add it.

## Technical notes

- New table `public.ru_retired_accounts` (`ru_owner_id` unique, `portal_email`, `reason`, `retired_by`, `retired_at`), RLS + grants: admin/dev/fearless_leader read-write, `service_role` full (edge functions read it).
- `supabase/functions/rentalsunited-api/index.ts` (`list_users`): filter the parsed users against the registry unless `include_retired: true` is passed; return `retired_owner_ids` alongside so callers can report the exclusion.
- `supabase/functions/channel-manager-entitlement/index.ts` (`reconcile`): roster build skips retired ids, and the response carries `retired_accounts` for the UI line; unverifiable/violation classification never sees them.
- `supabase/functions/ru-cert-portal/index.ts`: `list_ru_candidates` and the identity-match helpers use the filtered list; `bind_ru_account` refuses a retired OwnerID.
- `src/hooks/useChannelReconciliation.ts` + `src/components/admin/channel-monitor/ChannelReconciliationPanel.tsx`: `retired_accounts` type, the collapsed exclusion line, and retire/restore actions.
- Seeding the six rows is a data insert, not part of the schema migration.
