# RU sub-user auth: move to per-sub-user API keys

## What RU told us, and what it means here

Every sub-user is a separate RU account, and since late 2025 new accounts must authenticate with **API keys** (`AccessKey` / `SecretKey`) — not the portal username/password. Today ROLOS authenticates all sub-user actions with `<UserName>`/`<Password>` (confirmed in `rentalsunited-api`'s child auth builder and `ru-close-user`), which is why company details and archiving return Status `-4` even though the portal login works.

Confirmed from the RU reference:
- `Push_ArchiveUser_RQ` takes `AccessKey`/`SecretKey` only — the sub-user's own keys.
- `Push_CreateApiKey_RQ` (`Scope: XmlApi`, `Label`), `Pull_GetApiKeys_RQ`, delete-key all authenticate with an **existing** key pair for that same account.
- `Push_CreateUser_RQ` returns no keys, and brand-new accounts must generate their **first** key pair in the RU platform UI (Security settings). So the first pair per sub-user is a one-time manual paste; every later key can be minted through the API.

## What we'll build

1. **Store per-sub-user API keys.** Add `ru_api_access_key`, `ru_api_secret_enc` (encrypted), `ru_api_key_label`, `ru_api_keys_verified_at` to `ru_owner_accounts`. Secret is written encrypted and never returned to the browser.

2. **Child API-key auth everywhere.** In `rentalsunited-api`, add a child-key envelope (`AccessKey`/`SecretKey` from the sub-user's stored keys) and use it for every child-scoped action: `fill_company_details`, `push_building` / `list_buildings` / `get_building`, `push_property`, `push_availability`, `push_prices`, discounts, pulls and reservations for that owner. The master key pair stays only for `create_user` and master-level listing. Legacy `UserName`/`Password` stays as a fallback **only** for accounts with no stored keys (RU allows both until an account migrates), so nothing that works today breaks.

3. **API-key management actions** in `rentalsunited-api`: `create_child_api_key` (`Push_CreateApiKey_RQ`), `list_child_api_keys` (`Pull_GetApiKeys_RQ`), `delete_child_api_key`, and `verify_child_api_keys` (probe `Pull_ListProp_RQ` with the child keys) — all authenticated with that sub-user's existing keys.

4. **Fix archiving.** `ru-close-user` switches to the child `AccessKey`/`SecretKey` envelope. Credential order: keys supplied in the request → stored keys for that OwnerID → `API_KEYS_REQUIRED` (422) telling the UI to prompt. The old `PASSWORD_REQUIRED` path is retired.

5. **UI in `/admin/portfolios` → RU tab (`PortfolioRuAccountsTab.tsx`).**
   - An **API keys** block per RU account: masked AccessKey, verified-at stamp, "Paste keys" dialog (with a link to RU Security settings for the first pair), **Verify**, **Create additional key**, and a key list from `Pull_GetApiKeys_RQ`.
   - The per-row **Archive** button prompts for that sub-user's AccessKey/SecretKey when none are stored, instead of a password.
   - Accounts without keys show an "API keys required" badge so it's obvious why a phase is blocked.

6. **Onboarding pipeline.** Phase 1 in `ru-cert-portal` gains an explicit "API keys captured" gate after user creation: company details (`Push_FillCompanyDetails_RQ`) and everything downstream authenticate with the child keys when present, falling back to the stored password only for pre-migration accounts. Phase readiness in `ruPhaseGate.ts` reports the missing-keys reason.

## Technical notes

- Migration adds the four columns plus GRANTs matching the table's existing policies; secret stored via `encrypt_sensitive_text`, read back in edge functions via `decrypt_sensitive_text` under `service_role`.
- `rentalsunited-api` is under adapter lock for `child authentication builders`, `fill_company_details`, `push_property`, `push_building`, `list_buildings`, `get_building`. **This plan requires editing those locked regions** — approving this plan is the explicit approval for that change. `buildPushPropertyXml` itself stays untouched.
- Logging keeps redacting `AccessKey`, `SecretKey` and `Password`; keys are never logged or echoed in API responses (only the last 4 characters of an AccessKey are shown in the UI).
- Deploy and smoke-test `rentalsunited-api`, `ru-close-user` and `ru-cert-portal` after the edits: verify a child key pair, then archive one of the test sub-users to confirm Status `0`.

## What you'll need to do once

For each existing test sub-user (741765, 741771, 741776, 741777, 741778, 741769, 741761), log into that sub-user in the RU dashboard → Security settings, generate the first API key pair, and paste it into the new API keys dialog. After that, ROLOS mints and rotates keys for new sub-users through `Push_CreateApiKey_RQ` — but the very first pair for each brand-new account still has to come from the RU UI unless RU enables key creation on the master for children.
