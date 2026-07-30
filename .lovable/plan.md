## 1. PMS Control (`/dev/pms`) aligned to the Integrations page

Today Integrations (`/admin-keys`) hides parked systems by default behind a "Show parked" toggle (driven by `pms_tracker_status.integration_status = 'parked'`), but PMS Control lists every configured system regardless of status. 21 systems are currently parked (agoda, airbnb, beds24, booking_com, channex, cloudbeds, easyota, ebeds, expedia, google_hotels, guesty, hotelbeds, hyperguest, lekkeslaap, nightsbridge, profitroom, roomkey, roomracoon, semper, siteminder, tourplan).

- In `src/pages/DevPMS.tsx`, filter both the PMS group and the Channel Manager group to exclude systems whose tracker status is `parked`.
- Add the same "Show parked" switch used on Integrations so a dev can reveal them on demand (default off), with a small count of how many are hidden.
- Exclude parked systems from the header stat counters so the totals match what is displayed.
- Use the same section order and naming as Integrations: **ROL'OS → Property Management Systems → Channel Managers → Financial Services**.

## 2. PriceLabs listed twice

`PriceLabsCard` is rendered in both the **Channel Managers** section and the **Additional Services** section of `/admin-keys`.

- Remove the PriceLabs card from Channel Managers; keep the single instance in the financial/revenue section.
- Introduce a `financial` category in `src/lib/pmsSystemsConfig.ts` and move `pricelabs` from `channel_manager` to it, so PriceLabs stops appearing in channel-manager derived lists (PMS Control's Channel Managers group, and anywhere `CHANNEL_MANAGER_SYSTEMS` is consumed).
- Add a `FINANCIAL_SYSTEMS` export and render that group under Financial Services on both Integrations and PMS Control, so PriceLabs appears once, in the financial group only.
- Remove `pricelabs` from the channel list in `src/components/pms/channels/ChannelLogo.tsx` so it no longer surfaces as a bookable channel (label lookup retained for existing records).

## 3. Task Tracker badge shows "assigned to me / all"

`dev_tasks` has an `assigned_to` column; the badge currently shows a single number (open tasks with status `new`).

- Extend `src/hooks/useAdminActionCounts.ts` to return, for `task-tracker`, both a mine count (open tasks where `assigned_to = auth user`) and a total open count.
- Extend the badge model so a nav item can carry a `mine/total` pair instead of one number.
- In `src/components/layout/AppSidebar.tsx`, render `5/24` style text for that badge (single number retained for all other items), with a tooltip such as "5 assigned to you of 24 open tasks". Collapsed sidebar keeps the compact total.

### Technical notes

- Parked detection reuses the existing `pms_tracker_status` fetch already performed in `DevPMS.tsx`; no new queries needed.
- No database or edge-function changes; all work is frontend/config.
- "Open" for the tracker badge keeps the current definition (`status = 'new'`) unless you want in-progress tasks counted too.
