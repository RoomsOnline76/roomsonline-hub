---
name: No CurrencyID on the listing push
description: Push_PutProperty has no CurrencyID element — it invalidates the whole document; currency is location-scoped via Push_ChangeCurrency_RQ. Obsolete CleaningPrice omitted when zero.
type: constraint
---

Rentals United's `Push_PutProperty_RQ` XSD does **not** accept `<CurrencyID>`. Sending it rejects
the entire document:

> The element 'Property' has invalid child element 'CurrencyID'. List of possible elements
> expected: 'DetailedLocationID'.

Rules:
- Never re-add `<CurrencyID>` to `buildPushPropertyXml`. Currency belongs to the **LocationID** and
  is only authored by `Push_ChangeCurrency_RQ` (owner-scoped, child auth).
- `<CleaningPrice>` is deprecated (Notif 258 — "provide the cost of cleaning within the fees
  collection"). Only emit it when a legacy non-zero value exists.
- Status **310 "Cannot update property location because there are existing reservations"** counts
  every reservation ever attached to the listing (cancelled and past included), so an empty
  calendar does not clear it. On 310 the adapter reads the published `DetailedLocationID` and
  re-sends the content once with that value, returning `location_change_refused` — the rest of the
  delta must never be lost over a location the channel will not move.
