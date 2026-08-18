# Background call queue — collapse by default

## Problem
`ChannelCallQueuePanel` always renders fully expanded. The stats grid and the call table take vertical space even when the queue is empty or healthy, so the "Background call queue" card crowds the Channel Monitor's Accounts/Certification tabs.

## Change
Make the card collapsed by default, keeping only the header visible until the operator opens it.

- New `open` state in `ChannelCallQueuePanel`, defaulting to `false`.
- Wrap `CardContent` (stats grid + table) in the existing `Collapsible` / `CollapsibleContent` primitives from `@/components/ui/collapsible`.
- Make the `CardHeader` a `CollapsibleTrigger` (whole header clickable) and add a `ChevronDown`/`ChevronRight` affordance next to the title so the collapse state is obvious.
- Keep the Refresh button working independently (it already calls `load()`); clicking it must not toggle the collapse.
- When collapsed, the header still shows a compact hint of the queue health — the `waiting` count as a small badge next to the title, so an operator can tell at a glance whether anything needs attention without expanding.

## Technical notes
- File: `src/components/admin/channel-monitor/ChannelCallQueuePanel.tsx` — single file, presentation only.
- No new dependencies; `@/components/ui/collapsible` and `lucide-react` chevrons are already used elsewhere in the app.
- No backend, schema, or edge-function changes.
