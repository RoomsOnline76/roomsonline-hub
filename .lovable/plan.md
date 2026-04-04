

# Configurable Booking Flow Entry Point for White-Label Embeds

## Problem

Currently every integration type (Widget, Direct Link, Smart Button, etc.) hardcodes a single starting view — either the full embed (`/embed/property/:slug`) or the checkout page (`/booking/:slug`). White-label clients cannot choose where their guests land. Some want the full property showcase, others want to deep-link to a specific room, and some only need the final checkout step embedded.

## Existing Flow (for reference)

```text
Property Showcase ──► Room Showcase ──► Embed (rooms + calendar) ──► Checkout
/property/:slug      /property/:slug/    /embed/property/:slug       /booking/:slug
                      room/:roomSlug
```

## Solution — "Entry Point" Selector

Add a **single dropdown/radio** to each integration configurator that controls which step the generated URL points to. Four entry points:

| Entry Point | URL Pattern | What the guest sees |
|---|---|---|
| **Full Showcase** | `/property/:slug?integration=...&brand_color=...` | Hero, gallery, all rooms, reviews, map — full experience |
| **Rooms & Availability** (current default) | `/embed/property/:slug?...` | Compact embedded view with calendar + room cards |
| **Specific Room** | `/embed/property/:slug?room=:roomId&...` | Single room detail with availability + Book button |
| **Checkout Only** | `/booking/:slug?roomTypeId=...&checkIn=...&checkOut=...` | Jump straight to guest details & payment (requires room + dates pre-selected) |

### How "Specific Room" works

The embed page (`EmbedProperty.tsx`) will accept a new `room` query param. When present, it filters `roomTypes` to show only that room — effectively a single-room landing page. No new route needed.

### How "Checkout Only" works

The existing `/booking/:slug` page already accepts `roomTypeId`, `checkIn`, `checkOut` as query params. The configurator just needs to let the user pick a room and dates to bake into the URL.

## Changes

### 1. New shared component: `EntryPointSelector`
**File**: `src/components/integrations/EntryPointSelector.tsx`

A reusable component with:
- Radio group: Full Showcase / Rooms & Availability / Specific Room / Checkout Only
- Conditional sub-fields:
  - "Specific Room" → dropdown of property's room types (fetched via query)
  - "Checkout Only" → room dropdown + default check-in/check-out date pickers
- Exports a function `buildEntryUrl(property, entryPoint, options)` that returns the correct URL with all params

### 2. Update integration configurators to use it

Each of these files gets the `EntryPointSelector` added above the existing controls, and uses `buildEntryUrl()` instead of hardcoded URL construction:

| File | Current URL target |
|---|---|
| `DirectLinkTab.tsx` | `/booking/:slug` → configurable |
| `WidgetTab.tsx` | `/embed/property/:slug` → configurable |
| `SmartBookButtonGenerator.tsx` | `/booking/:slug` or `/embed/property/:slug` → configurable |
| `WidgetSetupWizard.tsx` | `/embed/property/:slug` → configurable |
| `BookingBarTab.tsx` | `/embed/property/:slug` → configurable |
| `FullEmbedTab.tsx` | `/embed/property/:slug` → configurable |

### 3. `EmbedProperty.tsx` — support `room` filter param

Add logic near line 27-31 to read `searchParams.get("room")` and, if present, filter `roomTypes` to only that room after data loads. Minor change — roughly 5 lines.

### 4. No database changes needed

The entry point is a UI-configurator concern — it only affects the generated snippet/URL. No new columns or tables required.

## Files to Create/Change

| File | Action |
|---|---|
| `src/components/integrations/EntryPointSelector.tsx` | **Create** — reusable entry point picker + URL builder |
| `src/components/integrations/DirectLinkTab.tsx` | Add `EntryPointSelector`, use `buildEntryUrl()` |
| `src/components/integrations/WidgetTab.tsx` | Add `EntryPointSelector`, use `buildEntryUrl()` |
| `src/components/integrations/SmartBookButtonGenerator.tsx` | Add `EntryPointSelector`, use `buildEntryUrl()` |
| `src/components/integrations/WidgetSetupWizard.tsx` | Add `EntryPointSelector`, use `buildEntryUrl()` |
| `src/components/integrations/BookingBarTab.tsx` | Add `EntryPointSelector`, use `buildEntryUrl()` |
| `src/components/integrations/FullEmbedTab.tsx` | Add `EntryPointSelector`, use `buildEntryUrl()` |
| `src/pages/EmbedProperty.tsx` | Read `room` param, filter to single room when set |

