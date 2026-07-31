## What I verified

Rentals United (live `Pull_ListMyUsers`) currently holds **two** sub-users under our master account for Jongensfontein:

| OwnerID | RU login email | UserAccountId |
|---|---|---|
| 741765 | connect@roomsonline.co.za | 0 |
| 741761 | rooms@roomsonline.co.za | 0 |

Our local record (`ru_owner_accounts`, portfolio Jongensfontein) is currently:
- `owner_email` = connect@roomsonline.co.za (resolved from the portfolio owner profile)
- `ru_login_email` = rooms@roomsonline.co.za
- `ru_owner_id` = **null**, `ru_user_id` = **null**, stored password = **none**
- `company_details_status` = pending

So the earlier "email changed" logic wiped the RU identity and the encrypted password from our row, and the sub-user creation step now keys **only** on the resolved owner email. Because the local row no longer carries an OwnerID and the two RU logins disagree with each other, Phase 1 cannot reconnect to 741765/741761 and cannot authenticate `Push_FillCompanyDetails_RQ` (no retained password).

## Fix

1. **Look up by identity, not just email** (`supabase/functions/ru-cert-portal/index.ts`)
   - Add a `matchByStoredIdentity()` helper that matches an RU sub-user by stored `ru_owner_id` first, then by `ru_login_email` / `owner_email`, and use it as a fallback wherever `matchByEmail()` is used today (pre-existing check, email-taken recovery, post-create backfill).
   - Result: an account renamed in the RU portal is adopted instead of reported as missing.

2. **Stop losing the password on adoption**
   - Relax the `sameRuIdentity` test so the retained encrypted password is preserved when **either** the email **or** the RU OwnerID still matches (today it requires both).
   - Never wipe `ru_login_password_enc` when `list_users` shows the same OwnerID.

3. **Make the email-change wipe conservative**
   - Only treat the identity as stale when RU no longer lists an owner matching the stored OwnerID. A portal-side login rename must not erase credentials.

4. **Explicit account selection when RU has duplicates**
   - In the RU accounts tab, when more than one RU sub-user matches this owner/portfolio, show both (OwnerID + login email) and let the admin pick which one to bind. Bind writes `ru_owner_id` + `ru_login_email` to the local row.

5. **Password re-entry path (already partly present)**
   - After binding, if we hold no password for the account, surface the existing in-app "Save password" dialog under Portfolios → RU accounts so the reset password from the RU portal can be stored (encrypted) once, then re-run "Complete company details".

## Immediate data repair

Bind the local row to the intended RU account so Phase 1 stops recreating: set `ru_owner_id` / `ru_login_email` to the account you want to keep (recommend **741765 / connect@roomsonline.co.za**, since it matches the portfolio owner profile), then save the RU-portal password for it. If you'd rather keep **741761 / rooms@roomsonline.co.za**, I'll bind that one and also update the portfolio owner email so the two never drift apart again.

## Technical notes

- All edits are inside `supabase/functions/ru-cert-portal/index.ts` plus `src/components/integrations/PortfolioRuAccountsTab.tsx` (selection UI). No schema change needed — `ru_owner_accounts` already has `ru_owner_id`, `ru_login_email`, `ru_login_password_enc`.
- Passwords stay encrypted via `encrypt_sensitive_text`; reveal/reset remains audit-logged.
- Note RU returns `UserAccountId = 0` for both accounts, so OwnerID is the only reliable key — the matching logic will treat `0` as unusable (as it already does).
