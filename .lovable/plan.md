# First revenue-report runs for the seven outstanding clients

Build a first run for each property that has none yet:
55 on Main, Ashbourne House, Explorers Club, Jembisa Properties, Kunjani Villas,
Mziki Safari Lodge, Schoone Oordt.

## What you need to do first

Set the Drive folder to "Anyone with the link — Viewer" (sharing on the folder
itself, so every file inside inherits it). Once that is done I fetch each file
directly. If a file stays private the run for that property is reported as
blocked rather than guessed at.

## What will be done, per property

1. **Fetch and identify the source files** from the shared folder, grouped by
   property. Where a property has sibling exports in subfolders (as Jembisa does
   with Jembisa / Magari / Palala), all siblings are ingested into the one run.
2. **Set the report month** from the source material — the month of the last
   revenue report on file for that property, not today's date. All artefacts for
   the run use that same anchor date.
3. **Confirm or create the report settings row** (sellable room count, default
   source, report profile) for any property that does not have one. Schoone Oordt
   has no reporting record yet and gets one created; the six NightsBridge clients
   are checked against their existing settings.
4. **Create the run, upload the files, and process them** through the existing
   pipeline (source parser plus previous-report import where a prior workbook or
   printed pack is included).
5. **Reconcile** the generated grid against the golden pack in the source folder
   — revenue, room nights, occupancy and ADR per month — and generate both the
   Excel workbook and the HTML draft.
6. **Report the outcome per property**: the anchor month, window, totals, and
   whether it matched its golden pack, plus anything still blocked with the exact
   file needed.

## Handling the peculiarities

Any client quirk found while reconciling is expressed as configuration, not as a
name check in code:

- Row-level oddities (holds, occupant markers, non-sellable rooms, sibling
  duplicate exports) go in `property_report_settings.nb_profile`.
- Grid-shape oddities (window length and start offset, comparison years, budget
  or target columns, STLY sourcing, prior-workbook-only mode) go in
  `property_report_settings.report_profile`.

Only if a source file exposes a genuinely new shape — a layout no existing parser
capability covers — is parser code extended, and then as a reusable capability
shared by every client.

## Technical notes

- Runs are created as `report_runs` + `report_source_files` rows, parsed by
  `nightsbridge-report-parser` / `report-prior-workbook-import`, then rendered by
  `revenue-report-excel` and `revenue-report-draft`.
- Files are downloaded from the public Drive links and uploaded to the
  `revenue-reports` bucket under `{propertyId}/{runId}/{source|prior}/…`.
- Schoone Oordt's record follows the reporting-only client pattern already in
  place: inactive, off-website, no channel or PMS exposure.
- Reconciliation is verified numerically against the golden documents, not by
  eyeballing the UI.
