# Channel Manager entitlement gates the Channels wizard

Today the Channels wizard is reachable for any ROL'OS property, and the wizard itself can switch the Channel Manager on. That inverts the commercial order: the entitlement (and its billing line) must be agreed first, and only then does the wizard appear.

## What changes

**1. One shared entitlement check (portfolio-aware)**

A single hook resolves "is the Channel Manager billable for this property?":
- If the property belongs to a portfolio, read `portfolio_billing_configs.channel_manager_enabled`.
- Otherwise read `property_billing_configs.channel_manager_enabled`.

This matters now: Jongensfontein (Tidal, Seesig) is enabled at portfolio level only, so any check that reads the per-property row alone reports it as *not* entitled. The onboarding queue currently does exactly that.

**2. The wizard is hidden when not entitled**

- Onboarding queue row menu ("...") — the "Open channel wizard" item is removed for non-entitled properties; the website listing wizard item stays.
- The row's primary action button no longer offers "Channel wizard" / "Connect a channel"; it falls back to the website wizard.
- The channel progress column shows "Channel Manager not enabled" instead of a progress bar, with a tooltip pointing at the property's Billing tab.
- All Properties list — the sparkles "go-live workspace" shortcut is hidden for non-entitled properties.
- Direct URL `/admin/onboarding/:propertyId` and the ROL'OS `/pms/channels` mount render a short "Channel Manager is not enabled for this property" notice instead of the wizard. Admin / dev / fearless leader see a link straight to the property's Billing tab; owners see a "contact us" line.

**3. Billing becomes the only place it is switched on**

- The `Enable Channel Manager` action inside the wizard's Published pane is removed — by the time the wizard is visible, the entitlement is already on. The existing enable/disable fan-out on the Billing tab (which archives or re-activates listings at the channel) stays the single switch.
- Turning the toggle off in Billing keeps working as it does now, and the wizard disappears again on the next load.

**4. Free-of-charge is still "included"**

A per-unit fee of 0 with the toggle on counts as entitled (bundled / promotional). Only the toggle decides visibility, so nothing breaks for properties on a bundled deal.

## Technical notes

- New `src/hooks/useChannelManagerEntitlement.ts` — single property lookup (portfolio membership → portfolio config, else property config), plus a batch variant for the queue.
- `src/pages/AdminOnboarding.tsx` — the billing fetch is extended to load `portfolio_billing_configs` via `property_portfolio_members`, and the resulting `channelManagerEnabled` flag drives the "..." menu, the action button, and the channel column. `channelQueueProgress` keeps its current inputs.
- `src/pages/ChannelOnboarding.tsx` and `src/pages/pms/PMSChannels.tsx` — gate before rendering `ChannelOnboardingWorkspace`; a small shared `ChannelManagerNotEnabled` notice component holds the copy and the Billing link.
- `src/pages/PropertyOverview.tsx` — hide the go-live shortcut when not entitled.
- `src/components/onboarding/channel/ChannelOnboardingWorkspace.tsx` — drop `enableChannelManager` and the `onEnable` wiring in the Published pane.
- No database or edge-function changes; `channel-manager-entitlement` and the nightly reconciliation are untouched.
