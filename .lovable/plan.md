

## Fix Two Integration Snippet Issues

### Issue 1: Direct Link HTML Button Uses Hardcoded Red Instead of Property Color

**Root cause:** `DirectLinkTab` props interface doesn't include `brand_primary_color`, so the HTML snippet hardcodes `background:#e91e63` (the wrong pink/red — see uploaded screenshot showing red button).

**Fix in `src/components/integrations/DirectLinkTab.tsx`:**
- Add `brand_primary_color: string | null` to the `DirectLinkTabProps.property` interface
- Use `property.brand_primary_color || "#e91e8c"` for the button background color in the generated HTML snippet
- No changes needed in parent components — they already pass the full property object which includes this field

### Issue 2: Booking Bar Calendar Not Working on External Sites

**Root cause:** The JavaScript in the snippet uses `\\u2013`, `\\u2192`, `\\u00B7` (double-escaped unicode). Inside a TypeScript template literal, `\\u` produces the literal characters `\u` in the output string. When this is pasted into a raw HTML page and the browser's JS engine runs it, `'\u2013'` works — but the **double backslash** means the output is actually the string `\u2013` (6 characters) rather than the `–` character. This can cause rendering issues and potentially break the script depending on the browser's handling.

More critically, the real problem is likely that external sites still have the **old snippet** with inline `onclick` handlers. The current code in the repo uses `addEventListener` and looks correct.

**Fix in `src/components/integrations/BookingBarTab.tsx`:**
- Replace `\\u2013` with the actual `–` character (en-dash)
- Replace `\\u2192` with `→`
- Replace `\\u00B7` with `·`
- This makes the snippet more robust and readable when pasted into external sites

### Files to Modify

| File | Change |
|------|--------|
| `src/components/integrations/DirectLinkTab.tsx` | Add `brand_primary_color` to props; use it in the HTML snippet |
| `src/components/integrations/BookingBarTab.tsx` | Replace double-escaped unicode with actual characters |

