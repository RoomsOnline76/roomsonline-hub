# Clean up duplicate channel listings and hide them from the monitor

## What is actually in the data

For Seesig Self Catering Chalets there are 9 correct unit records (Albatros, Anemoon, Duiker, Oester, Seester, Strandloper, Swartmossel, Tobie, Witmossel) — all active, all pushed today with listing IDs 5763142–5763199.

Alongside them sit 17 deactivated duplicate records (ALBATROS, ANEMOON, DUIKER, SEESTER, STANDLOPER, repeated Oester/Swartmossel/Tobie rows). Twelve of them still carry a channel listing ID (5733057–5733098 and 5763140/5763141/5763385/5763386), and five carry none.

That is the problem: deactivating them locally never removed the listing at the channel manager, so the duplicates still exist there (and can still bill), and the monitor keeps rendering them as "Inactive / Re-activate" rows — inviting exactly the wrong action.

## What to change

**1. Stop showing duplicates as re-activatable units**

In the Channel Manager cost table, the expanded unit grid lists only the live units (the real 9). Deactivated mirrors are not units anymore — they get no "Re-activate" button. Rows with no listing ID disappear entirely.

**2. New "Duplicate listings" section**

Any deactivated record that still holds a channel listing ID appears in a separate, clearly-labelled block under the property with a single action: **Remove from channel**. This archives the listing at the channel manager and then clears the stored listing ID so the record can never be resurrected or re-pushed. A "Remove all duplicates" button handles the whole property in one click, with a confirmation step.

**3. Reconcile against the channel before acting**

Before removal, pull the owner account's real listing list from the channel manager and compare it to the canonical 9. Listings that no longer exist on the channel side are cleared locally without an API call; listings that do exist are archived first, then cleared. Every removal is written to the archive event log with actor and count, so there is an audit trail.

**4. Counts and cost stop counting duplicates**

The "Archived units" column becomes "Duplicates" and only counts deactivated records that still have a live channel footprint (so it drops to zero once cleaned). Listing counts and the monthly cost forecast already count active units only — they stay as they are, but the duplicate count is what tells you there is money leaking.

**5. Prevent it happening again**

- Deactivating a unit clears its stored listing ID once the channel manager confirms the archive, so a stale ID can never linger.
- The mirror-sync path that creates unit records will not create a second record for a name that already maps to an active unit; it reuses the existing one.

## Technical notes

- `src/hooks/useChannelCostMonitor.ts`: split `units` into `units` (active, with listing ID) and `duplicates` (inactive with listing ID); drop inactive rows without a listing ID; `archivedUnits` becomes `duplicateListings`.
- `src/components/admin/channel-monitor/ChannelPropertyTable.tsx`: remove the re-activate control for inactive mirrors, add the duplicates block plus per-unit and bulk "Remove from channel" actions.
- `src/pages/AdminChannelMonitor.tsx`: new handler calling a `purge_duplicates` path.
- `supabase/functions/channel-manager-entitlement/index.ts`: add `scope: "duplicate_listing"` (and a property-wide variant) that resolves the RU owner ID, calls `list_properties` to check existence, `set_property_status` (archive) where needed, nulls `hostfully_room_types.rentalsunited_property_id`, and records a `ru_archive_events` row with direction `purged`. Also null the listing ID on the existing unit-deactivate path after a successful archive.
- No schema change is required; `ru_archive_events.direction` is free text.

## Verification

Run the reconciliation for Seesig, confirm the channel manager reports exactly 9 active listings for the owner account, that the 17 duplicate records hold no listing ID afterwards, and that the monitor shows 9 listings with zero duplicates.
