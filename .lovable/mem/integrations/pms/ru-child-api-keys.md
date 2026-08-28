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

Atomic Step A mints the FIRST pair automatically for a fresh sub-user: it uses the login/password
created in the same run for `Push_CreateApiKey_RQ`, then immediately encrypts and stores the returned
SecretKey. Operators never paste API keys during onboarding. Existing accounts without usable keys
can provide their current sub-account password; saving it retries automatic creation and storage.

Per-property surface (ROL'OS PMS only): `src/components/property/PropertyRuOwnerPanel.tsx` on the
Identity tab of edit/setup property. It calls `ru-cert-portal` action `property_ru_identity`, which
returns the linked OwnerID, key state (last 4 + label + verified_at), portfolio siblings sharing the
identity, sub-account creation readiness checks, and `push_gated`/`gate_reason`. Creation reuses
`ensure_owner_account`. All ROL'OS sub-accounts are created with the shared operator password
`SLPafrica247*` (constant `RU_SUB_USER_PASSWORD`), which atomic Step A uses to mint and store the
first key pair. `PushToRentalsUnited` disables Fetch IDs / Push while `push_gated` is true.

Ownership is enforced on save: a valid pair is not proof of ownership. `save_api_keys` calls
`rentalsunited-api` action `verify_child_key_owner` (reads that OwnerID's listings under the pair and
identifies the authenticating account) and rejects cross-account pairs (`RU_CHILD_KEYS_WRONG_ACCOUNT`)
or a pair already stored for another OwnerID (`RU_CHILD_KEYS_DUPLICATE`). One AccessKey must never sit
on two OwnerIDs — `list_stored_api_keys` returns `shared_with_other_account` and the RU accounts panel
flags it. `list_properties` is child-auth strict: with no stored pair it returns
`RU_CHILD_AUTH_REQUIRED` instead of reading the master account (a master read looks like "the
sub-account was empty"). The wizard's pull card shows the account the pull authenticated as, separate
from the operator who clicked.

Rematch (Channel Monitor → Advanced → Master account roster → **Rematch stored keys**):
`ru-cert-portal` action `rematch_stored_keys` probes ONE stored pair per call (`credential_id` +
roster `candidates`) via `verify_child_key_owner`. A pair that enumerates the roster is stamped
`master_pair` and never refiled onto a sub-account. Outcomes: already correct / rematched (row's
`ru_owner_id` + `login_email` moved) / master pair / duplicate (target already holds a different
pair — never overwritten) / orphan (`forget_stored_key` removes only our local copy, never claims a
channel-side revoke). Secrets never leave the edge function — only the AccessKey's last 4.
