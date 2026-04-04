

# Fix Package Modal Font Size Consistency

## Problem

The edit package modal (and potentially other modals) renders via a portal **outside** the `.property-form-container` div. The CSS rule that forces `font-size: 12px !important` on inputs only applies inside `.property-form-container`. So modal inputs use the default 16px Safari override instead of the compact 12px used elsewhere in the admin forms.

## Fix

**File: `src/index.css`** (~line 291-295)

Extend the existing Safari font-size override to also target inputs inside Dialog portals used by the property form. Add a second selector targeting `[role="dialog"]` inputs:

```css
.property-form-container input,
.property-form-container select,
.property-form-container textarea,
[role="dialog"] input,
[role="dialog"] select,
[role="dialog"] textarea {
  font-size: 12px !important;
}
```

This ensures all admin modals (package edit, specials, announcements, etc.) use the same compact font size as the rest of the property form, without affecting the public-facing booking/checkout modals (which don't use these dialog patterns).

**Alternative (more targeted):** Add a `property-form-container` class directly to each `<DialogContent>` in PropertyForm.tsx. This is more surgical but requires touching multiple dialog instances.

## Recommendation

The CSS selector approach is simpler — one line change covers all current and future admin modals. Single file, ~3 lines modified.

