# Restore the vendor connection wizard

## Goal
Give the embedded Channel Manager a real, isolated URL under `/channel-manager/` so its history changes remain on its own document and channel quick-checks can launch the vendor wizard.

## Changes
1. **Create the dedicated embed document**
   - Serve the existing White Label host as the physical file `public/channel-manager/index.html`.
   - Remove `<base href="/">`.
   - Keep the documented Open Sans, jQuery 3.4.1, Popper 1.16.0, Bootstrap 3.3.7, and Font Awesome 4.6.3 assets.
   - Keep the existing token query shape and one-line vendor script boot.
   - Stop inspecting `#ruApp` after boot: remove the card `MutationObserver` and report readiness when the vendor script loads, without reading or changing vendor-rendered content.
   - Remove the obsolete `public/ru-embed.html` after the iframe has moved to the dedicated document.

2. **Point the existing host at the dedicated origin path**
   - Change `RuWhiteLabelEmbed` to load `/channel-manager/?token=…&refreshToken=…&languageId=1&uiVersion=2&ownerId=…` with the existing cache/reload parameters.
   - Bump the embed document version.
   - Preserve the current popup, modal, download, same-origin, and user-activated navigation sandbox permissions unchanged.
   - Update comments to describe the dedicated physical document rather than `/ru-embed.html` or an injected base tag.

3. **Keep parent routing unchanged**
   - Do not add `_redirects` rules: Lovable hosting does not process that file.
   - The physical `public/channel-manager/index.html` makes `/channel-manager/` resolve before the SPA fallback in both preview and published hosting.
   - Vendor `pushState` calls can then move within `/channel-manager/*` while the loaded iframe document remains mounted; the parent React application keeps its existing routing.

## Verification
- Confirm `/channel-manager/` serves the White Label document while `/channel-manager` and normal application paths do not replace the parent app unexpectedly.
- Confirm the catalogue still renders and no owner-facing eligibility panel is mounted beside it.
- In an authenticated browser session, click Booking.com or Airbnb and verify:
  - the vendor Connection Wizard opens instead of the empty `NOT ELIGIBLE` fallback;
  - the iframe URL remains under `/channel-manager/`;
  - channel quick-check traffic goes to the vendor domains, not the RoomsOnline host;
  - popup/OAuth navigation is permitted.
- If the wizard request returns a vendor `403`, capture the failing URL and OwnerID for the partner ticket rather than applying another host/content workaround.
- Run the focused TypeScript check and confirm the preview build is healthy.

## Out of scope
No changes to token minting, XML operations, availability/pricing pushes, MCQ handling, content scoring, property forms, calendars, database tables, or vendor DOM content.
