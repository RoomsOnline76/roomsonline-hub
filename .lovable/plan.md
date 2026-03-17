

## Plan: Smart Button Combiner + NightsBridge-Style Embed Page

### Two Core Problems

**A. Smart Button** — Currently generates only a styled `<a>` link. User wants it to be a **solution combiner** where owners pick which elements to include (button only, button + date pickers, button + inline widget, booking bar + widget, etc.) and get the appropriate combined snippet.

**B. Embed Page (`EmbedProperty.tsx`)** — Currently shows a small card with a redirect link. The widget/full embed/WordPress iframes all point here but it just bounces the guest off-site. It needs to render the **full NightsBridge-style booking experience** inline: branded header, date pickers, room type grid with prices/availability, property info section, and "Powered by ROL'OS" footer — all within the iframe, no redirects.

---

### Changes

#### 1. Smart Button Generator — Add "Solution Type" selector

Add a new Step 0 before platform selection: **"What do you need?"** with options:

| Option | Description | Output |
|--------|-------------|--------|
| **Book Now Button** | Simple styled link (current behaviour) | `<a>` tag |
| **Button + Date Pickers** | Booking bar-style with dates + button | HTML/JS snippet with date inputs |
| **Embedded Widget** | Full inline booking widget | iframe snippet pointing to `/embed/property/{slug}` |
| **Button + Widget Combo** | Button that scrolls to / reveals an embedded widget on the same page | Combined snippet: button + hidden iframe that shows on click |

The rest of the customisation (color, size, style, platform) applies to whichever solution type is selected. The generated code changes based on the solution type. This replaces having separate tabs — the Smart Button becomes the **single entry point** for all integration code generation.

**File:** `src/components/integrations/SmartBookButtonGenerator.tsx`

#### 2. Rebuild `EmbedProperty.tsx` — NightsBridge-style inline booking

Replace the current simple card with a full booking page that renders **inside the iframe**, matching the NightsBridge layout from the screenshot:

**Layout (top to bottom):**
- **Branded header bar**: Property name on left, brand color background, "Do you have a promo code?" + "Login" links on right
- **Date picker row**: Check-in / Check-out date inputs, night count badge, "Check Availability" button, "Hide Calendar" toggle
- **Availability grid**: Room types as rows, dates as columns (day/week/day navigation). Each cell shows the nightly rate or "SOLD". Uses property's `hostfully_room_types` or `room_types` data with real availability from the DB.
- **Property info section**: Hero image, "About us" blurb, "General facilities" list, contact info (phone + email)
- **Footer**: "Online booking powered by ROL'OS on behalf of {Property Name}" + privacy policy link

**Data sources:**
- Property details from `properties` table (name, images, facilities, contact)
- Room types from `hostfully_room_types` or `room_types` (whichever exists for this property)
- Availability/pricing from existing availability tables
- Brand color from URL param or property record

**Key behaviors:**
- `mode=embedded` → no outer navigation chrome, just the booking engine
- Date selection updates the grid in real-time
- Clicking a rate cell adds that room type to cart / initiates booking flow
- All interactions stay within the iframe (no `target="_blank"`, no redirects)
- Responsive: works at widget width (480px) and full-page width (100%)

**File:** `src/pages/EmbedProperty.tsx` — full rewrite

#### 3. Update embed tab descriptions

Update `WidgetTab`, `FullEmbedTab`, `WordPressTab` descriptions to reference the new NB-style experience: "Guests see a full availability calendar with room types, rates, and can complete their booking — all within the embed."

**Files:** `WidgetTab.tsx`, `FullEmbedTab.tsx`, `WordPressTab.tsx` — minor description updates

---

### Files to Modify

| File | Change |
|------|--------|
| `SmartBookButtonGenerator.tsx` | Add solution type selector (button / button+dates / widget / combo); generate appropriate snippet per type |
| `EmbedProperty.tsx` | Full rewrite: NB-style branded header, date picker row, room availability grid, property info, footer — all inline, no redirects |
| `WidgetTab.tsx` | Update description to reflect NB-style inline experience |
| `FullEmbedTab.tsx` | Update description to reflect NB-style inline experience |
| `WordPressTab.tsx` | Update description to reflect NB-style inline experience |

