# Fix stale "Not pushed" badges in the Onboard-a-property picker

DEMO D really is pushed — the database already records the listing verification against
`test3@polka.co.za (OwnerID 742570)` and the portfolio carries a bound distribution account
(OwnerID 742570, keys verified 18:00). The badge is simply out of date.

## Why it happens

The picker loads its property list and its status badges once, in an effect keyed only on the
deep-link ids. Nothing re-runs it when an onboarding run finishes, so the badges keep whatever
verdict they had when the console was first opened. Reopening the dropdown only re-renders the
already-loaded options — it does not re-read the database.

A second, smaller issue: the status read pulls `ru_owner_accounts` and the listing-verification
columns that were fetched in the same stale pass, so even a manual refresh of one part leaves the
other behind.

## What to change

1. Split the picker load into two steps: the eligibility list (unchanged) and a re-runnable status
   read that re-queries the binding rows and the listing-verification columns for the options
   already on screen.
2. Re-run the status read when:
   - the dropdown is opened (cheap, two reads, so the badge is always current when the operator
     looks at it), and
   - an onboarding run reaches a terminal state (Step A/B complete, or a channel connect finishes),
     so the entry the operator just onboarded flips colour without a page reload.
3. Keep the existing red/orange/green rule and sort order exactly as they are — this is purely a
   freshness fix, no change to how a verdict is decided.
4. Guard against overlapping reads (ignore a resolved read that is not the latest) so a fast
   open/close cannot leave an older verdict on screen.

## Technical notes

- File: `src/components/admin/channel-monitor/ChannelOnboardTab.tsx`.
- Extract the inner status IIFE (currently around lines 491–556) into a `useCallback`
  (`refreshOnboardStatuses`) that takes the current options and sets state, and call it from the
  existing load, from the combobox `onOpenChange`, and from the run-completion effect.
- No schema, edge function or backend change is needed.
