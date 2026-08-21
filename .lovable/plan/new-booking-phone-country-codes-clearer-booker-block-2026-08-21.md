# New Booking: phone country codes + clearer Booker block

## 1. Phone number with country dial code

The Guest phone field becomes two controls side by side:

- A searchable country selector showing flag, country name and dial code (e.g. "South Africa +27"). Typing filters by country name or by code, so "+44" or "United King" both work.
- The number field itself, holding only the local part.

On save the two are joined into a single E.164-style value (`+27821234567`) written to the same booking phone field, so nothing downstream changes. When an existing phone already starts with a dial code (editing, or a guest hydrated from history), it is split back into selector + number on load.

**Predetermining the country:** the selector pre-fills from the first match found, in this order:

1. The dial code already present on a picked guest's stored phone number.
2. The guest's recorded nationality / country from their guest profile.
3. The nationality or dial code on that guest's most recent booking.
4. The property's own country (fallback for walk-ins).

The user can always override the guess.

A "Country" field is also added next to the phone row for the guest's country of origin, using the same searchable list, and it keeps the dial code in step when changed (only when the user hasn't manually chosen a different code). This value is saved on the guest profile so the next booking for that guest starts correct.

The same phone control is reused for the Booker phone.

## 2. Booker vs Guest

The booker fields already exist but sit low in the form inside the segmentation block. They move up directly under the guest details as their own "Booker" section:

- Tick box "The booker is the guest" — on by default.
- When unticked, Booker name / email / phone appear, pre-filled by copying the guest's current details so the user only edits what differs, plus a "Copy guest details" button to re-sync after later guest edits.
- When re-ticked, the booker fields clear and the booking saves with booker = guest (existing behaviour).

Company / agent / source / market segment stay where they are today.

## Technical notes

- New `src/lib/dialCodes.ts`: full country list with ISO code, name, flag emoji and dial code; helpers `splitPhone(value)`, `joinPhone(dial, local)`, `dialForCountry(iso)`, `countryForDial(dial)`. `src/lib/countries.ts` stays as-is for existing consumers; the new list supersedes it for these fields.
- New `src/components/pms/PhoneInput.tsx`: shadcn `Popover` + `Command` searchable country trigger next to an `Input`, controlled via `{ value, onChange }` on the combined string so callers stay simple.
- `ManualBookingDialog.tsx`: use `PhoneInput` for guest and booker phone; add `guest_country` to form state; extend `hydrateFromGuest` and the last-booking lookup to resolve the initial country; move the booker tick box + fields out of `BookerSegmentationFields` into a new "Booker" block rendered under guest details.
- `BookerSegmentationFields.tsx`: gains an optional `hideBooker` prop so the booking dialog can render the booker block itself while other callers (booking details grid) keep the current combined layout.
- Guest country persists to `rolos_guest_profiles.nationality` on the existing upsert path — no schema change.
