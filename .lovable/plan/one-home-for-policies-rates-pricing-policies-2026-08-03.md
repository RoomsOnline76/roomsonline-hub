# One home for policies: Rates & Pricing → Policies

## Decision

Retire the standalone **Guest Experience → Policies** rail section. Everything about policies — the new master-first policy library plus the legacy house-rules/check-in/deposit fields — lives in **Rates & Pricing → Policies**, for every property, in both `/admin/edit property` and ROLOS `/pms/property-setup`.

## What changes

1. **Rail**: drop `house-rules` from the section list and from the "Guest experience" group in `src/config/propertySectionOrder.ts` (also drop its hint chips). The Guest experience group keeps Templates, Announcements, Images. Same key removed from the ROLOS section list in `PMSPropertySetup.tsx`.
2. **Rates → Policies subtab** becomes the consolidated home, in this order:
   - Master policy panel (explicit master or explicit "no cancellation terms").
   - Policy library table with usage metrics and specials cross-links.
   - Portfolio policy library (activate/copy from sibling properties).
   - New "House rules & stay terms" block: the existing toggle chips (non-refundable, smoking, pets, children, parties, 24h check-in), deposit, same-day booking, check-in/check-out times, age ranges, cot/extra beds, advance notice, pets detail — moved verbatim from the `house-rules` tab so nothing is lost.
   - The legacy free-text "Cancellation Policies" forfeit rows are removed from the UI; the policy library is now the only authoring surface for cancellation terms. Existing stored values keep saving untouched so channel pushes are unaffected.
3. **Saving**: the moved fields keep writing through the same `formData`/amenities save path, so the Rates → Policies subtab submits with the same form handler already used elsewhere in the form.
4. **Deep links / redirects**: any navigation that targets `house-rules` (validation blocker mapping, progress/quality-gate jumps, `amenities.check_in_time` field mapping, saved rail state in storage) is remapped to the rates section + `policies` subtab so existing links and blockers still land on real content.

## Technical notes

- Files: `src/config/propertySectionOrder.ts` (remove key, group entry, icon, hints), `src/pages/PropertyForm.tsx` (delete the `house-rules` TabsContent, relocate its cards into the Policies subtab region; update the field→section map and blocker routing), `src/components/property/RateManagerTab.tsx` (Policies subtab renders `PoliciesTab` then the relocated house-rules cards), `src/pages/pms/PMSPropertySetup.tsx` (section key list).
- To keep `PropertyForm.tsx` from growing, the relocated cards go into a new `src/components/property/policies/HouseRulesCard.tsx` that takes `formData` + `setFormData` props.
- No schema change. `rolos_reservation_policies`, `properties.cancellation_master_mode` and the checkout resolver hooks stay as-is.
