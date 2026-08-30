---
name: Channel location lock (RU status 310)
description: Status 310 location refusals are permanent per listing; ru_listing_location_locks caches the published DetailedLocationID so content deltas are a single accepted push
type: feature
---

Rentals United answers status **310 "Cannot update property location because there are existing
reservations"** for the whole life of a listing — it counts every reservation ever attached
(cancelled and past included), so an empty ROL'OS/RU calendar never clears it.

`public.ru_listing_location_locks` (ru_property_id PK, property_id, published_location_id,
refused_location_id, reason, refusal_count) remembers the refusal:

- On 310 the adapter reads the published `DetailedLocationID`, records the lock, and re-sends the
  content once with that value (`location_change_refused` in the response).
- On every later `push_property` the lock is read **before** building the XML and the published
  location is substituted up front (`location_lock_applied`). A content delta is therefore one
  accepted call — no failed attempt, no `Pull_ListSpecProp` read-back, no second push. That triple
  call pattern was also why the ledger recorded a success while the wire was still retrying.
- Moving such a listing to a genuinely new location requires a fresh listing id at the channel; the
  lock must be deleted only alongside that re-listing.
