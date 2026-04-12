# Rentals United: Switch Authentication from Username/Password to PAI (Key + Secret)

## Context

Rentals United now uses API authentication (API Key + API Secret) instead of username/password for both the main API and messaging. The current adapter uses XML `<UserName>/<Password>` auth blocks throughout.

## Changes

### 1. Edge Function — `supabase/functions/rentalsunited-api/index.ts`

- **Replace `RUCredentials` interface**: Change from `{ username, password, endpoint }` to `{ api_key, api_secret, endpoint }`
- **Update `buildAuthXml()**`: Replace `<UserName>/<Password>` XML with PAI auth format — likely `<APIKey>/<APISecret>` tags (per RU's PAI documentation)
- **Update `loadCredentials()**`: 
  - Env vars: `RENTALS_UNITED_API_KEY` + `RENTALS_UNITED_API_SECRET` (replace `RENTALS_UNITED_USERNAME`)
  - DB fallback: Read `api_key` + `api_secret` from `pms_credentials` instead of `username` + `api_key`
- **Update `health_check` response**: Report `api_key` and `api_secret` presence instead of username/password

### 2. Admin Keys UI — `src/pages/AdminKeys.tsx`

- **Rename form fields**: "API Username" → "API Key", "API Password" → "API Secret"
- **Rename state variables**: `rentalsunitedUsername` → reuse or relabel, `rentalsunitedApiKey` → map to api_secret
- **Update save handler**: Store `api_key` and `api_secret` fields in `pms_credentials` (use `api_key` for the key and a suitable column for the secret — likely `api_secret` or repurpose `username` field)
- **Update `isConfigured` check**: Check for `api_key` and `api_secret` instead of `api_key` and `username`

### 3. Channel Credential Editor — `src/components/pms/ChannelCredentialEditor.tsx`

- Update `rentalsunited` fields from `api_username`/`api_password` to `api_key`/`api_secret` with updated labels and placeholders

### 4. Database — `pms_credentials` table

Check if an `api_secret` column exists. If not, add one:

```sql
ALTER TABLE pms_credentials ADD COLUMN IF NOT EXISTS api_secret text;
```

Update existing RU rows to move data if needed.

## Files


| File                                             | Change                                                 |
| ------------------------------------------------ | ------------------------------------------------------ |
| `supabase/functions/rentalsunited-api/index.ts`  | Replace username/password auth with API Key/Secret PAI |
| `src/pages/AdminKeys.tsx`                        | Update RU form labels and field mapping                |
| `src/components/pms/ChannelCredentialEditor.tsx` | Update RU credential fields                            |
| Database migration                               | Add `api_secret` column if missing                     |
