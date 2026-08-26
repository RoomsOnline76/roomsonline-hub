# Remove the status strip from Channel Monitor

The summary strip under the Channel Monitor header (accounts / keys verified / live listings / booking_readback, with the "Run Step A" button) is redundant — everything it reports and offers now lives inside the Step A account modal on the Onboard tab.

## What changes

- Delete the strip from the Channel Monitor page, so the header goes straight to the rail + tab content.
- Delete the strip component file itself, since nothing else renders it.
- Keep the shared rail status logic untouched — the rail badges and the Onboard tab both read from it.

## Technical notes

- `src/pages/AdminChannelMonitor.tsx`: remove the `<ChannelRuStatusStrip …>` render and its import.
- Remove `src/components/admin/channel-monitor/ChannelRuStatusStrip.tsx`.
- `src/hooks/useChannelRailStatus.ts` stays as is (still used by the rail); only its comment reference to the strip is stale, which can be corrected.
- No backend, data, or channel-traffic changes.
