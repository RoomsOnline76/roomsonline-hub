# Make the HubSpot CRM add-on discoverable

## Where it lives today (verified)

- The only place to configure HubSpot is the **ROL Account** page (`/admin/account`), where the HubSpot card is rendered near the bottom of the page.
- There is **no** HubSpot entry in the desktop side menu, the PMS sidebar, or either mobile bottom nav.
- The backend stores the connection per **owner**, keyed on `owner_id` + service in `owner_integrations`. There is currently no per-property HubSpot setting at all — one HubSpot portal serves the whole owner account, and all its properties' guests/reservations feed into it.
- `/integrations/hubspot` exists only as a public marketing page on the Connect site, not as a configuration screen.

So the answer to "where do I configure it for the property" is: today you can't per property — it's an account-level connection, reachable only via ROL Account, which is why it feels invisible.

## What to build

1. **Dedicated settings screen** — add a HubSpot CRM page inside the PMS shell at `/pms/crm-hubspot`, rendering the existing HubSpot card (connect token, test, sync now, pause, disconnect) plus a short line stating the connection covers every property on the account.
2. **Side menu entry** — add "HubSpot CRM" under the PMS sidebar Settings group (owner-visible), and a matching entry in the main workspace side menu under Insights/Workspace so it is findable outside the PMS shell.
3. **Mobile access** — expose it in the PMS mobile bottom nav overflow sheet and the main mobile nav overflow, using the same nav config entries so nothing is duplicated by hand.
4. **Pointer from the property editor** — in Property Setup / edit property, add a quiet line in the integrations area: "Guest & reservation CRM sync is configured once for your account — open HubSpot CRM", linking to the new page. No per-property toggle unless you want one.
5. **Keep ROL Account working** — the existing card stays where it is; both surfaces read the same owner state.

## Optional (say the word)

If you do want per-property control, we can add a per-property "include in CRM sync" switch that the sync sweep and the projection layer respect, defaulting to on. That is a schema + sync change, so it is excluded above.

## Technical notes

- New page `src/pages/pms/PMSHubSpot.tsx` reusing `HubSpotIntegrationCard` (`bare` variant where appropriate) and `useOwnerIntegration("hubspot")`; no new backend calls.
- Route added inside the PMS shell route block in `src/App.tsx` next to `integrations`.
- Nav entries added to `src/config/navigation.ts` and the PMS sidebar group array in `src/components/layout/PMSSidebar.tsx`; mobile surfaces pick them up from the same config.
- Wording follows the channel-vocabulary rule for channel vendors; HubSpot is named directly because it is the owner's own CRM, consistent with the existing card copy.
