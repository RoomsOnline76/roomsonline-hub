---
name: Channel Onboarding Lean Traffic
description: One roster/listing read, one price read-back, no activation re-push, no redundant currency write during a channel onboarding run
type: feature
---

A clean onboarding run must produce **zero rate-limited (429)** channel calls. The four rules that
keep it that way (order and flow of the run are unchanged):

1. **Listing roster read once.** Adoption inside `push_property` reads `ru_owner_listing_cache`
   (shared, DB-backed, one sliding window) before touching `Pull_ListOwnerProp_RQ`, and writes it
   after every read and after a create/adopt. An EMPTY cached listing array inside the window is a
   valid hit — treating it as a miss re-opens the storm.
2. **One price read-back.** The post-push verification's `get_prices` XML is handed to
   `auditChannelPriceCoverage` via `priceXml`/`windowFrom`/`windowTo`. The audit only pulls prices
   itself when no XML was supplied.
3. **Activation never re-pushes ARI.** `channel-manager-entitlement` skips `refresh_ari` when
   `skip_ari_refresh` is passed (the onboarding orchestrator always does) or when a successful
   `availability_verification`/`prices_verification` was logged for the property in the last 10 min.
4. **Currency writes are conditional.** `decideRuCurrency` skips `Push_ChangeCurrency_RQ` when a
   scoped location read-back — or the durable `ru_currency_state` verdict for the same owner scope
   and location — already reports the authored ISO.
