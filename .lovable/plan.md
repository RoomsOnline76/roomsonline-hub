## Plan: RU XML AccessKey/SecretKey failures on WL Sync

**Confirmed current state**
- The RU adapter builds XML with `<AccessKey>` and `<SecretKey>`, not username/password.
- Runtime secrets `RENTALS_UNITED_API_KEY` and `RENTALS_UNITED_API_SECRET` exist.
- The database also has an active `pms_credentials` row for `rentalsunited`; recent sync failures show RU returning **“Incorrect login or password”** on ARI refresh, reservation pull, and RLNM handler refresh.
- The WL Sync page is only displaying RU’s auth error text, which is why it reads like a username/password issue.

## Implementation steps

1. **Normalize RU credential loading**
   - Update the shared RU XML adapter logic in `rentalsunited-api` so `AccessKey`/`SecretKey` are trimmed and validated before use.
   - Prefer the dedicated runtime secrets for backend calls, and only fall back to the `pms_credentials` row when secrets are absent.
   - Return a clear configuration error if the saved values are missing, blank, or look like placeholder text.

2. **Stop misleading “username/password” wording in ROLOS UI**
   - Update `/admin/integrations/rentals-united` sync display so RU auth failures are labeled as **AccessKey / SecretKey authentication failed**.
   - Keep RU’s raw message available in run details for evidence.

3. **Improve RU credentials card in Admin integrations**
   - Rename the fields from generic “API Key / API Secret” to **AccessKey / SecretKey**.
   - Add short helper text explaining these are the RU XML credentials.
   - Keep the endpoint default as `https://rm.rentalsunited.com/api/Handler.ashx`.

4. **Validate with live calls**
   - Deploy the touched edge function.
   - Run `health_check` and one read-only RU call through the deployed function.
   - If RU still rejects the credentials, open the secure secret update form for `RENTALS_UNITED_API_KEY` and `RENTALS_UNITED_API_SECRET` rather than exposing or requesting values in chat.

## Technical notes
- No database schema change is planned.
- No RU guest communication work is included.
- The existing `ru_sync_runs` evidence table remains the source of WL Sync history.