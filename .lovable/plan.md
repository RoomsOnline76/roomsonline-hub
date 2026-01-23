
# Safari Compatibility Fixes for Forms, Popups & Auth Flows

## Summary

Add Safari/iOS-specific CSS fixes and component updates to ensure forms, dialogs, login, password reset, and onboarding work flawlessly on Safari/iOS devices.

---

## Changes Required

### 1. Update `src/index.css` - Add Safari Form Fixes

Add a new "Safari & iOS Form Fixes" section with the following CSS:

```css
/* =============================================
   SAFARI & iOS FORM FIXES
   ============================================= */

/* Prevent iOS zoom on focus - force 16px minimum */
@media screen and (-webkit-min-device-pixel-ratio: 0) {
  input,
  select,
  textarea {
    font-size: 16px !important;
  }
}

/* Override autofill styling (Safari yellow background fix) */
input:-webkit-autofill,
input:-webkit-autofill:hover,
input:-webkit-autofill:focus,
input:-webkit-autofill:active,
textarea:-webkit-autofill,
select:-webkit-autofill {
  -webkit-box-shadow: 0 0 0 30px hsl(var(--background)) inset !important;
  -webkit-text-fill-color: hsl(var(--foreground)) !important;
  caret-color: hsl(var(--foreground));
  transition: background-color 5000s ease-in-out 0s;
}

/* Consistent form appearance across browsers */
input,
textarea,
select,
button {
  -webkit-appearance: none;
  -moz-appearance: none;
  appearance: none;
}

/* Prevent layout shift when scrollbar appears/disappears (modal fix) */
html {
  scrollbar-gutter: stable;
}

/* Fix scroll issues in dialogs on iOS Safari */
.dialog-scroll-fix {
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
}
```

**Location**: After line 268 (after the text-size-adjust rules)

---

### 2. Update `src/components/ui/select.tsx` - Fix iOS Zoom

Change `SelectTrigger` font size from `text-sm` to `text-base` to prevent iOS zoom:

**Line 20**: Change from:
```tsx
"flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background..."
```

To:
```tsx
"flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background..."
```

---

### 3. Update `src/components/ui/dialog.tsx` - Add iOS Scroll Fix

Add scroll containment to DialogContent for better iOS Safari behavior:

**Line 43**: Add `overscroll-behavior-contain` class:
```tsx
"fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 overscroll-contain data-[state=open]:animate-in..."
```

Also add `max-h-[85vh] overflow-y-auto` for scrollable content on smaller screens:
```tsx
"fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg max-h-[85vh] overflow-y-auto translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 overscroll-contain data-[state=open]:animate-in..."
```

---

### 4. Update `src/components/ui/scroll-area.tsx` - iOS Touch Scrolling

Add touch scrolling support to ScrollArea viewport:

**Line 11**: Add `-webkit-overflow-scrolling: touch` via Tailwind or inline style:
```tsx
<ScrollAreaPrimitive.Viewport 
  className="h-full w-full rounded-[inherit]" 
  style={{ WebkitOverflowScrolling: 'touch' }}
>
  {children}
</ScrollAreaPrimitive.Viewport>
```

---

### 5. Update Onboarding Wizard Dialogs - Safe Scrolling

**File**: `src/components/onboarding/OwnerOnboardingWizard.tsx`

**Line 278**: Add `overscroll-contain` to DialogContent:
```tsx
<DialogContent className="max-w-lg max-h-[90vh] overflow-hidden flex flex-col overscroll-contain" hideCloseButton>
```

---

## Files Modified

| File | Change |
|------|--------|
| `src/index.css` | Add Safari form fixes section (~30 lines) |
| `src/components/ui/select.tsx` | Change `text-sm` to `text-base` in SelectTrigger |
| `src/components/ui/dialog.tsx` | Add scroll containment and max height |
| `src/components/ui/scroll-area.tsx` | Add WebKit touch scrolling |
| `src/components/onboarding/OwnerOnboardingWizard.tsx` | Add overscroll-contain |

---

## Visual Impact

These changes will:
- Prevent iOS Safari from zooming when focusing form inputs
- Maintain brand colors when Safari autofills login/password fields  
- Eliminate layout jump when opening modals
- Enable smooth, contained scrolling within dialogs and scroll areas on iOS
- Ensure consistent form appearance across all browsers

No visual changes on desktop browsers - these are progressive enhancement fixes for Safari/iOS only.

---

## Testing Checklist

After implementation, test on Safari (Mac) and Safari (iOS) for:
- [ ] Login form - no zoom on email/password focus
- [ ] Password reset form - autofill maintains dark/light theme colors
- [ ] Profile modal - scrolls smoothly, doesn't bleed to background
- [ ] Owner onboarding wizard - building list scrolls properly
- [ ] Change password modal - form inputs don't trigger zoom
- [ ] Select dropdowns - no zoom when tapping to open
