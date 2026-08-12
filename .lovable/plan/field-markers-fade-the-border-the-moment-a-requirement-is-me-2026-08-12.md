# Field markers: fade the border the moment a requirement is met

Fields marked as required keep their strong pink border even after they are filled in correctly (beds, size, floor, baths, toilets and others). Four separate causes were confirmed in the code; each needs fixing or the markers stay wrong on some tab.

## What is wrong today

1. **Borders are painted from saved data, not from what you are editing.** The border painter is driven by the readiness model, which reads the property and unit rows back from the database (cached for 15 seconds). So a value you have just typed or picked cannot fade its border until the record is saved and refetched.
2. **Unit fields are judged across all units at once.** "Floor", "size", "baths", "toilets" and "beds" are satisfied only when *every* unit passes. The single visible control on the open unit is then painted as outstanding even when that unit is complete — one unfinished chalet type keeps the border dark on all of them.
3. **The "completed" style never removes the loud ring.** The satisfied style softens the border colour but leaves the 2px glow ring in place, so a completed field still reads as incomplete.
4. **Two marking systems disagree on the same control.** Some controls carry their own "satisfied" flag (which does fade) while the painter simultaneously marks them outstanding; and several fields never fade at all because they were given the marker without a satisfied flag — property name, street, city, postal code, latitude, longitude. Beds also use two different rules (the field says "enough beds", the checklist says "exactly the maximum").

## What will change

- **Live evaluation.** The marker state is computed from the form values currently on screen, so a border fades as soon as the value is valid — before saving. Saved-data readiness keeps driving the score, the checklist and the wizard gates, so no scoring behaviour changes.
- **Per-unit judgement.** Unit-level requirements are evaluated for the unit you have open. The checklist and wizard keep the "every unit" view (and still name which unit is short), while the border in front of you reflects that unit only.
- **One consistent visual language across every tab and sub-tab:** incomplete = solid pink 2px border; complete = faded pink border, no ring, no tint. Recommended (blue) fields behave the same way.
- **Full sweep.** Every marked input in Edit Property and ROL'OS Setup Property is audited so each one both carries the marker and reports its own completion: Identity & Location, Info & Facilities, Rooms (all sub-tabs incl. beds, images, amenities), Policies (arrival, changeover, house rules), Company Information, and the onboarding wizard steps. Fields marked required with no completion rule get one; fields with a rule that disagrees with the checklist (beds) are aligned to the checklist rule.

## Technical notes

- `src/lib/fieldMarkers.ts` (new): single helper returning `{ className, "data-req-satisfied" }` for a field, replacing the split between `channelMandatoryClass` / `channelMandatoryProps` and the DOM painter classes. `channelMandatoryFields.ts` stays the registry of which fields are mandatory.
- `src/config/propertyFieldRequirements.ts`: unit-level checks gain a per-row evaluator (`isRowSatisfied`) alongside the existing every-unit `isSatisfied`, so aggregate scoring is untouched.
- `src/lib/requirementFocus.ts` / `usePropertyFieldRequirements.ts`: the painter stops overriding controls that already publish a live satisfied flag (it will skip elements carrying `data-req-live="1"`), keeping "Show me" focus/pulse behaviour intact.
- `src/index.css`: `.pf-req-satisfied` clears `box-shadow` with `!important`; the channel-required and painter satisfied states are unified so either system produces the identical faded treatment.
- Components touched: `GeneralTab.tsx`, `InfoFacilitiesTab.tsx`, `RoomManagerTab.tsx`, `RuChannelContentFields.tsx`, `CompanyInformationCard.tsx`, `PoliciesTab.tsx` + `policies/ArrivalPolicyPanel.tsx`, `policies/ChangeoverRulesCard.tsx`, `policies/HouseRulesCard.tsx`, `PortfolioCommonsCard.tsx`, and the ROL'OS wizard steps rendering these tabs (`PMSPropertySetup.tsx`, `RolosOnboardingWizard.tsx`).
- Beds rule aligned to the checklist definition (authored sleeping places cover the unit maximum), used by both the field marker and the score.

## Verification

Open a unit with everything captured and confirm every marked field is faded while an incomplete sibling unit still shows its own dark borders; clear a toilet count and watch that single field turn dark immediately, then refill it and watch it fade without saving; confirm the readiness score and wizard gates report the same totals as before.
