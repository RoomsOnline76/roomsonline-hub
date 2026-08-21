# RoomsOnline Revenue Reports Platform
## Design Brief — `reports.roomsonline.co.za`

**Document purpose:** Single source of truth for building the Revenue Reports subdomain.  
This brief is intentionally structured so each major section can be turned into a phased Lovable prompt (or a sequence of prompts).  
**Version:** 1.0  
**Date:** 21 August 2026  
**Primary source example:** NightsBridge (Torburnlea Homestead)  
**Future sources:** OPERA, PROTEL (different parsers + PROTEL has a different final report layout)

---

## 1. Vision & Objectives

### Problem
Revenue reviews are currently a fully manual process:
1. Multiple `bookingsummary (xx).xlsx` files arrive from NightsBridge.
2. Someone consolidates them into a multi-sheet Excel (“OTB RR” + Fin Year + Historical).
3. Numbers are transferred into a Canva template to produce the final branded PDF (“BI-MONTHLY REVENUE REVIEW”).
4. This is repeated for every property, each with its own logo, colours, capacity and historical baseline.

### Goal
Create a dedicated, role-gated subdomain **`reports.roomsonline.co.za`** that:
- Lets authorised users upload the raw NightsBridge bookingsummary files.
- Automatically produces the **consolidated Excel** (identical structure and formulas to the current OTB RR workbook).
- Produces a **high-fidelity visual draft report** that is as close as possible to the final Canva PDF (so the remaining Canva work is light polishing only).
- Makes both the consolidated Excel and the draft report (plus supporting assets) downloadable.
- Supports multiple properties, each with its own identity (logo, colours, room count, historical baselines, cover artwork).
- Is designed from day one with an **adapter pattern** so OPERA and PROTEL can be added later without rewriting the UI or the core aggregation engine.

### Non-goals (v1)
- Full replacement of Canva (we aim for “90% ready”, not 100% final).
- Live channel-manager API pulls (we start with file upload of the exact files currently received).
- Public or owner-facing access (admin / dev / fearless_leader only).

---

## 2. Architectural Alignment with Existing ROL Platform

Follow the established **adapter pattern**:

```
Isolation layers
├── Edge Functions          → source-specific parsers (nightsbridge-report-parser, later opera-report-parser, protel-report-parser)
├── Unified Report Model    → common tables (report_runs, report_snapshots, report_source_files, report_additional_inputs)
└── Source-Agnostic UI      → calendar of runs, upload wizard, review canvas, download centre
```

- Hostname detection already exists in `App.tsx` (book., connect., survey., widget.). Add `reports.` branch that mounts a dedicated `ReportsLayout` + route tree.
- Auth is shared Supabase Auth. Role guards reuse existing `has_role()` / `requireAdmin` / `requireDev` patterns. Add explicit `fearless_leader` support.
- Storage for uploaded XLSX and generated artefacts uses Supabase Storage (bucket `revenue-reports`).
- No new payment, booking, or PMS-availability logic. This is a pure reporting + document-generation domain.

**AI constraint:** Any intelligence (narrative insights, anomaly flags, suggested commentary, chart recommendations) must be powered exclusively by the **xAI API** (or embedded Grok Build if available in the Lovable environment). Do not introduce OpenAI, Anthropic, or Lovable AI proxies for this subdomain.

---

## 3. User Access & Roles

| Role              | Can access reports subdomain | Can create / process runs | Can download | Can manage property report settings |
|-------------------|------------------------------|---------------------------|--------------|-------------------------------------|
| fearless_leader   | Yes                          | Yes                       | Yes          | Yes                                 |
| dev               | Yes                          | Yes                       | Yes          | Yes                                 |
| admin             | Yes                          | Yes                       | Yes          | Yes                                 |
| owner / staff     | No                           | No                        | No           | No                                  |

Login uses the existing Supabase Auth email/password flow. After login, if the hostname is `reports.roomsonline.co.za`, the user is redirected into the Reports app shell (never into the main admin or booking UI).

---

## 4. Core User Journeys

