# Mark onboarding status in the Onboard-a-property dropdown

Each entry in the property/portfolio picker gets a small status badge so it is obvious, before selecting anything, which properties still need onboarding, which are fully live, and which are pushed but not yet selling on a channel.

## The three states

| Badge | Meaning |
| --- | --- |
| `To onboard` (amber) | No distribution sub-account bound yet, or an account exists but no listings have been verified live at the channel. |
| `Live` (green) | Sub-account bound, listings verified live, and a sales channel is linked to it. |
| `No sales channel` (blue outline) | Listings are live at the channel manager, but no sales channel is linked, so nothing is actually being sold. |

For a portfolio entry the badge reflects its member properties: `Live` only when every member is live, `No sales channel` when members are live but the channel link is missing, otherwise `To onboard` (with a count such as "2 of 4 live" in muted text next to it).

Badges appear only inside the open list, not on the closed dropdown button, and a one-line legend sits under the picker.

## Behaviour details

- Statuses are read once when the picker's option list loads, in the same effect that already builds the list — no extra channel/API traffic, only database reads.
- The list order stays as it is today (portfolios first, then standalone properties, alphabetical). No filtering or hiding.
- While statuses are still loading, entries render without a badge rather than flashing a wrong one.
- Selecting an entry behaves exactly as it does now, including the automatic Step A flow.

## Technical notes

- File: `src/components/admin/channel-monitor/ChannelOnboardTab.tsx`, extending the existing eligibility effect that produces `OnboardOption[]`. `OnboardOption` gains an optional `status` field (`"to_onboard" | "live" | "no_sales_channel"`) plus `liveCount`.
- Signals used per property id:
  - binding: `ru_owner_accounts` rows with a non-empty `ru_owner_id`, matched by `property_id` or by `portfolio_id` for portfolio-inherited accounts;
  - listings live: `properties.ru_listings_verified_units > 0` (already selected alongside `ru_archived`, so the query just adds the column);
  - sales channel: presence of a `ru_platform_settings` row keyed `ru_channel_id:<property_id>`, falling back to the account-wide `ru_channel_id` key, matching how the certification flow resolves the ChannelID.
- Derivation helper kept as a small pure function in the same file so it can be reasoned about independently of the query code.
- Badges use existing `Badge` variants with semantic tokens only; no new colour literals.
