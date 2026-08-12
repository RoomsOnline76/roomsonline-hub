# Mark every mandatory field, and make the wizard walk the owner to it

## What is wrong today

- The solid-border treatment for channel-mandatory inputs exists but is never applied. `channelMandatoryClass()` / the `.channel-required` CSS rule in `src/index.css` are defined and referenced nowhere else in the app, so no input in the property editor ever gets that border.
- Company Information fields only carry a small pink asterisk next to the label. The three fields reported as outstanding (Channel Manager location, Rep nationality, Rep country of residence) are not in the requirement registry at all, so the border painter cannot decorate them and the wizard has nothing to jump to.
- The requirement registry (`src/config/propertyFieldRequirements.ts`) is missing several fields the channel gate actually blocks on: postal code, check-in-from / check-out-until (currently only "nice to have"), arrival instructions, cancellation policy, payment methods, max guests, Channel Manager location, rep nationality, rep country of residence, and unit floor.
- In the wizard, only "Outstanding fields" rows are clickable, and only when the item is paintable. Content-quality / state blockers (description length, floor, images, arrival instructions) render as plain text with no way to reach the field.

## What we will build

1. **One marking system, applied everywhere.** Fold the unused `channel-required` treatment into the existing requirement painter so a single visual language applies: solid pink 2px border for outstanding mandatory, solid blue for nice-to-have, muted border once satisfied. Retire `channelMandatoryClass` as a second mechanism and keep `CHANNEL_MANDATORY_FIELDS` as the source list feeding the registry.

2. **Complete the mandatory registry.** Add the missing requirements with proper section + selector targets, so each one is painted, counted and navigable:
   - General / identity: postal code, max guests.
   - Company Information: Channel Manager location, rep nationality, rep country of residence (mandatory), plus stable `data-field` hooks on those controls.
   - Rates & policies: check-in from, check-out until (promoted to mandatory), cancellation policy, payment methods, arrival policy.
   - Rooms: unit floor, room description (700 characters), room name hygiene.

3. **Make Company Information mark its own fields.** The card's "3 mandatory fields outstanding" list becomes clickable: each entry scrolls to, opens the collapsed card and pulses the exact control. The controls themselves get `data-field` attributes so the painter reaches them.

4. **Every wizard blocker becomes a link.** State/content-quality checks in the wizard get the same "go to field" behaviour as field rows: each failing check resolves through the requirement catalogue to a section plus a focus key, navigates to that tab and pulses the input. Where a blocker is per-unit (floor, room description), the row names the unit and lands on that unit's row.

5. **Legend and verification.** The legend explains the solid-border convention alongside the channel-gate status it already reports. Then walk the SEESIG / SEESTER editor in the browser: confirm the three company fields show solid borders, that clicking each wizard blocker lands on the right tab with a pulsing field, and that satisfied fields drop back to the neutral border.

## Technical notes

- Files touched: `src/config/propertyFieldRequirements.ts`, `src/lib/requirementFocus.ts`, `src/lib/channelMandatoryFields.ts`, `src/index.css`, `src/components/property/CompanyInformationCard.tsx`, `src/components/onboarding/rolos/RolosOnboardingWizard.tsx`, `src/lib/mcqRequirements.ts`, plus `data-field` attributes in the General / Policies / Rooms tabs.
- No database or edge-function changes: the server gate in `supabase/functions/_shared/ruReadiness.ts` already emits these checks; this work is presentation and navigation only.
- Selector targets stay list-based so a duplicated id across tabs still resolves to the visible control.
