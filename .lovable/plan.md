

# Fix: Remaining Inconsistent Font Sizes in PropertyForm.tsx

## Problem

Most fields in `PropertyForm.tsx` already use `text-xs`, but several `SelectTrigger` and `Textarea` elements were missed and still inherit the larger default font.

## Elements to Fix

### SelectTriggers missing `text-xs` (3 elements)
- **Line 8244**: Rate calculation type selector — has `className="bg-background"`, needs `text-xs h-7` added
- **Line 10532**: Room rate type selector — no className at all
- **Line 11508**: Package season selector — no className at all

### Textareas missing `text-xs` (4 elements)
- **Line 5770**: Postal address — no className
- **Line 6363**: Property description — no className
- **Line 7256**: Children policy — no className
- **Line 11471**: Package description — no className

## Changes

**Single file: `src/pages/PropertyForm.tsx`**

Add `className="text-xs h-7"` to the 3 bare SelectTriggers and `className="text-xs"` to the 4 bare Textareas. For line 8244, append `text-xs h-7` to the existing `bg-background` class.

Total: 7 elements updated, all in the same file. No other files need changes — the subtab components were already fixed in the previous round.

