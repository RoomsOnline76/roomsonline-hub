# Carry the property through to the Channel Monitor

## What's happening

The wizard's "Open Channel Monitor" button links to `/admin/channel-monitor?tab=onboard&property=<id>`, and the Onboard tab does use that id as its initial selection. But the dropdown's options are portfolio-aware: when a property belongs to a portfolio, the list offers a single portfolio entry whose value is the *first eligible member*, and every other member is removed from the list.

So the deep-linked id usually matches no option value, and the Select falls back to the empty placeholder:

- Property is a portfolio member but not the anchor member → no matching option.
- Property is not in the eligible list at all (entitlement or contract not resolved yet) → no matching option, and no explanation is shown.

The selection is also stored only as the initial `useState` value, so it is never re-resolved once the option list finishes loading.

## The fix

1. Resolve the deep-linked property against the loaded options once the list is ready:
   - exact match → select it;
   - the id is a member of an eligible portfolio → select that portfolio's entry and note which property was requested;
   - no match → leave the picker empty but show a short inline notice explaining why (not eligible / not entitled / contract not signed), instead of an unexplained blank.
2. Keep the URL in sync: when the operator changes the picker, update `?property=` so a refresh or shared link lands on the same target.
3. Have the wizard hand over the portfolio context as well, so the monitor can select the portfolio entry directly rather than inferring it.

## Technical notes

- `src/components/admin/channel-monitor/ChannelOnboardTab.tsx`
  - Keep the portfolio member lists built during option assembly (member ids per portfolio option) in state so a requested id can be mapped to its portfolio anchor.
  - After `setProperties(...)`, run a resolve pass: if `propertyId` is not one of the option ids, look it up in the member map and set the anchor id; otherwise set an `unresolvedRequest` message.
  - Render the notice next to the picker, plus "requested <property name> — onboarded with its portfolio" when the deep link resolved to a portfolio entry.
  - Accept an optional `initialPortfolioId` prop and prefer it when resolving.
- `src/pages/AdminChannelMonitor.tsx`: pass `params.get("portfolio")` through as `initialPortfolioId`, and accept a callback from the tab to write the current selection back into the search params (`setParams`, replace).
- `src/components/onboarding/channel/ChannelOnboardingWorkspace.tsx`: include the property's portfolio id in the "Open Channel Monitor" link when the property belongs to one.

No change to eligibility rules, grading, or any channel call.
