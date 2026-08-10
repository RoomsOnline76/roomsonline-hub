# Channel onboarding wizard audit + mandatory-field marking

Goal: the 4-phase channel onboarding wizard must (a) enforce the new certification requirements, (b) never block on a check that cannot legitimately be satisfied at that stage, (c) prove the data it gates on is the same data that is pushed, and (d) the fields it depends on must be visibly marked as mandatory in the property editor.

## What the audit found (verified in code)

1. **Availability / MinStay checks are silently skipped in the wizard.**
   `phase_status` scores readiness with `probe_ari: body.probe_ari === true`, and the pipeline UI never sends that flag, so ARI probing is switched off and the `bookable_window` + `min_stay_set` checks are omitted entirely. Result: Phase 2 can read "Complete" while the certification console (which probes) reports the same property as failing. The live push also never evaluates those two checks (it only uses the per-unit validation gaps).

2. **Unmeasurable photos hard-block the wizard (false stop).**
   `images_meet_cert_size` is mandatory and is only true when `images_size_unverified === 0`. Any photo whose dimensions cannot be read (external/CORS-blocked URL) therefore fails a mandatory check even when every measurable photo is well above 1024×768. The dedicated "dimensions measured" check is advisory, but the cert-size check turns it into a blocker.

3. **Blocker list is truncated.** Phase 2 copies at most 12 readiness gaps, with no "and N more" indicator, so multi-unit properties hide the remaining reasons.

4. **Wizard vs push vs certification use three slightly different gate sets.** Wizard = unit validation only; push = unit validation only; certification = unit validation + live ARI probe. The three need one shared source so "Phase 2 passed" means "the push will be accepted".

5. **Fields the gate depends on are not marked in the editor.** Requirements such as description ≥ 700 characters, arrival instructions, ZIP, coordinates, check-in/out times, max guests, payment method, cancellation policy have no visual "mandatory" treatment, so owners discover them only as wizard blockers.

## Changes

### A. One gate, evaluated the same way everywhere
- Wizard sends `probe_ari: true` when the property already has channel IDs, and relies on the documented pre-publish path (local calendar/rate coverage) before the first push — so the window/MinStay checks appear as soon as they are meaningful and never block pre-publish.
- Add the bookable-window and MinStay checks to the live push gate as well (derived from local availability + rate coverage pre-publish, from the channel probe afterwards), so the wizard and the push agree.
- Phase 2 lists all mandatory blockers with a "showing X of Y" line, grouped per unit.

### B. Remove the false stops
- `images_meet_cert_size` becomes "every *measured* photo meets 1024×768"; unmeasured photos are reported through the existing advisory "dimensions measured" check with the count and the offending photo names. If no photo can be measured at all, the mandatory check reports "cannot verify" and stays blocking (that case is a real risk).
- Confirm the remaining strict checks (description ≥ 700, arrival instructions, beds distributed, kitchen/bathroom, name hygiene) are only marked failed when the underlying value is genuinely absent, not when the validation field is simply missing from the payload — every check keeps the `!== false` (unknown = pass) convention, and each unknown is surfaced as an advisory "not evaluated" note instead of a silent pass.

### C. Prove the pushed data is the intended data
- Each phase gains a compact "data being sent" summary: unit count, description length, photo count and smallest measured size, bed capacity vs max guests, check-in/out, payment methods, cancellation policies, priced/open days, and the resolved location + currency — read from the same validation payload the push builds.
- Phase 3/4 keep showing the channel-side read-back so a mismatch between local intent and channel state is visible per unit.

### D. Mandatory-field marking in the property editor
- Add a single registry that maps each mandatory readiness check to the editor field(s) that satisfy it (General, Description, Images, Amenities, House rules, Policies, Rooms/units, Rate Manager).
- Introduce one shared "mandatory field" visual treatment: filled (solid) input border in a semantic token plus the existing red asterisk on the label, applied through a small wrapper so every tab uses the identical style. Fields that are mandatory only for channel distribution get the same filled border with a tooltip naming the requirement.
- Applies to the fields behind the mandatory checks: property/unit name, property type, description, street, city, ZIP, coordinates, max guests, bed configuration, size/floor where required, check-in from / check-out until, arrival instructions, amenities minimum, images minimum, payment methods, cancellation policy, minimum stay and rates.

## Assumption
"Mandatory" = the checks the wizard/push treats as blocking (channel + core ROL'OS requirements). Advisory/quality-improving items keep the normal border.

## Technical notes
- `supabase/functions/_shared/ruReadiness.ts` — image cert-size rule, unknown-value handling, window checks exported for the push gate.
- `supabase/functions/_shared/ruPhaseGate.ts` — full blocker list with count, phase detail payload for the "data being sent" summary.
- `supabase/functions/ru-cert-portal/index.ts` (`phase_status`) — probe ARI when channel IDs exist.
- `supabase/functions/push-property-to-ru/index.ts` — include window/MinStay in `mandatoryGaps` evaluation.
- `src/components/integrations/RuOnboardingPipeline.tsx` — blocker list, data summary, probe flag.
- New `src/lib/channelMandatoryFields.ts` + shared field wrapper used by `GeneralTab`, `InfoFacilitiesTab`, `HouseRulesTab`, `PoliciesTab`, `RoomManagerTab`, rate/availability panels.
- Both edge functions redeployed after the change.
