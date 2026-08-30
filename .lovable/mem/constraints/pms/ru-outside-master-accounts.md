---
name: RU accounts outside our master
description: Sub-accounts registered under a different master (e.g. 742615 / julius@polka.co.za) must never be called, archived, or acted on — retired-registry exclusion only
type: constraint
---

OwnerID 742615 (julius@polka.co.za) is registered **outside our master account**. We are not
authorised to watch its changes and the channel refuses any close/archive/key action from us.

**Rule:** such accounts get a `ru_retired_accounts` row (with the REAL portal login email, not a
placeholder) so `fetchRetiredRuOwnerIds` excludes them from every roster read, count, cost and
health path. Never attempt channel-side close/archive/key-mint/revoke on them — those calls fail
and surface as errors. Never delete the retired row: that would re-admit the account to roster reads.

Verified clean of local artifacts on 2026-08-30: no `ru_owner_accounts` binding, no
`ru_api_credentials` pair, no `ru_call_queue` / `ru_lnm_repull_queue` rows, no readiness snapshots.
The Master account roster panel additionally hides any account that is unbound + keyless + retired.
