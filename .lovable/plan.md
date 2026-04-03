

# Fix: Inconsistent Font Sizes in Property Form

## Problem

The form field components have mismatched font sizes:

| Component | Current Size | Target |
|-----------|-------------|--------|
| `Input` | `text-base md:text-sm` | `text-sm` always |
| `SelectTrigger` | `text-base` | `text-sm` always |
| `Textarea` | `text-sm` | Already correct |
| `SelectItem` (dropdown) | `text-sm` | Already correct |
| `Label` | `text-sm` | Already correct |

The `Input` shows `text-base` (16px) on mobile and `text-sm` (14px) on desktop. The `SelectTrigger` shows `text-base` (16px) everywhere. The dropdown items inside selects already use `text-sm`. This creates a visible mismatch.

## Fix

Change two UI primitives so all form fields consistently use `text-sm`:

### 1. `src/components/ui/input.tsx`
- Change `text-base ... md:text-sm` → `text-sm`

### 2. `src/components/ui/select.tsx`
- Change `SelectTrigger` from `text-base` → `text-sm`

This is a global fix — every Input and Select across the app (including all property form tabs) will use the same compact `text-sm` font, matching labels, textareas, and dropdown items.

**Note**: The `text-base` on mobile inputs is a common pattern to prevent iOS zoom on focus (Safari auto-zooms inputs below 16px). After this change, iOS Safari may zoom on input focus. If that becomes an issue, it can be addressed separately with a viewport meta tag.

