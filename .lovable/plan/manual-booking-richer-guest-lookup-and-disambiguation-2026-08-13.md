# Manual booking: richer guest lookup and disambiguation

Guest search in the Create booking dialog finds people, but two things are missing:

1. Picking a match only fills **name, email, phone**. Everything else already known about the guest (nationality, notes/preferences, company, VIP/blacklist status, past-booking habits) is not carried over, so staff retype it.
2. When several matches share a name, the list shows only name + contact line — there is no way to tell which record belongs to which person before clicking. Same-name records genuinely exist (the same person often has one profile per property in a portfolio, and imported history can add more).

## What will change

### A. Selecting a guest fills the whole profile

On pick, the dialog will hydrate from the chosen record:

- Name, email, phone (as today)
- Nationality, guest notes/preferences into the internal notes area (appended, never overwriting what the user typed)
- Company: linked from the guest's most recent booking company, and matched to a CRM account when one exists (which also fills invoice name / VAT / address as the existing company link does)
- Second guest name, and booker details when the last booking was made by someone other than the guest
- Preferred channel/origin from the guest's most recent booking (staff can still change it)
- Any missing field stays untouched — nothing is blanked out by a selection

A dismissible summary strip appears under the name field once a guest is picked: stays, received to date, outstanding, last stay, VIP/blacklist/repeat badges, and a "clear guest" action so a wrong pick is one click to undo. Blacklisted guests show a clear warning before the booking is saved.

### B. Same-name matches become distinguishable

- Each suggestion row gains a second detail line: home property name, masked email/phone, nationality, stays and last stay date, plus VIP / blacklisted / archived badges.
- Same-name rows are grouped under one heading with each variant listed beneath, so it reads as "3 records named John Smith" rather than three identical rows.
- Same-name records are no longer collapsed away: today a booking-history hit is dropped when a profile shares the name, which can hide a genuinely different person. Dedupe will key on email (or phone) rather than name alone, and identical email/name pairs still merge.
- Rows are ordered: exact profile matches with stay history first, then other profiles, then booking-history-only names (labelled "from booking history").
- Archived profiles are shown last and labelled, rather than silently offered as normal choices.
- In portfolio mode the search covers the portfolio (not just the selected property) so a returning guest known at a sibling property is found, with the property name shown on each row.

## Technical notes

- All work is in `src/components/pms/ManualBookingDialog.tsx`, mainly the `GuestNameAutocomplete` component and the `onSelect` handler.
- Suggestion query extends to `nationality, notes, tags, is_blacklisted, is_archived, total_received, total_outstanding, property_id`; property ids resolve to names via the property options already loaded by the dialog.
- Hydration fetches the guest's most recent booking (company, second guest, booker fields, channel) in one follow-up query keyed by `rolos_guest_id`, falling back to matching on email when there is no profile link.
- Company matching reuses the existing `useCrmAccounts` / `applyCompany` path so invoice identity behaviour is unchanged.
- Booking-history-only suggestions keep their `booking:<id>` synthetic id; on save, `ensureGuestProfile` still resolves or creates the canonical profile, so no new duplicates are introduced.
- No database or edge-function changes.
