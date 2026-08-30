---
name: Never re-archive a disconnected listing
description: Archive/sterilize/retire runs skip listings already archived at the channel or owned by a closed sub-account
type: constraint
---
Once a listing has been archived at the channel (`Push_SetPropertiesStatus_RQ` with
`IsArchived=1` succeeded), or its sub-account was closed with `Push_ArchiveUser_RQ`, the property
is disconnected from the channel. Pushing the identical status again buys nothing and burns the
sliding-minute window, so the run comes back `RU_RATE_DEFERRED` over and over.

**Rule:** `sterilize_property` and `retire_owner_account` in `ru-cert-portal` resolve settled work
first via `alreadySettledListings()` and skip it, reporting it as *already disconnected* rather
than archiving it again. The truth source is `ru_api_log` (retained by sterilization, unlike
`ru_archive_events` and the local columns), read chronologically so a later reactivation
(`IsArchived=0`) re-opens the listing for archiving.
