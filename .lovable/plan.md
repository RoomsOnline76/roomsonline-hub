# Main image becomes a mandatory onboarding check

## What the reads confirm

- The channel gate already treats the main photo as blocking: `_shared/ruReadiness.ts` registers `has_main_image` ("Main photo flagged") with the default `mandatory = true`, and both push paths run it through `mandatoryGaps(...)`, so a listing without a flagged main photo is refused at push time.
- The property-editor requirement registry disagrees: `src/config/propertyFieldRequirements.ts` lists `hero_image` ("Hero image designated") with `tier: "recommended"`, so the editor legend, the section rail counts and the readiness badges present it as optional.
- The two also test different things: the editor accepts `type === "hero"`, `is_main`, `is_hero`, or a plain string image, while the push only sets `has_main_image` from `images.some(i => i.is_main)`.

Result: an owner can reach 100% mandatory in the editor and still be blocked by the push — the exact mismatch class we removed elsewhere.

## Changes

1. Promote `hero_image` in the requirement registry from `recommended` to `mandatory`, with the label and hint reworded to say the channel rejects the listing without a main photo (matching the wording style of the other channel-mandatory image checks).
2. Align the satisfaction test with the pushed data: satisfied only when at least one image in the set is explicitly flagged as the main/hero image. A bare string-URL image list no longer counts as satisfied on its own — if no flag exists anywhere the check stays outstanding so the owner sets one, which is what the push reads.
3. Register the field in the channel-mandatory field registry (`src/lib/channelMandatoryFields.ts`) as `hero_image → has_main_image`, so the Images tab shows the same solid-border mandatory treatment as the other channel-blocking fields, fading once a main photo is flagged.
4. Keep the check keyed to the existing `has_main_image → images` deep link in `channelRegistry.ts`, so a wizard blocker still focuses the Images tab.

No edge-function change is needed — the gate is already mandatory there; this closes the gap on the ROL'OS side so the editor, the wizard score and the push agree.

## Technical notes

- `src/config/propertyFieldRequirements.ts` — `hero_image` entry: tier, label/hint, `isSatisfied`.
- `src/lib/channelMandatoryFields.ts` — add the `hero_image` row.
- Mandatory totals in `usePropertyFieldRequirements` / `RequirementLegend` pick the new tier up automatically; no other call sites need edits.
