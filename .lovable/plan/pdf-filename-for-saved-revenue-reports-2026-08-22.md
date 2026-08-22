# PDF filename for saved revenue reports

Browsers name the saved PDF after the printed document's title. The report HTML currently sets:

`Cathedral Peak · Bi-monthly Revenue Review 20 August 2026`

Change it to the requested filename pattern.

## Target format

`Torburnlea Homestead - Bi-Monthly Revenue Review - 14 Aug 2026 by RoomsOnline - Sleep in Africa`

- Property name (or reporting-client name) first
- Cadence label capitalised as `Monthly` / `Bi-Monthly`
- As-of date in short form `14 Aug 2026`
- Trailing `by RoomsOnline - Sleep in Africa`
- Hyphens only, no `·` or en-dash, and no characters browsers strip or replace in filenames (`/ \ : * ? " < > |`)

The same pattern applies to the CheetaPlains special-report slides, with the report type in place of "Revenue Review".

## Technical notes

- `supabase/functions/_shared/revenueReportHtml.ts`: add a small `pdfDocumentTitle()` helper that builds the string from `propertyName`, `cadenceLabel`, and a short as-of label (`d MMM yyyy`), then use it for `<title>`. Page headers, footers and the cover keep their current wording — only the document title changes.
- `supabase/functions/cheetaplains-special-reports/index.ts`: same helper shape for the slide HTML title.
- Redeploy `revenue-report-draft` and `cheetaplains-special-reports` so existing runs pick up the new title on the next rebuild.
- No schema or frontend changes; printing already goes through the iframe's own document.
