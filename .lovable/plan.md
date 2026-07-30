## What I found

Confirmed by reading the code and the account row:

- The sub-user account `rooms@roomsonline.co.za` / OwnerID `741761` exists locally, **does hold an encrypted password**, and its company-details status is `failed` (never confirmed by Rentals United).
- Master-account calls (create user, list users, push property — all of which work today) send credentials as:
  `<Authentication><AccessKey>…</AccessKey><SecretKey>…</SecretKey></Authentication>`
- But `Push_FillCompanyDetails_RQ` is the **only** call that switches node names when authenticating as the sub-user:
  `<Authentication><UserName>…</UserName><Password>…</Password></Authentication>`

So the sub-user login is being sent in a different envelope shape from the one Rentals United accepts everywhere else in this integration. That is the most likely cause of the "incorrect password" rejection — the password value may be fine, the wrapper isn't. (Unconfirmed until we replay it, so step 1 verifies rather than assumes.)

Secondary possibility: the stored password no longer matches the portal password (the account was created with a generated password, then changed). You supplied `SLPafrica247*` in chat — I will not put that in code; it gets saved through the existing encrypted-storage action.

## Plan

1. **Re-save the password securely.** Use the existing admin "Reset password" control (`save_login_password` in `ru-cert-portal`) to store the current portal password encrypted for OwnerID 741761, so the retry uses the real value. Audit-logged as today.
2. **Send sub-user credentials in the accepted envelope.** In `rentalsunited-api`, change `buildFillCompanyDetailsXml` so sub-user auth uses the same `AccessKey`/`SecretKey` node names as every other working call, with the sub-user login email and password as values.
3. **Add a one-shot fallback.** If Rentals United rejects that with an auth/credential error, retry once with the legacy `UserName`/`Password` shape, and log which variant succeeded — so whichever RU actually wants, Phase 1 completes and we learn the correct format from the log.
4. **Distinguish auth failures from validation failures.** In `ru-cert-portal`'s retry loop, classify RU auth rejections separately so the UI says "Rentals United rejected the sub-user login" (with a link to reset the password) instead of the generic "non-2xx" / "company details failed" message.
5. **Verify end-to-end.** Re-run Phase 1 → "Complete company details" for the Jongensfontein portfolio account and confirm `company_details_sent = true` and `company_filled_at` is set, with passwords masked in all logs.

## Technical notes

- Files: `supabase/functions/rentalsunited-api/index.ts` (`buildFillCompanyDetailsXml`, `fill_company_details` handler), `supabase/functions/ru-cert-portal/index.ts` (`submitCompanyDetails` retry/classification).
- No schema changes; password stays in `ru_owner_accounts.ru_login_password_enc` via `encrypt_sensitive_text`.
- Existing `<Password>***</Password>` log masking is extended to cover `SecretKey` for sub-user auth.
