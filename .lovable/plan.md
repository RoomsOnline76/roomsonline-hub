

# Plan: White-Label Integration Flow + Responsive Embed Layout + Commission Alignment

## Four Issues to Address

### Issue 1: ROL Branding Leaking Into Integration Flows
**Problem:** When a guest arrives via any `/integrations` path (widget, embed, WordPress, direct link, booking bar), the `Booking.tsx` checkout page wraps content in `PublicLayout`, which renders the **ROL logo header** and **ROL footer** with "RoomsOnline" branding. The `BookingConfirmation.tsx` page does the same. The brand CSS variables are applied correctly, but the visual chrome (header logo, footer text, nav links) is all ROL.

**Fix:**
- Add an `integration` URL parameter passthrough from `EmbedProperty.tsx` → `Booking.tsx` → `BookingConfirmation.tsx`
- In `Booking.tsx`, detect `integration` param. When present (widget, full_embed, wordpress, direct, booking_bar), render a **white-label layout** instead of `PublicLayout`:
  - **Header**: Property logo + property name (from brand data already fetched), no ROL logo, no ROL nav links (Journal, About, etc.)
  - **Footer**: "Powered by ROL'OS" subtle footnote only — no ROL links
  - **Confirmation page**: Same white-label wrapper when `integration` param is present
- Pass `integration` param when navigating from `Booking.tsx` to `BookingConfirmation.tsx` (`navigate()` call)
- **Confirmation emails**: Already handled by the `resolveBranding` helper in edge functions per existing memory. No code changes needed there — the email system already white-labels when `brand_override_enabled` is true.

**Files to modify:**
| File | Change |
|------|--------|
| `src/pages/Booking.tsx` | Read `integration` param; conditionally use white-label layout instead of `PublicLayout`; pass `integration` to confirmation navigation |
| `src/pages/BookingConfirmation.tsx` | Read `integration` param; use white-label layout; change "Return to Home" to close tab or back to property |
| `src/pages/EmbedProperty.tsx` | Already passes `integration` — no change needed |
| `src/components/integrations/BookingBarTab.tsx` | Already passes `integration=booking_bar` in URL — no change needed |
| `src/components/integrations/DirectLinkTab.tsx` | Add `integration=direct` to the booking URL |
| New: `src/components/layout/WhiteLabelLayout.tsx` | Minimal layout component: property logo + name header, "Powered by ROL'OS" footer, no ROL branding |

### Issue 2: Embed Layout Not Responsive
**Problem:** `EmbedProperty.tsx` renders a wide availability grid table with horizontal scroll that looks terrible in narrow iframes (widget at 480px, or even full embed). The table has date columns that force horizontal scrolling.

**Fix:** Redesign `EmbedProperty.tsx` to use a **card-based layout** (inspired by NightsBridge) instead of a wide table:
- **Narrow mode** (< 600px / widget): Stack room cards vertically. Each card shows: thumbnail, room name, guest count, per-night rate, total for selected nights, "Book" button. No date-column grid.
- **Wide mode** (≥ 600px / full embed): Same card layout but 2-column grid for room cards.
- Remove the horizontal-scroll date grid entirely — it's not useful in an iframe context. The dates are already selected in the date picker bar at the top.
- Keep the date picker row, property info section, and branded header.

**Files to modify:**
| File | Change |
|------|--------|
| `src/pages/EmbedProperty.tsx` | Replace table-based availability grid with responsive card-based room listing |

### Issue 3: Date Pickers in Integration Snippets
**Problem:** The embed page (`EmbedProperty.tsx`) uses native HTML `<input type="date">` elements. These look different across browsers and don't match the expanding snake calendar used in the booking bar snippet.

**Fix:** Replace the native date inputs in `EmbedProperty.tsx` with a custom inline calendar component that matches the booking bar's expanding snake pattern:
- Build a lightweight inline calendar (similar to the booking bar's vanilla JS calendar but in React) that uses the property's brand color
- Show check-in/check-out as a pill with expanding snake highlight
- Calendar opens on click of the date pill, shows month view with range selection

**Files to modify:**
| File | Change |
|------|--------|
| `src/pages/EmbedProperty.tsx` | Replace native date inputs with a React inline expanding-snake calendar component |
| New: `src/components/embed/EmbedDatePicker.tsx` | Reusable date range picker with expanding snake motif for embed contexts |

### Issue 4: Commission Rate Information
**Problem:** Direct link and booking bar tabs show "commission applies" with amber warnings suggesting 10% ROL portal commission. But these integration tools use the property's own website → ROL'OS PMS flow, which should be the **property agreement rate (default 2%)**, not the 10% portal rate. The 10% only applies when guests find and book via the `book.slp.rol.co.za` portal directly.

**Fix:** Update commission messaging across all integration tabs:
- **Direct Link, Booking Bar**: These redirect via the ROL portal → should state the commission matches the property agreement (default 2%), not the 10% portal rate. Update copy to clarify.
- **Widget, Full Embed, WordPress**: These are inline booking → already correctly state "platform fee as per property agreement". Keep as-is.
- Optionally fetch the actual commission rate from `property_commercial_terms` where `commission_type = 'pms'` and display it (e.g., "Platform fee: 2%").

**Files to modify:**
| File | Change |
|------|--------|
| `src/components/integrations/DirectLinkTab.tsx` | Update commission copy: "Platform fee: 2% (or per your agreement)" — remove amber warning, use neutral info style like widget/embed tabs |
| `src/components/integrations/BookingBarTab.tsx` | Same — update commission copy to property agreement rate, not portal commission |
| `src/components/integrations/DirectLinkTab.tsx` | Also update description to remove "Sleeping In Africa" portal references — these are direct property links |
| `src/components/integrations/BookingBarTab.tsx` | Also update description to remove portal redirect references |

---

## Summary of All Files

| File | Action |
|------|--------|
| `src/components/layout/WhiteLabelLayout.tsx` | **Create** — minimal property-branded layout |
| `src/components/embed/EmbedDatePicker.tsx` | **Create** — expanding snake date picker for embeds |
| `src/pages/Booking.tsx` | **Edit** — detect `integration` param, use WhiteLabelLayout |
| `src/pages/BookingConfirmation.tsx` | **Edit** — detect `integration` param, use WhiteLabelLayout |
| `src/pages/EmbedProperty.tsx` | **Edit** — card layout, React date picker, responsive |
| `src/components/integrations/DirectLinkTab.tsx` | **Edit** — fix commission copy, remove portal references |
| `src/components/integrations/BookingBarTab.tsx` | **Edit** — fix commission copy, remove portal references |

