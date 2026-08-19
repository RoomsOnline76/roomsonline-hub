# Channel Manager rail: status chips and discoverability polish

UI-only pass over the new left-rail Channel Manager layout. No new queries, no API or state-flow changes — labels, chips, and layout only.

## 1. Status chip on every rail item

Each rail button keeps its title and its one-line "What this tests" description, and gains a small colour-coded chip on the title row (green = ready, amber = attention, red = failing, grey = unknown/loading).

Chips are derived from data the page already loads:

| Rail item | Chip source (already loaded) | Example labels |
| --- | --- | --- |
| Accounts & Company | sub-account key verification counts already read by the status strip | "3/3 keys verified" / "1 key missing" |
| Cost Monitor | billable listings + forecast already in the cost monitor hook | "35 listings billable" |
| Property Binding | `subAccountPropertiesWithoutFootprint` | "All bound" / "2 without footprint" |
| Room & Rate Mapping | `duplicateListings` + properties flagged `neverPushed` | "Mappings complete" / "Mappings incomplete" |
| ARI Live Lab | newest `lastPushAt` across properties | "ARI pushed 2h ago" / "No ARI push yet" |
| Reservation Round-Trip | live vs paused/pending property states already in the hook | "5 live on channel" |
| Cert Status & Logs | latest cert run verdict already read by the status strip | "22/22 passed" / "3 failed" |
| Advanced (Dev only) | static neutral chip | "Engineers only" |

To feed the Accounts and Cert chips without adding queries, the three reads the status strip already performs (`ru_owner_accounts`, `ru_api_credentials`, latest `ru_cert_runs`) move into a small shared read-only hook that both the strip and the rail consume. Same queries, same shape, fetched once instead of twice — no behaviour change in the strip.

## 2. Accounts & Company

- "Push Company Details" becomes the dominant primary action in the company card: full-size primary button, moved to its own action row above the supporting text instead of sitting inline with the ghost "View response" control.
- The "Last pushed <timestamp>" badge and the collapsible raw-response panel stay exactly as they are today, including the same click handlers.

## 3. Cert Status & Logs

- Present the existing sync / error evidence as one clean stacked list: certification console, ledger metrics, then the searchable exchange log, each under a compact labelled header so the reading order is obvious. Panels themselves are untouched.
- Add a visual-only "RU cert checklist" card above them listing the main cert steps (company details, sub-account keys, property binding, room & rate mapping, availability push, pricing coverage, reservation create, modify, cancel/reject, log evidence). Each row is a checkbox the operator can tick manually; state is local to the component and persisted to `localStorage` so it survives a reload. It records nothing to the backend and drives nothing.

## Technical notes

- Files touched: `src/pages/AdminChannelMonitor.tsx` (chips, cert section layout), `src/components/admin/channel-monitor/ChannelRuStatusStrip.tsx` (swap inline fetch for the shared hook), a new `src/hooks/useChannelRailStatus.ts` (moved queries), a new `RuCertChecklistCard` component, and the company card block in `src/components/portfolio/PortfolioRuAccountsTab.tsx` (button prominence only).
- Chips use existing `Badge` variants and semantic tokens — no hardcoded colours.
- All URL deep links (`?tab=…`) and legacy tab mappings continue to work unchanged.
