# Remove the "Before you connect a channel" step

The pre-connect checklist sits in the wrong place: by the time someone reaches the Channel
Manager frame, content quality should already be settled. It gets removed, and the two things
it checked that the earlier readiness steps (1–5) do not yet check get added there instead.

## What changes for the user

- The "Before you connect a channel" card disappears from Channels / channel onboarding and
  from the admin Channel Onboard tab. Nothing blocks or gates the connect frame any more.
- Steps 1–5 (the readiness list owners already work through) gain two new checks so the same
  ground is covered up front:
  - **Photos can be downloaded** — every photo must be publicly fetchable; a photo the channel
    cannot fetch fails here, in Photos, alongside count and size.
  - **Minimum stay is within 1–28 nights** — sits with the availability/stay rules.
- Everything else that card listed (name, type, address with street number, postal code, map
  pin, kitchen, bathrooms, beds vs guests, description length, photo count, photo size, main
  photo, prices, availability, payment method, cancellation policy) is already part of steps
  1–5 today, so nothing is lost.

## Technical detail

Removals:
- Delete `src/components/pms/channels/ChannelConnectReadinessPanel.tsx` and its two mounts
  (`ChannelOnboardingWorkspace.tsx` line ~757, `ChannelOnboardTab.tsx` line ~1779).
- Delete `src/config/channelConnectRequirements.ts`, `src/lib/channelConnectReadiness.ts`,
  `src/hooks/useChannelConnectFacts.ts` and any tests referencing them.

Additions in `supabase/functions/_shared/ruReadiness.ts`:
- `images_reachable` in group `Photos` — recommended (non-mandatory) verdict fed by the stored
  image probe result; `unknown`/unmeasured stays advisory so it can never wedge onboarding.
- `min_stay_within_channel_range` in group `Availability 365d` — mandatory only when a minimum
  stay is authored and falls outside 1–28 nights.
- No change to `READY_TO_SELL_GROUPS` in `_shared/channelOnboardGate.ts`; both new keys land in
  groups that already count towards Ready-to-sell.

Kept as-is: the MCQ base64 result decoding (`_shared/ruMcq.ts`, `src/lib/mcqResultDecode.ts`,
`ru-lnm-handler`) — that is how channel quality-check failures are read, unrelated to the panel.

Verification: typecheck, build, redeploy `check-activation-readiness` and `ru-onboard-property`,
then confirm a property's steps 1–5 list shows the two new rows and the connect frame renders
with no checklist above it. Update the `channel-connect-readiness` memory to match.
