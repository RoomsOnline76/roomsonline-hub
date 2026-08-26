# Onboarding picker: three-colour status and colour-grouped ordering

Rework the status badges in Channel Monitor → Onboard a property → "Property or portfolio" so they read as a traffic light, and order the list by colour.

## Statuses

| Colour | Badge | Meaning |
| --- | --- | --- |
| Red | Not pushed | No distribution account bound, or the property has never been pushed to the channel manager |
| Orange | Awaiting channels | Pushed to the channel manager, but no sales channel connected for it |
| Green | Channels connected | Pushed and a sales channel is linked for that property |

Verified against the current data: DEMO 2 and DEMO ACCOUNT are bound with a recorded verified owner (pushed, zero listing units), Jongensfontein has 3 of 4 members pushed, DEMO C has no binding at all. So "pushed" must be read from the binding plus the recorded listing verification, not from listing units alone — otherwise DEMO 2 and DEMO ACCOUNT wrongly read red.

A single account-wide `ru_channel_id` setting exists today, which is why the current code would call everything live. Green will require a property-scoped sales-channel mapping (`ru_channel_id:<property id>`); the account-wide key alone no longer counts as connected. With that rule nothing currently shows green, matching what you see.

## Portfolio rows

A portfolio entry keeps one badge summarising its members:

- Green when every member is connected.
- Orange when at least one member is pushed but not all are connected.
- Red when no member has been pushed.

The counter next to the badge becomes "3 of 4 pushed" for orange rows and "x of y connected" for mixed/green rows, so Jongensfontein reads "3 of 4 pushed · Awaiting channels".

## Ordering

Entries are sorted red first, then orange, then green, and alphabetically by name inside each colour group. Portfolios and single properties interleave by name rather than being blocked apart, so the list reads straight down in the order of work outstanding. Rows whose status has not landed yet (the badge read resolves a moment after the list opens) sort last until it does, then re-sort.

The legend under the picker is rewritten to the three colours in the same order.

## Technical notes

All changes are inside `src/components/admin/channel-monitor/ChannelOnboardTab.tsx`:

- Rename the `OnboardStatus` union to `not_pushed | awaiting_channels | connected` and repoint `ONBOARD_STATUS_BADGE` to red / amber / emerald token classes.
- `PropertyChannelSignals` becomes `bound`, `pushed` (verified owner/date recorded or verified units > 0), `salesChannel` (property-scoped key only). The status read already fetches `ru_owner_accounts` and `ru_platform_settings`; it additionally selects `ru_listings_verified_at` / `ru_listings_verified_owner` with the eligible property rows.
- `deriveOnboardStatus` and the portfolio aggregation are updated to the rules above, plus a `pushedCount` alongside `liveCount` for the counter.
- Sorting moves into a memo over `properties` keyed by (colour rank, label) instead of the current portfolios-then-properties concatenation, so the render order follows status while the raw option list stays as built.

No backend, orchestrator, or push behaviour changes — display and ordering only.
