# Fast property saves with verified channel deltas

## Goal
Make property saves complete quickly, persist only changed local data, and automatically send only the channel work actually owed, with clear delivery toasts.

## Confirmed current behavior
- The editor rebuilds and writes the full `properties` payload on every save, including the large nested amenities object.
- It then blocks the Save state on portfolio season syncing and sequential room-type reads/writes; each room currently performs its own lookup.
- Channel delivery itself runs after the local save, but a property-level content change such as the property name is copied into every distributed unit listing by the channel contract. Therefore all affected listings must be updated; the recent name-only save correctly registered one changed field but required three listing chunks and about 23 seconds of channel work.
- Unit-only changes can already be restricted to the changed unit IDs.
- The local success toast appears before the later channel confirmation, while the confirmation watcher can poll for up to 90 seconds. This makes the automatic sync feel absent even when it is running.
- The property-level capacity is currently overwritten with `2` on every save rather than preserving/authored capacity.

## Implementation

### 1. Make the local save genuinely patch-based
- Compare the submitted property snapshot with the loaded row before writing.
- Update only changed top-level columns; do not resend unchanged images, branding, integrations, or the full amenities document.
- Build a recursive amenities patch by merging only changed authored branches with the stored document, preserving fields owned by other panels.
- Stop overwriting property capacity with `2`; preserve the existing value unless the authored capacity changed.
- Treat a no-change save as an immediate no-op rather than issuing a database update.

### 2. Remove expensive work from unchanged saves
- Run portfolio season propagation only when season definitions changed.
- Run room-type persistence and orphan checks only when room/unit data changed.
- Load existing room rows once, resolve all room identities in memory, then perform the required writes without one lookup per room.
- Keep channel delivery outside the blocking Save state.

### 3. Tighten channel delta classification
- Continue splitting company, listing content, and rates/availability so unrelated sections are never pushed.
- Preserve unit scoping: a room-only edit sends only the affected unit listing IDs.
- For property-level fields duplicated into every channel listing (name, location, property amenities, property images, capacity), send all affected listings but log and report the exact changed fields; do not mislabel this as a full-content edit.
- Verify taxes, cleaning/security fees, charges, and mandatory onboarding fields are mapped to the correct content or rates pipeline so fee-only changes cannot be skipped.
- Keep readiness-blocked changes parked for automatic retry rather than requiring manual sync.

### 4. Make automatic delivery visible and truthful
- Replace the generic save toast with an immediate result that distinguishes:
  - local changes saved with named channel fields queued,
  - local-only changes saved,
  - no changes detected.
- Show one consolidated follow-up toast per save when the ledger confirms delivery, queues it behind a gate/rate limit, or rejects it.
- Include exact field labels and affected listing count where available; never claim “sent” until the sync ledger records success.
- Prevent stale or duplicate confirmation polls from producing repeated toasts for the same save.

### 5. Regression coverage and live verification
- Add tests for property patch generation, nested amenities preservation, capacity preservation, room/unit change gating, field-to-section classification, unit scoping, and delivery verdicts.
- Verify a no-op save, name-only edit, one-unit edit, amenities edit, image edit, location edit, and fee/rate edit.
- Confirm in the live sync ledger that each case records only its changed fields and expected listing scope, while the editor becomes usable immediately after the local write.

## Technical boundaries
- No availability or booking logic changes.
- Do not alter locked channel authentication, OwnerID resolution, phase-gate, inventory evidence, or XML adapter regions.
- A property-level channel field cannot be sent to only one unit when the channel stores that field on every listing; “delta” here means exact changed fields and only the listings/sections that depend on them, not an invalid partial listing payload.
