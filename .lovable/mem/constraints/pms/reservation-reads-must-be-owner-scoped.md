---
name: Reservation reads must be owner-scoped
description: Pull_GetReservationByID and reservation lookups must run on the owning sub-account; a master-scoped "Reservation does not exist" (status 28) is never proof of absence
type: constraint
---

A reservation is only visible inside the sub-account that holds the listing. A reservation read
that names only a `property_id` must derive the OwnerID from that property
(`ru_owner_accounts` direct binding → its portfolio's account) before choosing credentials —
`rentalsunited-api` does this for every child-scoped action.

**Why:** unscoped reads ran on MASTER credentials, RU answered status **28 Reservation does not
exist**, and callers read that as "absent at the channel" — which produced the confirm →
modify → re-read cascade seen on ROL-C73-0010 (reservation 147109937).

Absence may only be concluded from a read whose `auth_mode` is NOT `master`
(`channelBookingSync.resolveCurrentListing`, `ruReservationIdentity.readChannelState`).
