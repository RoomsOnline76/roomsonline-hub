# Fix: Fonteinhutte wizard halting on "Availability coverage — rolling 365 days"

## What is actually wrong

The property's data is fine. Confirmed by reading the records:

- All 9 active units are active, linked to the canonical ROL'OS units, and carry a channel listing ID.
- The Rack rate plan is active, priced (1000), flagged for channel distribution, and linked to all 9 units.
- Every active unit has a minimum stay of 1 authored.
- There are no stop-sell days blocking the next 365 days.

The blocker comes from the stored readiness snapshot, not the property. The saved snapshot for Fonteinhutte says availability and prices are verified, but its stored "worst unit window" is a placeholder of all zeros (longest run 0, open days 0, min stay not set). When the wizard opens without re-probing the channel, the readiness scorer trusts that stored window verbatim and emits two mandatory failures — "3 consecutive bookable days with a price" and "MinStay set" — inside the Availability 365d group. Two mandatory failures in that group is exactly what halts the wizard, even though the same snapshot records availability as verified.

So a throttled/empty channel read-back was persisted as a real "nothing is sellable" verdict, and it now sticks on every wizard load.

## The fix

1. Never persist a degenerate window. When a probe returns a window with zero open days and zero longest run, keep the previously stored window (or store none) instead of overwriting a good verdict with zeros.
2. Never block on a degenerate stored window. When the wizard serves the stored verdict, only use the stored window if it is meaningful; otherwise score the two rules on the ROL'OS calendar (the local window path that already exists and passes for this property).
3. Same rule on the snapshot-held path used when a live probe stays silent, so a rate-limited refresh cannot resurrect the same false blocker.
4. Clear the bad stored window for Fonteinhutte so the wizard recovers immediately.

## Technical notes

- `supabase/functions/ru-cert-portal/index.ts`
  - `saveAriSnapshot` call site: drop `worst_window` when the probed window has `open_days === 0 && longest_run === 0`, falling back to the existing snapshot value.
  - Add a small `isMeaningfulWindow()` guard; use it in the published-snapshot branch and the snapshot-held branch before choosing `bookableWindowChecks(...)` over `localBookableWindowChecks(localWindow, ...)`.
- One-off data correction: strip `worst_window` from the `ru_readiness_snapshots` row for Fonteinhutte.
- No changes to push logic, gates, or the wizard UI — the ROL'OS-scored window path already exists and is what the pre-publish and push gate use.

## Verification

- Re-score Fonteinhutte's readiness and confirm the Availability 365d group reports no mandatory failures and the wizard no longer halts.
- Confirm the other Jongensfontein properties still score unchanged.
