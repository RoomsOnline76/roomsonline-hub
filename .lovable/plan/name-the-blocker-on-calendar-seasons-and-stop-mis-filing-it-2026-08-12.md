# Name the blocker on Calendar / Seasons (and stop mis-filing it there)

## What is actually happening on Seesig

Verified against the live record for *Seesig Self Catering Chalets*:

- The Calendar / Seasons section owns four mandatory requirements in the readiness registry: master cancellation policy, check-in/check-out times, arrival policy, accepted payment methods (`src/config/propertyFieldRequirements.ts:447-507`, all tagged `section: "rates"`).
- Three are satisfied for Seesig (master policy row exists, 15:00 / 11:00 captured, four payment methods captured). The one that fails is **Arrival policy / how to arrive** — the property-level master arrival text is empty (0 characters at every legacy key), so the count is 1.
- No requirement in this section looks at season coverage at all. The wizard's "Pricing 365d" / "Availability 365d" groups are separate and derive from probed channel state (`src/hooks/useRolosOnboardingProgress.ts:276-277`). So the warning is not false, and it is not about your 365+ days of planned seasons — it is genuinely a missing master arrival policy, just described uselessly.
- The surfaces only ever render a bare number: the section rail shows a count chip with a generic `title` (`src/components/property/PropertySectionRail.tsx:98-107`) and the legend shows "N of M outstanding" (`src/components/property/RequirementLegend.tsx:104-110`). Nothing names the field.
- Worse, the field itself is not on this tab: the arrival policy editor, house-rules times, and master policy all live on the **Policies** tab. The count points the owner at a screen where the fix does not exist.

## Changes

1. **Re-file the four requirements to the section that owns their controls.**
   Move `master_policy`, `check_times`, `arrival_instructions`, `payment_methods` from `section: "rates"` to `section: "policies"` in `src/config/propertyFieldRequirements.ts`. The Calendar / Seasons rail then correctly shows zero mandatory items, and Policies carries them (its editors already expose the matching `data-field` targets).

2. **Name the outstanding items instead of only counting them.**
   Extend `RequirementLegend` so, when mandatory items are outstanding, it lists their labels as clickable chips (with the requirement `hint` as tooltip) that call `focusRequirementField(key)` — which already switches tab, scrolls, and pulses the control. Same treatment for the section rail chip: replace the generic `title` with the actual labels ("Arrival policy / how to arrive"), so hovering explains the blocker.

3. **Give Calendar / Seasons its own honest status line.**
   Add a small, non-blocking coverage summary above the seasons calendar: earliest and latest authored season date, total days covered, and any gap inside the rolling 365-day window (computed from the seasons already loaded by the calendar — no new query). Green when the window is fully covered, amber with the specific gap dates when not. This answers "is my season coverage fine?" directly rather than leaving it inferred from an unrelated counter.

## Technical notes

- Files touched: `src/config/propertyFieldRequirements.ts` (section reassignment only — predicates unchanged), `src/components/property/RequirementLegend.tsx`, `src/components/property/PropertySectionRail.tsx`, `src/components/property/SeasonsCalendar.tsx` (coverage strip).
- Readiness predicates, wizard gates, and RU push gating stay byte-identical in behaviour; only attribution and presentation change, so a property that is blocked stays blocked.
- The coverage strip is informational and must not feed the mandatory counters — season coverage remains scored by the channel-state 365d groups.
- Seesig will still show one mandatory item outstanding after this change, now labelled "Arrival policy / how to arrive" on the Policies tab, which is the real fix (write the master arrival text, optionally with TOBI).
