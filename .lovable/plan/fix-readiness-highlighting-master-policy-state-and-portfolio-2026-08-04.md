# Fix readiness highlighting, master policy state and portfolio policy visibility

Six reported issues. Four have a confirmed root cause; two need a quick verification step first.

## 1. Check-in / check-out raised as a warning even though it is set (confirmed)

Tidal Pools stores `14:00` / `11:00` under `amenities.house_rules.check_in_from` / `check_out_to`, which is where the property form writes them. Both readers look in the wrong place:

- `check-activation-readiness` reads `amenities.check_in_from || amenities.check_in_time`
- the field registry reads `amenities.check_in_from`

Fix: both readers resolve the value from `amenities.house_rules.*` first, then the legacy top-level keys. This clears the false warning for every property saved through the form.

## 2. Master cancellation policy raised even when a master exists (confirmed, same class of bug)

Tidal Pools has a master policy row (`rolos_reservation_policies.is_master = true`), but `amenities.master_cancellation_policy_id` is empty — so the registry treats the master as missing. Fix: the master-policy requirement is evaluated from the actual policy rows (master present, or the explicit "no cancellation policy" mode), not from the amenities mirror.

## 3. Most fields are not border-marked and "Show me" jumps nowhere (confirmed)

The registry points at `data-field="..."` selectors and ids that do not exist anywhere in the editor. No component in `src/` carries a `data-field` attribute, and the ids `country`, `latitude`, `owner_email`, `property-images`, `facilities`, `star_rating`, `room-types`, `master_policy`, `check_in_from` are absent from the property editor. Only a handful of fields (name, type, description, address, city, contact email, phone) can ever be found — everything else silently fails to paint, and "Show me" then lands on nothing.

Fix:
- Add the `data-field` markers to the real controls in the components that own them: `GeneralTab` (country, geo/map, owner, registration/VAT, banking), `InfoFacilitiesTab` (facilities checklist, star rating), the images tab (gallery + hero), the rooms panel, `HouseRulesCard` (check-in/check-out), `PoliciesTab` (master policy panel), contacts and the RU currency field.
- Where the same id exists twice (PropertyForm and GeneralTab), prefer the visible instance so the border and the scroll land on the field the user sees.
- "Show me" falls back to the nearest marked ancestor/section heading when a control is inside a collapsed block, and opens that block before pulsing.
- Make the marking easier to see: thicker ring on outstanding fields plus a small pink/blue tag next to the label, instead of relying on a 1px border colour alone.

## 4. Default-policy star not marked after saving (verify, then fix)

The policy row for Tidal Pools is `is_default = true` in the database and the library table renders a Default badge from that flag — so the write itself is working. Before changing anything, reproduce the edit-and-save flow in the browser to see which surface is missing the marker (the master panel shows no default star at all today). Then:
- Show Master and Default markers together in the master policy panel.
- Refresh the policy list after save so the badge appears without a reload.

## 5. Portfolio policies show "(0)" after copying the master out (confirmed)

Each sibling (Dassiesingel, Fonteinhutte, Seesig) already holds a copy named "Cancellation Master", and the portfolio list hides any policy whose name or source already exists locally — so the section correctly has nothing "available" but reads as empty and looks broken.

Fix: list every portfolio policy with a status chip — `Active copy`, `Linked`, or `Available` — and count only the available ones in the header, so the section always shows what the portfolio holds.

## 6. Copies do not become the master on the target property (confirmed)

The copies on all three siblings landed with `is_master = false` and `is_default = false`, so those properties still have no master and keep failing the readiness check. Fix: add a "also set as master on each target property" option (default on when the source is the master) to the apply dialog, and set the mode so the target's master panel reflects it.

## Technical notes

- `src/config/propertyFieldRequirements.ts` — house-rules-aware check-times resolver; master policy evaluated from policy rows passed in as extra subject context.
- `src/hooks/usePropertyFieldRequirements.ts` — also fetch `rolos_reservation_policies` (master flag) and the master policy mode for the property, and feed them into evaluation.
- `src/lib/requirementFocus.ts` — collapsed-block opening and ancestor fallback in `focusRequirementField`; prefer visible matches in `resolveRequirementElement`.
- `src/index.css` — stronger outstanding-field treatment.
- `supabase/functions/check-activation-readiness/index.ts` — `checkPoliciesComplete` reads `amenities.house_rules` first.
- `src/components/property/policies/PortfolioPolicyLibrary.tsx`, `ApplyPolicyToPropertiesDialog.tsx`, `MasterPolicyPanel.tsx` — status chips, master-on-target option, default marker.
- `data-field` attributes added across `GeneralTab`, `InfoFacilitiesTab`, images/rooms panels, `HouseRulesCard`, `PropertyContactDetails`, `PoliciesTab`.
