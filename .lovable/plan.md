
Fix the real cause, not more individual fields.

What I found
- In `src/pages/PropertyForm.tsx`, the fields you pointed out already have the compact classes:
  - `Name` uses `className="h-7 text-xs"`
  - `Telephone` uses `className="h-7 text-xs"`
  - `Type` dropdown uses `className="h-7 text-xs"`
- The reason the typed values still look bigger is a global CSS override in `src/index.css`:
  - `@media screen and (-webkit-min-device-pixel-ratio: 0) { input, select, textarea { font-size: 16px !important; } }`
- That rule forces Safari/iOS form fields to 16px and overrides the property form’s `text-xs`, so your input values do not match the smaller dropdown look.

Plan
1. Update the Safari/iOS font-size rule in `src/index.css` so it does not override the property management forms.
2. Keep the iOS zoom protection for normal/public forms, but exempt the admin property form area.
3. Add a scoped class on the property form wrapper in `src/pages/PropertyForm.tsx` such as a property-form-specific container marker.
4. Use that marker in CSS so inputs/selects/textareas inside the property form can render at the intended compact size (`text-xs`) while the rest of the app keeps current mobile Safari behavior.
5. Verify the General tab fields you highlighted specifically:
   - Name
   - Telephone
   - Contact Email
   - other captured-value inputs
   - ensure they visually match the small “Type / Self Catering” style across tabs/subtabs

Expected result
- “Fonteinhutte …” and “0862690351” will render in the same small font style as “Self Catering”.
- The fix will be systemic for the property edit pages, not another piecemeal field-by-field patch.

Files to change
- `src/index.css`
- `src/pages/PropertyForm.tsx`

Technical note
- The current issue is not missing `text-xs` on those specific fields anymore.
- It is a higher-priority CSS rule with `!important`, so any further per-field class edits alone will keep failing until that global override is scoped properly.
