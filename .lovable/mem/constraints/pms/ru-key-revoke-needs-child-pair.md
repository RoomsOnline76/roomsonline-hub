---
name: Channel key revocation requires a stored child key pair
description: Pull_GetApiKeys_RQ / Push_DeleteApiKey_RQ refuse login/password auth (status -4); without a proven child pair keys can only be removed in the channel portal
type: constraint
---

Rentals United key-management verbs (`Pull_GetApiKeys_RQ`, `Push_DeleteApiKey_RQ`) accept **only**
AccessKey/SecretKey auth. The portal login + password envelope returns status `-4`
"Incorrect login or password" — verified live for both the bare login and the `Archived_<email>`
form, and for the shared operator password `SLPafrica247*`.

Consequences (do not re-litigate):
- Master pairs must never be used to list/delete keys — they would delete the MASTER account's keys.
- Retired accounts with `key_scope != 'child'` (master pair / unverified / no row) **cannot** have
  their keys revoked over the API. The panel must say so ("No sub-account key pair — remove in the
  channel portal") instead of offering a retry that can only fail, and must never report keys as
  released when only the local `ru_api_credentials` row was deleted.
- Asking the operator for the portal password does not unblock a key revoke; it is only useful for
  other password-capable verbs.
