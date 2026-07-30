## Goal

Edit Property → Integrations currently shows "Push to Rentals United" with only the lightweight dry-run validation. ROLOS → Channels → RU Readiness has the full scorecard (`RuReadinessScorecard`, backed by `ru-cert-portal` → `property_readiness`) which blocks sync until every mandatory item passes. Bring the same scorecard and the same gate to the admin Integrations tab.

## Changes

1. `src/components/property/PropertyFormIntegrationsTab.tsx`
   - Add local state `ruReport: RuReadinessReport | null`.
   - Render `<RuReadinessScorecard propertyId={property.id} onReport={setRuReport} />` directly under the Push to Rentals United card (only for RU-relevant properties — same condition already used by the push card, i.e. always visible as today).
   - Pass `readiness={ruReport}` into `<PushToRentalsUnited />`.

2. `src/components/property/PushToRentalsUnited.tsx`
   - Accept an optional `readiness?: RuReadinessReport | null` prop.
   - Header badge: show `Readiness NN% — blocked` (destructive) or `Ready` (secondary) when a report is present.
   - Disable the **Push to RU** button when `readiness?.blocked === true`, with a tooltip/hint "Complete the RU readiness checklist below before syncing" — in addition to the existing `validation && !isReady` rule.
   - Leave **Validate** (dry run) always enabled so admins can still inspect XML/diagnostics.

## Notes

- No backend change needed: `push-property-to-ru` already enforces the hard server-side gate, so this only aligns the UI with the existing rule.
- Scorecard is reused as-is (`standalone` card mode), so admin and ROLOS show identical checks, percentages and deficiency lists.
