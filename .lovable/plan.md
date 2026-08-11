# RU White-Label Certification: per-sheet declaration + verification packs

Turn the RU certification workbook into six review documents RU's IT team can work through on their own, each pairing our declaration with the exact click-path that proves it inside ROL'OS.

## Deliverables

One markdown document per workbook sheet, written to a downloadable folder:

| Sheet | Rows | Document |
| --- | --- | --- |
| WL Admin | 9 | `01-wl-admin.md` |
| General declarations | 13 | `02-general-declarations.md` |
| Content quality | 24 | `03-content-quality.md` |
| Supply API Property management | 49 | `04-supply-api-property-management.md` |
| Supply API Reservation processing | 10 | `05-supply-api-reservations.md` |
| Status | 22 | `06-status-mapping.md` |

Plus `00-README.md`: logins, the two test properties, navigation primer, and how to read a routing statement.

Every row keeps its original workbook wording (validator / API method / API path) and adds:

- **ROL declaration** — one of `Fully supported`, `Supported with note`, `Not applicable`, chosen from what the code and data actually do (no "to be certified" placeholders left blank).
- **Routing to verify** — the numbered click path: login role, URL, tab, panel, control, and the field or badge to read.
- **Evidence** — where the machine-readable proof sits (certification evidence export, diagnostics XML log entry with ResponseID, coverage registry row, or sync-run record).
- **Method statement** — one sentence naming the trigger and cadence (on event / every 24h / on demand) so RU can confirm our declaration matches observed behaviour.

## Verification pass (before anything is written)

Each routing step is confirmed against the code and the database, not assumed:

1. Route exists and is reachable for the stated role.
2. The named tab/panel/control renders that data, and the label in the document matches the label on screen.
3. The evidence source exists and returns real rows for SEESIG and Tidal Pools (cert portal readiness, coverage registry, XML log, sync runs, MCQ report).
4. Cadence claims are checked against the scheduled jobs actually registered, not against intent.

Any row where the surface or the evidence does not hold is declared `Supported with note` (or `Gap`) with the shortfall spelled out — no row is declared fully supported on the strength of the plan alone.

## RU IT team access

- **Owner login** — `michal.tomaszewski@rentalsunited.com` already exists, but it is currently linked to no property, so it would land on an empty portfolio. It gets linked as an owner of both **SEESIG Self Catering CHALETS** and **Tidal Pools Self Catering Apartments**.
- **Admin login** — a new RU admin account is created with the password you supplied and given admin rights so the certification, coverage, diagnostics and cost surfaces open.
- The README states plainly which document sections need the admin login and which are visible to the owner.

## Technical notes

- Sheets are parsed from the uploaded workbook; row text, API paths and the Partner Status column are carried through verbatim so RU can diff against their master form.
- Verification is code + data only (no browser pass), per your choice: route table and component tree for surfacing, SQL reads for evidence and cadence.
- Admin account creation and the owner→property links are data changes applied through the backend; the password is set once and not echoed back into any document.
- Documents are delivered as downloadable markdown files, one per sheet, so they can be pasted straight into the RU form or shared as-is.
