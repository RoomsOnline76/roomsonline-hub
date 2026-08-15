# Onboarding header counters: clickable and more informative

## Problem

The six cards at the top of Onboarding (Total Active, Not Started, In Progress, Expired, Completed, Live) are static display only — clicking them does nothing, and the status filter buttons below duplicate the same states. They also count every property with onboarding activity, while the table hides finished properties unless "Show finished properties" is on, so the "Live" card can read 6 while the table shows none of them.

The cards also only describe the website-invite lifecycle. They say nothing about the two outcomes the queue actually tracks: website listing live, and channel go-live.

## What changes

### 1. Counters become the filter

- Each card becomes a button. Clicking it applies the matching filter to the table below; clicking the active card again clears back to All.
- The active card is visually selected (ring/border in brand pink) so it is obvious what the list is filtered to.
- Clicking a card scrolls the table into view on small screens.
- The redundant status filter button row is removed — the cards replace it. The search box and the "Show finished properties" switch stay.
- Counts and table agree: selecting a card that includes finished properties (Live, Completed, Website live, Channels live) automatically switches "Show finished properties" on, so the number on the card always matches the rows listed.

### 2. Counters become more informative

Two groups of cards, both clickable:

**Progress (website invite lifecycle)** — reworded for clarity:
- Active queue (total)
- Invite not sent
- Owner in progress
- Invite expired

**Distribution (where properties actually stand)** — new:
- Website live — on the public site
- Channels live — selling through the Channel Manager
- Awaiting channel connection — pushed and verified, no channel connected yet
- Channel Manager off — ROL'OS properties without the billing entitlement (no wizard)

Each card carries a one-line caption under the number saying what the state means, so the distribution is readable without hovering.

## Technical notes

All work is in `src/pages/AdminOnboarding.tsx`.

- Widen `StatusFilter` to a `QueueFilter` union: existing lifecycle keys plus `website_live`, `channels_live`, `channels_awaiting`, `channel_manager_off`.
- `filteredProperties` gains cases for the new keys, derived from data already on each row: `show_on_website`, `channelStage` (`live` / `connect`), and `channelManagerEnabled` (already portfolio-aware via `fetchChannelManagerEntitlements`).
- `stats` extends with `websiteLive`, `channelsLive`, `channelsAwaiting`, `channelManagerOff`, computed off the same `onboardingActiveRows` the table filter uses so card and row counts cannot diverge.
- A small `CounterCard` component inside the file handles button semantics, `aria-pressed`, selected styling, and the count/caption layout — keeps the JSX flat.
- Card click handler sets the filter and, for the finished-inclusive keys, forces `setShowCompleted(true)`.
- No data-fetch, backend, or row-logic changes.
