# Confirm the Jongensfontein "3 of 4 pushed" count is resolved

## Current state (verified)

- The portfolio has exactly 4 eligible members and a bound distribution account (OwnerID on the
  portfolio row), so all four are counted in the badge.
- Three members carry a listing-verification record (Tidal Pools, Dassiesingel, Fonteinhutte).
- The fourth, **Seesig Self-Catering Chalets**, has no verification record at all — but nine of its
  units already hold channel listing ids (5808333, 5829841, 5829842, …), which proves it was pushed.
  That mismatch is exactly what produced "3 of 4".

The push-proof rule was widened in the change just shipped: a property counts as pushed when it has
a verification record **or** when it (or any of its units) already carries a channel listing id. The
badges are also re-read when the dropdown is opened and after a run finishes. The screenshot was
taken against the previously loaded page, so it still shows the old count.

## Step 1 — Verify in the live preview

Open Channel Monitor → Onboard Property, open the picker, and confirm Jongensfontein.com now reads
**4 of 4 pushed**. No code change if it does.

## Step 2 — Only if it still reads 3 of 4

Then the count is not coming from the widened rule and the next candidates, in order, are:

1. The unit read is scoped to the portfolio's anchor property only rather than every member id —
   re-check the `hostfully_room_types` query's `in(property_id, …)` list against `memberIds`.
2. Seesig's units are excluded by an `is_active` filter somewhere in the same read.
3. Backfill the missing `ru_listings_verified_*` record for Seesig from its existing unit listing
   ids, so the durable record matches reality instead of relying on the fallback.

## Technical notes

- File: `src/components/admin/channel-monitor/ChannelOnboardTab.tsx` — `refreshOnboardStatuses`.
- No schema or edge function change is involved.
