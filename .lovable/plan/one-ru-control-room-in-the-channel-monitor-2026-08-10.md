# One RU control room in the Channel Monitor

Today Rentals United onboarding lives in three places: portfolio accounts under **Portfolios → Rentals United**, certification under **Integrations → Rentals United → Certification & compliance**, and cost/listing control under **Channel Manager Cost Monitor**. Passing certification means jumping between all three.

This consolidates them into the Cost Monitor as a single, three-tab RU control room.

## New structure: /admin/channel-monitor

```text
Channel Manager — Cost, Accounts & Certification
[ Cost & listings ]   [ Accounts ]   [ Certification ]
```

- **Cost & listings** (default) — exactly what the page shows today: forecast summary, collapsed commitment schedule, property/unit table with Activate & sync / Archive, archive log.
- **Accounts** — the portfolio Rentals United panel, moved as-is: sub-accounts, API keys, company details, login details, linked properties, last-sent payloads.
- **Certification** — the certification console, moved as-is: phase runs, step logs, per-suite results.

## Friction removed for certification

A thin status strip sits above the tabs and stays visible on all three, so the operator always sees the state that blocks certification:

- Accounts ready (keys stored + verified) vs. missing keys
- Properties pushed / live at the channel
- Latest certification verdict per phase, with the failing or deferred step named
- One primary action that resolves the current blocker: store keys, push property, or re-run the phase — deep-linking to the tab that owns it

Certification steps that name a property link straight into the Cost & listings row for that property (and back), so fixing a listing and re-running the suite is two clicks, not a page change.

Tab state is kept in the URL (`?tab=accounts`), so links from health reports, the RU wizard and the certification log can open the right tab directly.

## What happens to the old locations

- **Portfolios → Rentals United** tab is removed; the Portfolios page keeps only Portfolios.
- **Integrations → Rentals United** keeps the deep diagnostics tabs (sync observability, onboarding pipeline, buildings, errors, currency, live notifications, content quality, reservations, coverage). Its Certification tab is replaced by a short card that links to the Cost Monitor's Certification tab, so there is exactly one certification surface.
- Existing links to the old tabs redirect to the new tab rather than 404.

## Technical notes

- `src/pages/AdminChannelMonitor.tsx` becomes a `Tabs` shell (URL-synced via `useSearchParams`); the current body moves into a `ChannelCostTab` section component so the page stays small.
- `PortfolioRuAccountsTab` and `RuCertificationConsole` are mounted unchanged — no logic rewrite, no data-contract change. Both tabs mount lazily so the default cost view keeps its current load time.
- New `ChannelRuStatusStrip` component derives its state from the existing `useChannelCostMonitor` hook plus a light read of `ru_api_credentials`/`ru_owner_accounts` and the latest `ru_cert_runs` rows — no new tables or edge functions.
- `AdminPortfolios.tsx` drops its RU tab and import; `AdminRentalsUnited.tsx` swaps its cert tab body for the pointer card.
- Styling follows the existing admin tokens; no new colours.
