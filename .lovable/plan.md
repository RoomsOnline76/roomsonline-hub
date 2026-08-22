# Fix report "Open" links and the Save-as-PDF filename

Two related problems on the run review page.

## 1. "Open" opens a foreign URL

Today the draft report is fetched from storage and re-wrapped as a `blob:` URL, so
"Open" lands on `blob:https://...` (and the Canva pack / Excel buttons open raw
storage signed URLs). Nothing should show a non-project host.

Fix: add a same-origin viewer route for generated report HTML.

- New route `runs/:runId/draft` under the existing `/reports` route tree, so it
  resolves as `reports.roomsonline.co.za/runs/<id>/draft` on the published
  subdomain and `/reports/runs/<id>/draft` in preview (via `reportsPath`).
- The viewer page loads the stored HTML for that run (same call the preview card
  already uses), renders it in a full-viewport iframe, sets the browser tab title
  to the formatted report name, and offers a Save-as-PDF button.
- "Open" in the draft preview card becomes a link to that route instead of the
  blob URL. Same treatment for the CheetaPlains special slides (a `slide` query
  param selects which stored slide to view).
- Excel and Canva-pack downloads keep using the storage link but switch to a
  hidden anchor with a `download` attribute so the user never navigates to a
  foreign host — the file just saves.

## 2. Save-as-PDF still uses the browser's page title

The generated HTML already carries the correct `<title>`
(`Property - Bi-Monthly Revenue Review - 14 Aug 2026 by RoomsOnline - Sleep in Africa`),
but Chrome names the PDF after the **top-level** document when you print an
iframe — hence "Rooms Online Hub _ Lovable.pdf".

Fix: before calling `print()`, set the parent document's title to the report's
title, then restore it after the print dialog closes.

- When fetching the report HTML, parse its `<title>` and keep it alongside the URL.
- On "Save as PDF": swap `document.title` to that value, print the iframe, restore
  the previous title on the `afterprint` event (with a timeout fallback).
- The dedicated viewer route sets `document.title` to the report title on mount,
  so printing from there is correct with no swapping needed.

## Technical notes

- `src/hooks/useReportDraft.ts` / `src/hooks/useSpecialReports.ts`: return
  `{ url, documentTitle }`; extract the title from the fetched HTML.
- `src/components/reports/DraftReportPreview.tsx`: title-swap print helper,
  "Open" points at the new route.
- `src/components/reports/DownloadBar.tsx` (and the special-reports card): anchor
  `download` instead of `window.open`.
- New `src/pages/reports/ReportsDraftView.tsx`, registered in `src/App.tsx` inside
  the `/reports` route block.
- No backend, schema, or edge-function changes — the HTML title helper is already
  correct.
