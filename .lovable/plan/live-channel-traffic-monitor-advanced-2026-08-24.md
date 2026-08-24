# Live channel traffic monitor (Advanced)

A new frame at the bottom of Channel Monitor → Advanced, below the collapsed frames, that shows channel-manager traffic as it happens: outbound calls on the left, inbound notifications and responses on the right, with a running endpoint counter. It can be popped out into its own always-visible window so engineers can keep watching it while working elsewhere in the workspace.

## What gets built

**1. Endpoint library (the reference list)**

A single canonical list of every channel endpoint the platform actually implements, reviewed against the code (currently ~60 verbs across property push, pricing, discounts, availability, reservations, leads, locations, dictionaries, users/API keys, notification subscriptions, white-label tokens). Each entry carries:

- the wire method name and the internal action name(s) that trigger it,
- direction (we call out / channel calls in),
- family (Property & content, Pricing & discounts, Availability, Reservations & leads, Leads lifecycle, Accounts & users, Dictionaries, Notifications, White label),
- whether it writes or only reads, and a one-line purpose,
- expected cadence (on save / on push / scheduled / on demand) so unexpected chatter stands out.

This list becomes the master for the monitor's counters, so an endpoint that fires is always named and grouped, and endpoints that never fire are still listed at zero.

**2. Live traffic frame (side-by-side)**

- Two synchronised columns: **Outbound** (our requests) and **Inbound** (channel notifications and the responses that came back), newest first, auto-scrolling with a pause-on-hover / freeze toggle.
- Each row: time, endpoint, property/unit, owner account, outcome (ok / channel refusal / transport error), elapsed ms, payload size, trace id. Click a row to open the full request and response payload; paired rows are linked by trace id so a click on one highlights its counterpart.
- Live updates: subscribe to new exchange-log rows in realtime (the exchange table is added to the realtime feed), with a short polling fallback so the frame still moves if the socket drops. A visible "live / stalled" indicator plus last-event age.
- Filters: property, owner account, family, endpoint, outcome, and a free-text payload search. Errors-only toggle.

**3. Additional information strip**

- Calls in the last 1 / 5 / 60 minutes, success rate, p50 / p95 latency, bytes in/out.
- Rate-limit pressure: current queue depth and any active cooldown/countdown from the call queue.
- Top endpoints by volume in the window, and a "chatter watch" callout when a read endpoint exceeds its expected cadence (e.g. repeated price or availability reads).

**4. Endpoint counter table**

Every endpoint from the library with counts for the chosen window (1h / 24h / 7d / retention), split ok vs failed, last-called stamp, average latency, and never-called marked plainly. Grouped by family, collapsible, sortable, and exportable as CSV/JSON for a support ticket.

**5. Pop-out window**

A "Pop out" button opens the same frame in a separate browser window at a dedicated route, sized as a compact monitor, with its own live subscription and a "keep on top" hint. Filters and window choice carry across via the URL, and the in-page frame shows a "running in a pop-out window" placeholder while it is open. Note: browsers cannot force a tab to stay above other applications — the pop-out is a small always-open window, and on Chromium-based browsers it uses picture-in-picture-style document mode when available, which does float above the workspace; otherwise it is a normal small window the user can keep on top via their OS.

## Access and safety

- Dev / fearless-leader only, same gate as the rest of Advanced.
- Read-only: the monitor never triggers channel calls itself, and its own queries never touch the channel API.
- Payloads are shown as already stored in the exchange log (credentials in stored payloads stay masked as they are today).

## Technical notes

- New `src/config/ruEndpointLibrary.ts` — the canonical endpoint registry described above, cross-checked against `supabase/functions/rentalsunited-api/index.ts`, `ru-*` functions and the cert-portal coverage list, with a unit test asserting every wire method used in the functions appears in the library.
- New `src/hooks/useRuLiveTraffic.ts` — realtime subscription on `ru_api_log` plus windowed aggregate queries (counts, latency percentiles, per-endpoint rollup) and the queue-depth read from `ru_call_queue`.
- Migration: add `ru_api_log` to the realtime publication with `replica identity full` (read-only exposure stays behind existing RLS; no policy widening).
- New components under `src/components/admin/channel-monitor/live/`: `LiveTrafficFrame.tsx`, `TrafficColumn.tsx`, `EndpointCounterTable.tsx`, `TrafficStatsStrip.tsx`, mounted at the end of the Advanced tab in `src/pages/AdminChannelMonitor.tsx` (open by default, since it is the live view; the existing frames stay collapsed).
- New route `/admin/channel-monitor/live` rendering the same frame standalone for the pop-out, using `documentPictureInPicture` when available and `window.open` otherwise.