### 4.1 Create a new revenue report run
1. Select property (searchable list with logo + name).
2. Set **As-of date** (the date the OTB snapshot is taken, e.g. 14 Aug 2026).
3. Optionally load the previous snapshot automatically (last successful run for that property).
4. Upload one or more NightsBridge `bookingsummary (xx).xlsx` files (drag-and-drop + multi-file).
5. Enter / confirm **Additional Revenue** inputs (Dinner, Room 0 revenue, Comp RNs) and free-text notes (Minimum Stay, Promotions, Rate Overrides).
6. Click **Process**. Backend:
   - Parses every uploaded file.
   - Aggregates OTB revenue, room nights, ADR, occupancy by calendar month.
   - Computes variance vs previous snapshot and vs Last Year Actual.
   - Builds source mix (Booking.com / Own Booking / Expedia / etc.).
   - Writes a new `report_run` + snapshot.
7. Land on the **Review** screen.

### 4.2 Review & refine
- Side-by-side tables that mirror the three sheets of the current Excel (OTB RR, Room Nights / Occupancy, ADR).
- Source-performance cards (NightsBridge hits, Booking.com, Expedia).
- Editable additional-revenue cells and commentary fields.
- AI-generated narrative panel (xAI) with “Regenerate” and “Copy to clipboard”.
- Live preview of the draft visual report (or thumbnail of each page).

### 4.3 Download
- Consolidated Excel (`.xlsx`) – exact column layout, formulas and sheet names as the current manual workbook.
- Draft PDF report (high visual fidelity).
- Canva asset pack (optional zip): individual chart PNGs + structured JSON/CSV of every table so the designer can drop them into the existing Canva template quickly.
- Source files (original uploads) for audit.

### 4.4 Historical continuity
Every successful run stores a snapshot. The next run for the same property automatically uses the previous run as the “OTB @ previous date” baseline. Last-year actuals are stored per property / month and can be bulk-imported once.

---

## 5. Data Model (new tables)

All tables live under a `reports_` prefix (or a dedicated schema if preferred). RLS: only admin / dev / fearless_leader.

```sql
-- Core run
report_runs (
  id uuid PK,
  property_id uuid FK → properties,
  source_type text,                -- 'nightsbridge' | 'opera' | 'protel'
  as_of_date date not null,        -- the OTB snapshot date
  previous_run_id uuid FK nullable,
  status text,                     -- draft | processing | ready | failed
  title text,                      -- e.g. "Bi-Monthly Revenue Review – 31 Jul 2026"
  created_by uuid,
  created_at, updated_at
)

-- Raw uploaded files
report_source_files (
  id uuid PK,
  run_id uuid FK,
  storage_path text,
  original_filename text,
  file_hash text,
  parsed_ok boolean,
  parse_errors jsonb,
  row_count int
)

-- Manual / AI-assisted extra inputs
report_additional_inputs (
  run_id uuid PK,
  dinner_by_month jsonb,           -- { "2026-07": 66655, ... }
  room0_by_month jsonb,
  comp_rns_by_month jsonb,
  min_stay_notes text,
  promotions_notes text,
  rate_override_notes text,
  free_commentary text
)

-- Computed snapshot (the heart of the consolidated Excel)
report_snapshots (
  run_id uuid PK,
  months jsonb,                    -- ordered array of month keys
  otb_revenue jsonb,               -- { "2026-07": 362937.43, ... }
  previous_otb_revenue jsonb,
  last_year_actual jsonb,
  room_nights jsonb,
  previous_room_nights jsonb,
  last_year_room_nights jsonb,
  capacity_days jsonb,             -- { "2026-07": 217, ... } = rooms × days_in_month
  additional_revenue jsonb,
  source_breakdown jsonb,          -- { "Booking.com": { revenue, nights }, ... }
  adr jsonb,
  occupancy jsonb,
  totals jsonb
)

-- Property-level report configuration
property_report_settings (
  property_id uuid PK,
  room_count int not null,         -- e.g. 7 for Torburnlea
  report_logo_url text,
  cover_artwork_url text,          -- the line-drawing / photo used on cover
  brand_primary text,
  brand_secondary text,
  historical_baseline jsonb,       -- last-year actuals and multi-year history
  default_source_type text default 'nightsbridge'
)
```

