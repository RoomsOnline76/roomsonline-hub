# RU sub-user accounts: hide archived, per-OwnerID API keys

## What I verified first

- `ru_owner_accounts` currently holds **one** row: `julius@polka.co.za` (portfolio scope, unbound — no OwnerID, no API keys).
- The two accounts you want deleted (`test-owner@example.com`, `rolos-apitest-544d36@roomsonline.co.za`) **do not exist in our database** — no `ru_owner_accounts`, no `profiles` row. They exist only at Rentals United, so "deleting" them means archiving them at RU (Push_ArchiveUser_RQ, sub-user API keys). Remove them from what we see in our UI. We will never use these and cannot loginto these accoutns to reset the passords or get API keys.
- The key-wipe cause is confirmed: API keys are stored in columns **on the local portfolio row** (`ru_owner_accounts.ru_api_access_key` / `ru_api_secret_enc`), keyed by `account_id`. Since there is one row per portfolio, saving keys for a second OwnerID overwrites the first pair. Keys are not keyed by RU OwnerID anywhere.
- The bind dialog lists whatever `Pull_ListMyUsers_RQ` returns, with no archived filter — that is why the `Archived_...` entries show.

## 1. Hide archived sub-users

- In the RU list parser, mark each owner as archived when RU has renamed the login (`Archived_` / `Archived.` prefix on email or username) or returns an archived/inactive marker, and return `archived: true` on the candidate.
- Bind dialog: archived candidates are hidden by default, behind a small "Show archived (N)" toggle; archived rows are read-only (no Bind, no Archive) and visually muted.

## 2. Store API keys per RU OwnerID

New table `public.ru_api_credentials`:

```text
id, ru_owner_id (unique), login_email, access_key,
secret_enc (encrypted via encrypt_sensitive_text), key_label,
verified_at, created_at, updated_at
```

- Admin/dev-only access; service_role for edge functions; RLS enabled, no anon grant.
- Every child-auth resolver (`ru-cert-portal`, `rentalsunited-api.resolveChildAuth`, `ru-close-user`) looks up keys **by OwnerID first**, then falls back to the legacy columns on `ru_owner_accounts`, then to the legacy portal password.
- `save_api_keys` / `create_api_key` / `verify_api_keys` accept `ru_owner_id` (with `account_id` optional) and write to the new table. Saving keys for OwnerID B no longer touches OwnerID A.
- Existing legacy columns on `ru_owner_accounts` are kept and back-filled/mirrored for the currently bound account so nothing in the pipeline breaks.

## 3. Choose the sub-user when adding keys

- "Add API keys" opens a dialog with an **active RU sub-user selector** (OwnerID + email, archived excluded), pre-selected to the bound account when there is one.
- Each card and each candidate row shows its own key state: access key, label, last verified, or "No keys".
- The archive prompt uses the keys stored for that OwnerID automatically and only asks for a pair when none are stored.

## 4. The two test accounts

Nothing to delete locally. Once a key pair is captured for `test-owner@example.com` (OwnerID 741776) and `rolos-apitest-544d36@roomsonline.co.za` (OwnerID 741769) — RU dashboard → Security settings, signed in as that sub-user — the per-candidate Archive button will close them and they then drop out of the list as archived.

## Technical notes

- Migration: create table + GRANTs + RLS + admin policies + `updated_at` trigger; back-fill from `ru_owner_accounts` where keys already exist.
- Files: `supabase/functions/rentalsunited-api/index.ts` (archived flag in `extractUsers`, OwnerID-keyed `resolveChildAuth`), `supabase/functions/ru-cert-portal/index.ts` (key actions keyed by OwnerID), `supabase/functions/ru-close-user/index.ts` (key lookup by OwnerID), `src/components/portfolio/PortfolioRuAccountsTab.tsx` (archived filter, sub-user selector, per-OwnerID key state).
- Adapter-lock note: no locked availability/booking code is touched.