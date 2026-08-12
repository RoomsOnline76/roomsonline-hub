# Channel updates push themselves — manual sync becomes opt-in

RU White-Label certification expects a listed property to keep itself current: every content or ARI change is delivered as a delta push, with the full refresh only as a safety net. Today a save on an already-listed property mostly auto-pushes, but several save surfaces don't trigger anything and any delta that lands while the gate is unhappy is dropped, so an operator has to come back and click a manual sync. Manual should be an override, never the delivery mechanism.

## What changes

**1. Close the auto-push coverage gaps**

Verified today: auto-push fires from the property save, onboarding save, cancellation policy, portfolio commons share, arrival policy, unit amenity dialog, unit active toggle, and the rate-plan/stop-sell surfaces. Missing triggers to add:

- Unit (room) content saves in the Rooms manager — name, description, occupancy, bed composition, sizes, images, arrival instructions.
- Property and unit image/media changes, including main-photo tagging.
- Attraction distances / local experiences edits.
- Facilities & info edits that feed amenities and property attributes.

**2. Once listed and passing, the update goes out with no click**

- A delta on a property that is already listed and still passes the gate pushes silently — no operator step, no toast demanding action.
- If the delta arrives while a gate blocker exists, it is recorded as pending (not discarded) with the blocking reason, and re-fires automatically as soon as readiness scores clean again — so fixing the blocker publishes the change instead of requiring a manual repush.
- Content and ARI deltas stay separate, keep their fingerprint + debounce behaviour, and continue to never fail a save.

**3. Manual sync becomes an explicit opt-in**

- The sync card leads with the automatic state: "Updates push automatically — content pushed 4 minutes ago".
- The two force buttons move behind a small "Advanced" / force-sync disclosure, labelled as an override for when a push failed or you want to bypass the change fingerprint.
- A pending (gate-blocked) delta shows the blocker text and a link into the failing item, rather than a bare "not pushed" error.

**4. The gate itself is not weakened**

Readiness and phase gates keep refusing non-compliant pushes, and force-push stays admin-only. The change is only about who initiates a compliant update: the system, not the operator.

## Technical notes

- `src/lib/channelContentSync.ts`: unchanged contract; new call sites in `RoomManagerTab.tsx`, the media/image save paths, `InfoFacilitiesTab.tsx` / `LocalExperiencesManager`, keeping the fire-and-forget pattern.
- `supabase/functions/_shared/ruStaticDelta.ts` (and the ARI equivalent): when the underlying `push-property-to-ru` call returns `PHASE_BLOCKED` / `READINESS_UNVERIFIED`, log a `*_pending` run carrying the trigger, content hash and blockers instead of a terminal failure.
- Re-arm on readiness pass: when a readiness score for a property comes back clean and a `*_pending` run is outstanding, queue the delta immediately (evaluated in the readiness/scoring path plus the existing cron sweep as backstop).
- `src/components/property/ChannelContentSyncStatus.tsx`: restructured copy, collapsible force controls, pending state rendering with blocker text.
