# RU sub-user Archive: fix + per-account button

## What's wrong today

The "Close / Archive on RU" button calls the `ru-close-user` backend function, but that function has **never been deployed** — a direct call returns `NOT_FOUND` (404). So the click always fails with a function error. The code exists; it just isn't live.

Also, only the *currently bound* account can be archived. The list of existing RU sub-users (OwnerID 741765, 741777, 741778, 741769, 741761, 741776 in the screenshot) only offers **Bind**.

## What we'll do

1. **Deploy `ru-close-user`** so Close / Archive actually works.
2. **Add an "Archive" button next to every "Bind" button** in the "Or bind to an existing RU account" list. It calls `Push_ArchiveUser_RQ` (per RU docs: close user account) for that specific OwnerID.
3. **Password handling.** RU requires archive to authenticate *as the sub-user* (UserName + Password) — the master key must never be used, or the master account gets archived. Locally we only hold a stored password for OwnerID 741771; the other six have no local record. So:
   - If we already hold a stored password for that OwnerID, archive straight away (after a confirm dialog naming the OwnerID and email).
   - Otherwise, prompt for that sub-user's RU portal password in a small dialog, then archive with it. Nothing is persisted unless the archive succeeds.
4. **Clear local state on success**: if the archived OwnerID matches a local record, clear its RU identity fields (same reset the current Close path does) and refresh the list. Archived owners are removed from the bind candidate list.
5. **Clear error surfacing**: RU status `-4` / "incorrect login or password" reports as a wrong-password message with a retry prompt, rather than a generic failure.

## Technical detail

- `supabase/functions/ru-close-user/index.ts`
  - Accept either `account_id` (existing behaviour) **or** `ru_owner_id` + `login_email` + optional `password`.
  - Resolution order for credentials: explicit `password` from the request → stored `ru_login_password_enc` for a matching `ru_owner_accounts` row → 422 `PASSWORD_REQUIRED` telling the UI to prompt.
  - Keep child-only auth (`UserName`/`Password` envelope). Master `AccessKey`/`SecretKey` stays out of the archive request.
  - Keep admin/dev/fearless_leader gate and the sensitive audit-log entry; log the archived OwnerID and email, never the password.
  - Fix the XML escape helper — its replacements are currently no-ops, so a password containing `&` or `<` would break the envelope.
- `src/components/portfolio/PortfolioRuAccountsTab.tsx`
  - Per-row `Archive` button (destructive ghost, `Archive` icon) with per-row loading state keyed by `owner_id`.
  - Password prompt dialog (`archivePasswordFor` state) shown when the function replies `PASSWORD_REQUIRED`.
  - On success: toast, remove from `bindCandidates`, `refreshAccounts()`, invalidate the RU queries already used by the unbind path.
- Deploy `ru-close-user` after the edits and verify with a direct function call that it returns a validation error (not 404).

No database migration is needed.
