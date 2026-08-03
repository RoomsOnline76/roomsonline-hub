---
name: RU sub-user API key authentication
description: Rentals United sub-accounts must authenticate all child-scoped API calls with their own AccessKey/SecretKey, not UserName/Password
type: feature
---

Rentals United (Nov-2025 rollout) requires every sub-user account to authenticate API calls with
**its own API key pair** (`<AccessKey>` + `<SecretKey>`, scope `XmlApi`). The legacy
`<UserName>`/`<Password>` envelope returns Status `-4` "Incorrect login or password" on new
sub-accounts. The MASTER key pair must never be used for child-scoped methods
(`Push_FillCompanyDetails_RQ`, `Push_PutBuilding_RQ`, `Pull_ListBuildings_RQ`,
`Push_ArchiveUser_RQ`) — those methods have no `<OwnerID>` and apply to whoever authenticates.

Storage: `ru_api_credentials` keyed on `ru_owner_id` (unique) — `access_key`, `secret_enc`
(encrypted), `key_label`, `verified_at`. Keys MUST be stored per RU OwnerID, never on the single
`ru_owner_accounts` row per portfolio (that overwrote the previous sub-user's keys). Legacy columns
`ru_owner_accounts.ru_api_access_key` / `ru_api_secret_enc` are a mirror/fallback only.

Archived sub-users: RU renames the login to `Archived_<email>`; the UI hides them behind a
"Show archived" toggle and archiving deletes the stored key row.

Resolution order for child calls (`resolveChildAuth` in `rentalsunited-api`):
request keys → `ru_api_credentials` for that OwnerID/login email → legacy `ru_owner_accounts` keys
→ legacy password (older accounts only).


Key management actions:
- `rentalsunited-api`: `create_child_api_key` (Push_CreateApiKey_RQ, Scope `XmlApi`),
  `list_child_api_keys` (Pull_GetApiKeys_RQ), `delete_child_api_key` (Push_DeleteApiKey_RQ),
  `verify_child_login` (accepts keys or password).
- `ru-cert-portal`: `save_api_keys` (validates then encrypts), `verify_api_keys`, `create_api_key`.

The FIRST pair cannot be minted via API for a fresh sub-user — the admin generates it in the RU
dashboard (Security settings, https://new.rentalsunited.com/My/SecuritySettings) while signed in as
the sub-user, and captures it in Portfolios → RU accounts.
