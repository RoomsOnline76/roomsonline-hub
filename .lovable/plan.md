# Channel push gate timer in the property editor

Add a quiet countdown pill in the property editor and setup wizard showing when the channel manager will accept the next push for that property. It sits bottom-right, just above the floating assistant button, and never shouts.

## Why it is needed

The channel enforces one push per method per sliding minute. Today an operator who saves twice in quick succession only learns about the gate from a "queued" toast. A visible countdown makes the wait predictable.

## What the operator sees

- Idle: a small muted pill — "Channel push ready" with a subtle dot. Low contrast, no animation.
- Counting down: the same pill shows a thin progress ring and "Next push in 42s", split per section when both content and rates are held (content vs rates/availability).
- The pill fades out entirely once both sections have been clear for a few seconds, so a normal editing session stays uncluttered.
- Only rendered for properties that are actually distributed through the channel; hidden otherwise.

## How it works

1. New read-only database helper `ru_push_gate_status(property_id)` returns, per section (`content`, `rates`), the last outbound push timestamp from the channel exchange log and the seconds remaining in the 60-second window. It is a security-definer function gated by the existing `can_access_channel_property` check plus `fearless_leader`, because the raw exchange log stays admin-only.
2. New component `src/components/property/RuRateGateTimer.tsx`: fetches that helper on mount, refreshes every 15 seconds and immediately after a save, and ticks the countdown locally each second so there is no polling storm.
3. Mounted from `src/pages/PropertyForm.tsx` (covers both edit-property and setup-property) at `fixed right-6` above the existing floating help button, `z-50`.

## Technical notes

- Sections map to log actions: `Push_PutProperty_RQ` -> content; `Push_PutPrices_RQ` / `Push_PutAvbUnits_RQ` -> rates.
- Window constant mirrors `RU_RATE_WINDOW_SECONDS` (60s) from `supabase/functions/_shared/ruRateGate.ts`.
- Styling uses semantic tokens only (`bg-card`, `border-border`, `text-muted-foreground`, `text-primary` for the ring) — no hardcoded colours.
- No change to push, delta or readiness logic; this is presentation only.
