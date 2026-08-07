# Retire vendor naming from ROL'OS — one shared vocabulary

Every user-visible mention of "Rentals United" / "RU" disappears from the ROL'OS module and the
property editor, replaced by ROL'OS-owned language. The vendor name survives only in the admin
integrations & compliance workbench, which is where onboarding, connection and certification are
actually driven from.

## Vocabulary

One helper module becomes the single source of these terms, so wording never drifts again:

| Today | Becomes |
| --- | --- |
| Rentals United (the system) | Channel Manager |
| RU (badge / short form) | ROL'OS |
| Booking source "Rentals United" | ROL'OS Channels |
| "Push to RU" | Publish to Channel Manager |
| "RU ID" / "Unit RU ID" | Channel Manager ID / Unit Channel Manager ID |
| "RU OwnerID" / sub-user / sub-account | Distribution account |
| "RU sync readiness" | Channel readiness |
| "RU API keys" | Distribution account keys |
| Any AI reference | TOBI |

## What changes

### 1. ROL'OS pages

- **Dashboard booking card**: the channel row now reads **ROL'OS Channels** with a **ROL'OS** badge
  instead of "Rentals United" + the orange RU badge.
- **Cancel and Modify dialogs**: the channel notices drop the vendor name — "This reservation came
  from ROL'OS Channels. It is withdrawn at the channel first; if the channel refuses, nothing
  changes here."
- **Channel readiness scorecard**: "Rentals United sync is blocked" becomes "Channel readiness is
  blocked"; the card title becomes "Channel Manager — sync readiness"; "Live RU verification"
  becomes "Live channel verification".
- **Currency notice**: reworded to speak about the Channel Manager assigning currency by region.
- **Channel logo tile**: the Rentals United entry's label and "RU" initials become ROL'OS-branded.
- **Channels page**: header and empty/error/retry copy checked and neutralised.

### 2. Property editor (both admin and ROL'OS-embedded)

Per your call, these read the same in both places. Visible copy is neutralised across the push
panel, distribution-account panel, location register, content checklist and fields, amenity picker,
image tag picker, notification status chips, payment-methods picker, white-label token fields and
the "Continue — publish" button, including every toast those panels raise (save/push success and
failure messages).

### 3. Help content and TOBI

- The help article **"Rentals United - System Overview"** is retitled and its body reworded to
  Channel Manager language.
- Other help articles are swept for vendor mentions in title and body.
- TOBI's prompt and knowledge text in the assistant edge functions is swept so answers surfaced in
  ROL'OS never name the vendor, and the assistant refers to itself only as TOBI.

### 4. A guard so this doesn't regress

A small lint-style check lists any user-visible vendor string that reappears in the ROL'OS or
property-editor files, so future work can't quietly reintroduce it.

## Where the vendor name stays

The admin integrations & compliance workbench keeps explicit "Rentals United" naming, because that
is the surface used to complete onboarding, connection and certification, and staff there need to
know exactly which external system they are talking to:

- the Rentals United admin page and its tabs (certification console, coverage, error handling, sync
  progress, availability and pricing playgrounds, buildings, currency, notifications, reservations)
- portfolio-level distribution account tabs and the admin billing surcharge labels

If you would rather these also switch to Channel Manager language, say so and I will widen the sweep.

## Technical notes

- Nothing functional changes: no database, edge function, routing or API behaviour is touched.
- Code-level identifiers stay exactly as they are — table and column names, edge function names
  (`push-property-to-ru`, `ru-cert-portal`), error codes (`RU_MODIFY_NOT_ALLOWED`), query keys,
  `booking_channel` values such as `rentals_united`, file names and component names. Only rendered
  strings change, so no migration or redeploy is needed for the UI work.
- Code comments that mention the vendor are left in place — they aid maintenance and are never
  displayed. The one exception is where a comment is the source of a rendered string.
- The vocabulary helper is typed and imported, rather than each file hardcoding its own label.

## Acceptance checks

1. Searching the ROL'OS pages and property editor for rendered "Rentals United" or standalone "RU"
   returns nothing outside comments and code identifiers.
2. A channel booking on the dashboard shows "ROL'OS Channels" with a ROL'OS badge, and cancel/modify
   still route through the channel exactly as before.
3. Readiness, currency and publish flows behave identically — same checks, same push result, only
   the wording differs.
4. The admin integrations & compliance pages still name Rentals United throughout.
5. TOBI and the help drawer answer channel questions without naming the vendor.
