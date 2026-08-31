---
name: Dead channel listing ids are never reused
description: A listing archived/deleted at the channel keeps answering status 18 on update — mint a new listing instead of reusing or reactivating its id
type: constraint
---

A channel listing that was published and then archived/deleted still appears in the owner's
listing list, but the channel refuses every update against it with status 18
"Property with given ID does not exist." That id can never be reused.

Rules:
- On status 18 (or any "property … does not exist" message) against an existing listing id,
  re-send the content push once as a **create** (id 0) and store the new id.
- The dead id must be purged from the in-memory and shared owner listing snapshots so no later
  unit or push adopts it again.
- Adoption of an archived name match plus reactivation is not sufficient — if the reactivated
  listing still refuses the update, a new listing is the only correct outcome.
- Caller-side stale detection must match "property with given ID does not exist" too, not just
  "property does not exist".

**Why:** reusing an archived listing id blocked Step B publishing (Leopard) and looked like an
XSD failure; status 18 is the channel saying the id is dead, not that our payload is wrong.