Historical multi-year data (the “Historical” sheet) can live either in `property_report_settings.historical_baseline` or a separate `report_historical_years` table if volume grows.

---

## 6. NightsBridge Processing Pipeline (v1)

### 6.1 Parser contract (`nightsbridge-report-parser` edge function)

Input: array of storage paths of uploaded XLSX files.  
Output: normalised booking ledger + validation report.

Expected columns (from real samples):
```
Booking ID | Arrival Date | Last Night | Made By | Company | Guest Name |
Adults | Children | Avg Rate | Nights | Revenue | Commission | Nett | Extras |
Room Name | Account ID | Invoice No. | Proforma No. | Type | NBID | Source |
Booking Date | Status | Paid to Date | Applied Rate | Currency | Exchange Rate
```

Rules:
- Only rows with a valid numeric Revenue and Nights are counted.
- “Room 0” and “Holding in Credit” / “Events 1” are flagged separately (do not inflate sellable room nights unless configured).
- Statuses such as “Unavailable”, “Waiting for Deposit”, “Outstanding Account”, “Confirmed”, “Paid” are all kept; provisional bookings are included (as noted on the current Excel).
- Source values are normalised: “Booking.com”, “Expedia///Hotels.com///Travelo” → “Expedia”, “Lori Carter | Roomsonline” / “Own Booking” / “Own web site” → “Own”, “LekkeSlaap”, etc.

### 6.2 Aggregator

For each calendar month that appears in the as-of window (typically current month + next 5–6 months):

```
OTB Revenue     = SUM(Revenue) where Arrival falls in month (or stay overlaps – decide rule; current practice appears to be arrival-month allocation)
Room Nights     = SUM(Nights)
ADR             = OTB Revenue / Room Nights
Occupancy       = Room Nights / (property.room_count × days_in_month)
Variance        = current OTB – previous snapshot OTB
OTB vs LY       = current OTB – last_year_actual
Additional Rev  = Dinner + Room 0 (user-supplied)
Total Combined  = OTB Revenue + Additional Revenue
```

Capacity days must be calculated correctly (31 × 7 = 217, 30 × 7 = 210, etc.).

### 6.3 Excel generation

Use a Deno-compatible Excel library (exceljs or equivalent) to emit a workbook with three sheets:

1. **OTB RR** – exact column order and formula layout of the sample:
   - Header row with property name + as-of date
   - Revenue block (OTB current, previous, variance, LY, Dinner, Room 0, Comp RNs, Additional, Total Combined)
   - Room Nights + Occupancy block
   - ADR block
   - Notes footer (“OTB – On The Books”, “All provisional bookings are included…”)

2. **Fin Year** – placeholder structure ready for later population.

3. **Historical** – multi-year revenue / room nights / occupancy / ADR pulled from `property_report_settings.historical_baseline`.

Formulas must be real Excel formulas (not hard-coded values) so the downloaded file remains editable.

---

## 7. Visual Draft Report (Canva-compatible)

### Target visual language (from the supplied PDF)
- Clean white / light-grey pages with strong ROL wreath logo top-left and “roomsonline | Property Name” header.
- Large section titles: “Revenue Performance”, “Revenue Review”, “Nightsbridge Performance | Hits”, “Booking.com Performance”, “Expedia Performance”, “Traveller Trends”.
- Property line-drawing or photo on the cover page.
- Tables and simple bar / line charts for OTB vs LY, pickup variance, source mix, ADR trend.
- Footer with contact details and www.roomsonline.co.za.

### Generation approach (v1)
1. Server-side HTML → PDF (or React-PDF / Puppeteer-style in Deno) that reproduces the page structure and typography as closely as practical.
2. Charts rendered as static images (Recharts or Chart.js on the server, or client-side then uploaded) and embedded.
3. Optional “Canva pack” zip containing:
   - Each chart as transparent PNG
   - Each major table as CSV
   - A JSON manifest of all numbers so a designer can rebuild in Canva in minutes.

