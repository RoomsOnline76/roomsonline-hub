# Additional slides: individual movement + section titles in organizer

Two focused refinements to the slide organizer so each additional slide is its own movable row and the reviewer can tell them apart while reordering.

## 1. Each additional slide is individually movable

Custom slide sections currently only appear in the organizer once they have at least one pasted image, so a freshly created section can't be positioned before content is added.

- `src/components/reports/SlideOrganizerCard.tsx`: include **custom** slots in `mediaSections` even when they have zero images, so each one is its own draggable row from the moment it is created. Built-in multi-slot sections (Channel Performance, Booking.com, Expedia) and the built-in Additional Slides slot keep appearing only when they have images, as today — so the organizer isn't cluttered with empty built-in slots.
- Each custom slot already maps to its own page key (`media:<section>` where `section` = the slot title), so each is already individually draggable. This change just makes them visible sooner, before images are pasted.

## 2. Section title shown in the organizer card

The organizer row currently shows only the section name and "N pasted images", which isn't enough to distinguish multiple additional slides.

- `SlideOrganizerCard.tsx`: for each media section, collect the distinct `section_title` headings the reviewer typed (falling back to the slot title when an image has none), and pass them alongside the image count.
- `src/hooks/useReportPageOrder.ts`: widen the `mediaSections` prop type from `{ section: string; images: number }` to `{ section: string; images: number; titles: string[] }`, and build the media page `summary` from those titles — e.g. `2 images · Airbnb performance, Competitor rates`. For an empty custom slot, use `No images yet`.
- `src/components/reports/SlideOrganizer.tsx`: render the section titles as a secondary muted line under the row title (truncated), so the reviewer can identify contents at a glance while reordering. The existing image-count detail stays.

## Technical notes

- Frontend-only change across three files: `SlideOrganizerCard.tsx`, `useReportPageOrder.ts`, `SlideOrganizer.tsx`.
- No schema or edge-function changes. The backend already drops empty media sections from the printed draft (`revenueReportHtml.ts` filters `slot.images.length > 0`), so an empty custom slide occupies a saved position in the organizer but prints nothing until it has content. When the user later pastes an image, the slot's page key enters the builder's `available` list and takes its saved position.
- Page keys for custom slots remain `media:<section>`; renaming a custom slot changes its key and resets its position (pre-existing behaviour, out of scope here).

## Verification

On the current Torburnlea run: create two custom slide sections without pasting any images, confirm both appear as individual rows in the organizer and can each be dragged (or nudged) to different positions. Paste an image with a section title into one of them, confirm the title now shows in the organizer row. Regenerate the draft and confirm the empty section prints nothing while the filled section prints at its chosen position.
