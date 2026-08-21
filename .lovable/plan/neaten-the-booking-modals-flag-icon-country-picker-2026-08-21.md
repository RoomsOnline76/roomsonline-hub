# Neaten the booking modals + flag-icon country picker

## 1. Edit Booking drawer (Open → Edit) layout

Today the whole edit form sits in a three-column grid inside a drawer that is only ~768px wide, so the "Linked Profiles & Segmentation" block — which itself wants three side-by-side pickers plus two selects — gets crushed into one narrow third of the drawer.

Changes:

- Widen the booking drawer (to roughly 1120px on large screens, still full-width on mobile).
- Pull "Linked Profiles & Segmentation" and the invoice-to fields out of the narrow notes column into their own full-width band beneath the three columns, so the company / agent / source pickers and the market-segment selects get real room.
- Give that band a light card surface and consistent label sizing so it reads as one grouped section rather than loose fields.
- Tidy the remaining columns: consistent field heights, aligned section headings, and no orphaned single fields at column bottoms.

## 2. Add New Booking dialog

- Keep the current section order (Guest → Booker → Stay → Booking → Booker & Segmentation → Invoice) but let the segmentation section use the dialog's full width in a balanced grid instead of stacked halves.
- Align spacing, heading style and label sizes with the edit drawer so the two surfaces look like siblings.
- Group the invoice fields (To / VAT / Address) into the same band as segmentation.

## 3. Country picker with flag icons

Replace the emoji flags (which render inconsistently, and not at all on many Windows browsers) with real SVG flag icons from the `country-flag-icons` package — bundled locally, no network calls. Used in both the compact dial-code trigger and the searchable list, in the country field, and anywhere else the picker appears. Search still matches country name, ISO code or `+dial`.

## 4. Phone number integrity end-to-end

Verification and small hardening, no format change:

- The phone stays stored in a single field as one E.164-style string (`+27821234567`), which is what channel pushes and the HubSpot adaptor already read — the dial code is never stored separately, so nothing downstream needs to change.
- Harden the join/split helpers so a captured number can never lose its prefix: keep the `+`, strip only spaces and punctuation, and never emit a bare local number once a country is chosen.
- Where a legacy number has no prefix, the picker's country supplies one on save rather than silently pushing a local-only number to channels.
- Confirm the booker phone follows the same rule.

## Technical notes

- `src/components/pms/booking/BookingDetailsGrid.tsx`: move the segmentation + invoice block out of the third grid column into a `lg:col-span-3` band; keep all state and handlers as-is.
- `src/pages/pms/PMSDashboard.tsx`: drawer `SheetContent` width `sm:max-w-3xl` → wider (`lg:max-w-[1120px]`).
- `src/components/pms/ManualBookingDialog.tsx`: layout-only edits to the segmentation/invoice section; no changes to save logic.
- `src/components/pms/crm/BookerSegmentationFields.tsx`: responsive grid tuned for a wide container (`sm:grid-cols-2 xl:grid-cols-3`), optional card wrapper.
- `src/components/pms/PhoneInput.tsx`: swap emoji `flag` for a small `<FlagIcon iso>` component wrapping `country-flag-icons/react/3x2`; add `country-flag-icons` dependency. `flag` stays on the `DialCountry` type for any other consumer.
- `src/lib/dialCodes.ts`: tighten `joinPhone` / `splitPhone` per section 4, with unit coverage for prefixed, unprefixed and leading-zero inputs.
