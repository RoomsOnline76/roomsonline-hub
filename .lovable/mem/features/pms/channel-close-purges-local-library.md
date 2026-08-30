---
name: A confirmed account close purges the local library
description: Closing a distribution sub-account deletes its credentials, binding row, cached listings, cached roster entry and parked calls
type: feature
---
When the channel confirms `Push_ArchiveUser_RQ` (close user account), the run must erase the
account from ROL'OS's own library in the same pass:

- `ru_api_credentials` row deleted (the close destroys the channel-side keys),
- `ru_owner_accounts` row for that OwnerID deleted (no binding may survive a close),
- cached listings dropped (`ru_owner_listing_cache`) and the OwnerID removed from the cached
  roster (`ru_roster_cache`, memo invalidated) — otherwise cache-backed surfaces keep asking the
  channel about a dead account for the whole TTL,
- outstanding `ru_call_queue` rows cancelled, except the run's own `ru_close_account` lock row.

**Why:** reconciliation and the roster panel kept reading closed accounts because the caches still
listed them, burning sliding-minute slots live accounts needed.
