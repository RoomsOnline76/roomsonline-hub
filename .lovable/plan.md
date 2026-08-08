# Align Admin → Edit property with ROL'OS → Setup Property

Audit result: for every section the two surfaces share, they already render the **same components with the same props** — the section bodies are literally the same code. The misalignment is entirely in **which sections admin shows** and **which it hides**. ROL'OS stays untouched; admin changes to match it.

## Gap map

| Section | ROL'OS Setup Property | Admin → Edit property today | Action |
|---|---|---|---|
| Contacts (reception / reservations / emergency) | Present, uses the contacts editor | **Missing entirely** — stripped from the rail and has no tab body | Add, using the exact same contacts editor |
| Facilities, Rooms, Calendar / Seasons, Rate Plans, Policies, Charges, Specials, Packages, Addons, Templates, Announcements, Media | Always available | **Hidden whenever the property is on ROL'OS**, replaced by a "managed in ROL'OS" notice | Always show; keep the notice as an informational deep link only |
| Same sections on a NightsBridge property | Always available | Hidden by a hard allow-list (only Identity, ROL Spec, Branding, Media, Rooms, Calendar, Rate Plans, Onboarding, Integrations, Admin survive) | Drop the allow-list so the tab set matches |
| Identity & Location, Branding, ROL Spec, Integrations, Admin, Onboarding | Not in the hub | Present | Unchanged — these stay admin-side extras |
| Rail readiness cues | Outstanding-field counts | Counts + activation blockers | Unchanged (admin keeps blockers) |

Net effect: the admin rail becomes the ROL'OS section list, in the same order and grouping, plus the admin-only advanced group.

## What changes

1. **Contacts becomes a real admin section.** It appears in "Property profile" right after Facilities, exactly where ROL'OS shows it, and edits the same records — no second copy of the form.
2. **No section disappears because of the connected system.** ROL'OS-managed and NightsBridge properties show the full section list. Where ROL'OS is the system of record, the existing banner still points to Property Setup, but the admin section is reachable rather than hidden.
3. **Drift protection.** The ROL'OS hub's section list is derived from the shared section config instead of a hand-maintained array, so a new shared section can't appear on one surface and not the other.

## Technical notes

- `src/pages/PropertyForm.tsx:3851-3873` — remove the `s.key !== "contacts"` exclusion, the `isRolosPms(selectedPMS) && !forceTabs && s.rolosManaged` exclusion, and the `selectedPMS === "nightsbridge"` allow-list from `visibleSectionKeys`. Keep the `onboarding` (needs `propertyId`) and `adminOnly` role gates.
- `src/pages/PropertyForm.tsx` — add a `TabsContent value="contacts"` rendering the lazily-imported `PropertyContactDetails` (`propertyId` guard message when the property is unsaved), so `?section=contacts` resolves on both surfaces.
- `src/pages/PropertyForm.tsx:4013-4030` — keep the ROL'OS banner/deep link (still `!embedded`), reworded to "ROL'OS is the source of truth for these sections" instead of implying they are unavailable here.
- `src/pages/pms/PMSPropertySetup.tsx:27-59` — replace the hand-written `TabKey` union and `HUB_KEYS` array with a derivation from `PROPERTY_SECTION_ORDER` (`rolosManaged` sections plus `images`), so the hub list and the shared config cannot drift. No visible change to the hub.
- No database, edge-function, or rate/pricing-logic changes. Section bodies are not touched, so ROL'OS behaviour is unchanged.
