---
name: Channel currency flips are OwnerID-scoped
description: Never skip a currency write on another account's location knowledge; drift is corrected by re-flipping, never by USD conversion
type: constraint
---

The channel applies a location's currency **per authenticating account**. Cross-account location
knowledge is therefore never evidence for this account.

- No any-scope short-circuit. `decideRuCurrency` may skip `Push_ChangeCurrency_RQ` only on
  OwnerID-scoped evidence: a `ru_readback` row for this OwnerID + LocationID + ISO, a prior
  successful write on the same triple, or a durable listing verdict whose `owner_scope` and
  `ru_location_id` match. A first list on a new OwnerID always sends exactly one child-scoped
  flip. `skip_reason: 'currency_already_set_location'` is retired — do not reintroduce it.
- Status 339 is success and counts as this account's read-back (`source: 'ru_readback'`), is never
  retried, and never fails the listing create.
- Post-`PutProperty` drift (channel reports USD while we authored ZAR) triggers ONE corrective
  child-scoped flip plus one re-read (`correctCurrencyDrift`). If it still disagrees the verdict
  stays `flip_outcome: 'failed'` (red drift) with `conversion_in_force = false`. **Never** convert
  rates to USD because of drift.
- USD fallback engages only on an explicit channel refusal (`flip_outcome: 'failed'`). `deferred`
  (429 / `RU_RATE_DEFERRED`), `unknown_location` and dry runs retain the authored ISO.

**Why:** a shared location cache let brand-new sub-accounts publish USD while the tracker echoed
our own assumption back as ZAR.
