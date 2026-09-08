---
name: Channel account portfolio inheritance
description: One distribution sub-account per portfolio; siblings inherit a bound account even when its ru_owner_accounts row is scoped to a single member property
type: feature
---

One Channel Manager distribution sub-account serves a whole portfolio. The binding row in
`ru_owner_accounts` may be written portfolio-scoped OR against one member property (Step A
provisioning ran from that property). Both count for every member.

Binding readers must therefore try, in order: portfolio-scoped row → this property's row →
a bound row belonging to any **sibling** property in the same portfolio (scope reported as
`portfolio`). Implemented in `findOwnerAccount` (`_shared/ruPhaseGate.ts`), `readBinding`
(`ru-onboard-property`) and the Channel Monitor's Onboard tab (`inherited` flag over
`memberIds`).

**Why:** AlbatrosTEST read as "unbound / not linked to account" although its portfolio sibling
Sealion held the live account `rentalsu@polka.co.za` (OwnerID 742649); pushes would have failed
with RU_OWNER_UNRESOLVED. Shell rows (no OwnerID) never count — see channel-account-shell-rows.