The goal is **not** pixel-perfect Canva replacement; the goal is that the remaining Canva work is limited to minor layout tweaks and brand polish.

---

## 8. UI Structure (Reports subdomain)

```
ReportsLayout
├── Top bar: ROL logo, property switcher, user menu
├── Left nav (or top tabs)
│   ├── Dashboard (list of recent runs)
│   ├── New Report
│   ├── Property Settings (logo, capacity, historical baseline, brand colours)
│   └── Help / Process notes
└── Routes
    /                          → Dashboard
    /new                       → Multi-step wizard (Property → Files → Additional → Process)
    /runs/:runId               → Review canvas (tables + AI panel + live draft preview)
    /runs/:runId/download      → Download centre
    /settings/:propertyId      → Property report configuration
```

### Key UI components
- `ReportPropertyCard` – logo, name, last run date, status pill
- `FileDropZone` – multi-file, shows parse status per file
- `OtbMetricsTable` – editable, mirrors Excel
- `SourceMixCards` – Booking.com / Own / Expedia / Other
- `AiInsightsPanel` – xAI narrative + regenerate
- `DraftReportPreview` – page thumbnails or embedded PDF viewer
- `DownloadBar` – Excel / PDF / Canva pack buttons

Visual language should feel consistent with the existing Connect portal (clean, professional, high whitespace) but with a slightly more “analytics / board-report” aesthetic.

---

## 9. AI Integration (xAI only)

Use cases:
1. **Narrative generation** for the “Revenue Review” and “Performance” sections.
   Prompt context: property name, as-of date, key variances, ADR movement, source mix shifts, occupancy vs LY.
2. **Anomaly flags** – e.g. “August pickup of R129 k is unusually high relative to the last three years”.
3. **Suggested commentary** for Minimum Stay / Promotions / Rate Overrides (user can accept or edit).
4. **Chart recommendation** – which visual best tells the story for this run.

All calls go through a dedicated edge function `reports-xai-insights` that holds the xAI API key and never exposes it to the client.

---

## 10. Multi-Property Branding

Every property can override:
- Logo (used in header and cover)
- Cover artwork (the line drawing / hero image)
- Primary / secondary brand colours (used for table accents and chart series)
- Room count (drives occupancy denominator)
- Historical baseline (Last Year Actual + multi-year series)

These live in `property_report_settings` and are applied both to the Excel header and to the draft PDF.

---

## 11. Extensibility for OPERA & PROTEL

Design the parser layer as adapters:

```
src/lib/report-adapters/
  nightsbridge.ts   ← v1
  opera.ts          ← future
  protel.ts         ← future (also supplies a different final-report layout)
```

Each adapter implements:
```ts
interface ReportSourceAdapter {
  parse(files: StorageFile[]): Promise<NormalisedLedger>
  getExpectedColumns(): string[]
  getDefaultAdditionalFields(): AdditionalFieldConfig
}
```

The aggregation engine, snapshot model, Excel generator and most of the UI remain unchanged. Only the final visual template for PROTEL will diverge (different page order / metrics emphasis).

---

## 12. Phased Delivery Plan (for Lovable prompts)

Use this brief as the master. Each phase below is designed to become one (or a short sequence of) Lovable prompt(s).

### Phase 0 – Foundations
- Hostname detection for `reports.roomsonline.co.za`
- `ReportsLayout` + auth guards (admin / dev / fearless_leader)
- Empty dashboard shell
- Property list (read from existing `properties` table)

### Phase 1 – Upload & Storage
- Multi-file upload to Supabase Storage
- `report_runs` + `report_source_files` tables + RLS
- Basic run list with status

### Phase 2 – NightsBridge Parser + Aggregator
- Edge function that parses the exact column set of the supplied bookingsummary files
- Aggregation into OTB revenue / room nights / ADR / occupancy
- Write `report_snapshots`
- Property capacity + capacity-days calculation

