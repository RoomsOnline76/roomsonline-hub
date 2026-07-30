## Goal

Make the admin billing "Channel Manager" switch the single source of truth for channel-manager entitlement: turning it off locks the ROL'OS Channels page, archives the portfolio's properties (on the page /admin/portfolio/ in Rentals United), and flags them as Archived; turning it back on reverses all of that and resumes per-unit billing. The actual property in admin/property is not archived. Only the RU unit is archived in the RU UI and by API to RU, to stop us being billed.

## What exists today (verified)

- `property_billing_configs` / `portfolio_billing_configs` both carry `channel_manager_enabled` and `channel_manager_per_unit_fee`; the property Billing tab currently writes `channel_manager_enabled = pms_enabled` (no dedicated switch).
- &nbsp;
- `rentalsunited-api` already implements `set_property_status` with `is_active` / `is_archived` (Push_PutPropertyStatus).
- `/rolos/channels` renders `PMSChannels.tsx` (cards, mappings, RU readiness + onboarding pipeline).
- The Portfolios → Rentals United tab (`PortfolioRuAccountsTab.tsx`) lists sub-accounts and their properties with a "Push on/off" badge.

## Plan

### 1. Dedicated Channel Manager billing switch

- Split the channel-manager fee out of the combined "PMS subscription" toggle in `BillingConfigBuilder.tsx`: add a `channel_manager_enabled` switch with the per-unit fee under it (property and preset scope).
- Persist it explicitly from `BillingConfigTab.tsx` and the portfolio/global billing screens instead of mirroring `pms_enabled`.

### 2. Confirmation + warning copy

- When an admin flips the switch **off**, show a confirm dialog: disabling stops channel-manager billing, marks all properties in the sub account on the protfolio page in RU tab as archived,  and sends an archive call to Rentals United (listings go offline on all channels).
- When flipped **on**: confirm that properties will be reactivated in Rentals United and per-unit billing resumes from the next cycle. The cards in portfolio/RU tab are restored to PushOn/off State
- A persistent inline warning under the switch states the same in both states.

### 3. Entitlement fan-out (edge function)

New `channel-manager-entitlement` edge function, invoked after the billing config saves:

- Resolves the scope (portfolio → all member properties, else the single property).
- **Disable:** set `property lfags in portfolio/RU tab.is_archived = true`, `ru_push_enabled = false`, mark RU channel connections inactive, and for every property with a `rentalsunited_property_id` call `rentalsunited-api` `set_property_status` with `is_active:false, is_archived:true`. Log each call to the RU sync/error log.
- **Enable:** reverse (unarchive, restore push flag, `is_active:true, is_archived:false`).
- Returns a per-property result so the UI can toast successes/failures.
- `push-property-to-ru` gains a hard gate: refuse any push while channel-manager billing is off.

### 4. ROL'OS Channels page lock

- New `useChannelManagerEntitlement(propertyId)` hook reading the effective (portfolio-aware) `channel_manager_enabled`.
- When off, `PMSChannels.tsx` renders the page greyed out and non-interactive (overlay + disabled actions) with: "Channel Manager is not active on your plan — please speak to your account manager." Sidebar entry gets a muted/lock indicator.

### 5. Archived indicators

- Portfolio → Rentals United tab: each account card shows an "Archived" badge when its properties are archived, and each property row shows "Archived" instead of "Push on/off".
- `THIS IS NOT TO HAPPEN: THE PROPERTY IS NOT ARCHIVE IN TOTAL> ONLY THE PORTFOLIO?RU TAB?Property crd is marked as acrived. We are only archiving in RU anddisabling the porperty in RU, not everywhere. "/admin/properties`: archived rows show an "Archived" badge with a tooltip naming the cause (channel-manager billing disabled)."

## Technical notes

- &nbsp;
- RU calls are best-effort and idempotent — failures are recorded and surfaced, and the local archive state still applies so billing and the UI stay consistent.
- No schema change is expected (`is_archived`, `ru_push_enabled` and the billing columns all exist); if an archive-reason column proves necessary it will be added as a small migration during implementation.