### Phase 3 – Consolidated Excel Generation
- Exceljs (or equivalent) generation of the three-sheet workbook
- Real Excel formulas for variance, totals, ADR, occupancy
- Download of the `.xlsx`

### Phase 4 – Previous Snapshot + Last-Year + Additional Inputs
- Automatic loading of previous run as baseline
- Manual entry UI for Dinner / Room 0 / Comp RNs / notes
- Historical baseline import / edit in property settings

### Phase 5 – Draft Visual Report
- HTML/PDF template that mirrors the supplied Canva PDF structure
- Charts (OTB vs LY, pickup, source mix, ADR)
- Property branding (logo, colours, cover art)
- Download of PDF + optional Canva asset pack

### Phase 6 – AI Insights (xAI)
- `reports-xai-insights` edge function
- Narrative panel on the Review screen
- Anomaly flags and suggested commentary

### Phase 7 – Polish & Multi-Property Hardening
- Property report settings UI
- Error handling, re-processing, audit trail
- Performance with large bookingsummary files
- Documentation / in-app help

### Phase 8 – Adapter stubs for OPERA / PROTEL
- Interface + empty adapters
- UI source-type selector
- Documentation of the extension points

---

## 13. Acceptance Criteria (NightsBridge v1)

A run is considered successful when:
1. All uploaded bookingsummary files parse without critical errors.
2. The generated Excel matches the structure, column order and formula style of the supplied `31.07.26_Torburnlea Homestead-Revenue Report.xlsx`.
3. Revenue, Room Nights, ADR and Occupancy numbers for the sample files can be reconciled to the sample Excel within normal floating-point tolerance.
4. Variance vs previous snapshot and vs Last Year are correctly calculated.
5. The draft PDF contains the same major sections as the supplied Canva PDF and is branded with the property’s logo / colours.
6. Both the Excel and the PDF (plus Canva pack) are downloadable by an authorised user.
7. A second run for the same property correctly uses the first run as the “previous” baseline.
8. Only admin / dev / fearless_leader can reach any route on the subdomain.

---

## 14. Open Questions / Assumptions

| Item | Assumption / Question |
|------|-----------------------|
| Stay allocation | Revenue & nights are attributed to the **arrival month** (matches current practice in the sample). Confirm if stay-overlap allocation is ever required. |
| Room 0 / Events | Excluded from sellable room-night denominator unless explicitly configured. |
| Provisional bookings | Included in all OTB figures (as noted on the current Excel). |
| Fin Year sheet | Generated as a skeleton; full population can be a later enhancement. |
| Canva fidelity | “Closest possible” means matching page structure, typography hierarchy, colour usage and chart types — not pixel-identical Canva output. |
| Historical data | Initial load will be a one-time import (CSV or manual) into `property_report_settings`. Subsequent years are captured automatically from successful runs. |
| File size | Expect typical bookingsummary files < 1 MB; support up to ~10 files per run. |
| Time zone | All dates treated as South Africa (Africa/Johannesburg). |

---

## 15. Reference Assets (already supplied)

- `bookingsummary (15).xlsx` … `(22).xlsx` – raw NightsBridge exports (Aug–Nov 2026 window)
- `31.07.26_Torburnlea Homestead-Revenue Report.xlsx` – the target consolidated workbook
- `31 Jul 26 _ Revenue Report _ Torburnlea Homestead.pdf` – the target visual report (Canva origin)

These files must be treated as the golden reference for both the aggregation logic and the visual output of Phase 5.

---

## 16. How to Use This Brief with Lovable

1. Start every phase prompt with:  
   “Using the RoomsOnline Revenue Reports Design Brief (v1.0) as the single source of truth…”
2. Paste only the relevant Phase section + any cross-cutting constraints (auth, adapter pattern, xAI-only, hostname detection).
3. After each phase, run the acceptance criteria that belong to that phase before moving on.
4. Keep the full brief in the project so later phases can reference earlier decisions without re-stating them.

---

*End of Design Brief*  
*This document is the authoritative specification for `reports.roomsonline.co.za` (NightsBridge first, OPERA/PROTEL extensible).*
