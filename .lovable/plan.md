# Phase 6 — AI Insights on the Revenue Report

Adds a narrative insights panel to the run review screen: a short written revenue commentary, anomaly flags, and suggested wording for the Minimum Stay / Promotions / Rate Override note fields that the reviewer can accept with one click.

## How it behaves

1. On a processed run, the review screen shows an **Insights** panel below the tables.
2. **Generate** (or **Regenerate**) produces:
   - **Narrative** — two short paragraphs: performance vs the previous snapshot and vs last year, ADR and occupancy movement, source-mix shift.
   - **Anomaly flags** — a short list, each with a severity dot and the month and figure it refers to (e.g. "August pickup of R129k is well ahead of the prior three months' pace").
   - **Suggested commentary** — one suggestion per note field, each with **Accept** (writes into that run's note field, so it flows straight into the Excel and the draft report) and **Copy**.
   - **Chart recommendation** — one line naming the chart that best tells this run's story.
3. The latest generation is saved against the run, with a timestamp, so reopening the run shows it without regenerating.
4. Numbers are never invented: every figure quoted comes from the flags computed in code from the run's snapshot.

## Decisions being applied

- **Intelligence provider:** the reserve brain (xAI) answers first for this subdomain, routed through the existing shared AI transport so the one-transport rule holds; the standard brain is only a silent last resort if xAI is unreachable, so the panel degrades to an error message rather than a wrong-vendor answer being hidden.
- **Anomaly detection is deterministic:** the flags themselves are computed in code; the model only writes the prose around them.
- **Accepting a suggestion writes to the run's notes**, which the workbook and draft report already read.

## Technical notes

**Migration** — new `public.report_insights` table, one row per run: `run_id` (PK, FK to `report_runs`, cascade), `narrative` text, `flags` jsonb, `suggestions` jsonb, `chart_recommendation` text, `provider` text, `generated_by` uuid, `generated_at` timestamptz, `created_at`/`updated_at`. GRANT `SELECT, INSERT, UPDATE, DELETE` to `authenticated` and `ALL` to `service_role`, enable RLS, and a single policy using the existing `has_reports_access(auth.uid())` guard — matching how `report_runs` and `report_snapshots` are gated. No `anon` grant.

**`src/lib/reportAnomalies.ts` (new, shared shape)** — pure functions over a snapshot: month-on-month and vs-previous-snapshot pickup outliers, YoY revenue/room-night gaps, ADR swings beyond a threshold, occupancy below/above band, source-mix share shifts, zero-revenue or zero-capacity months, and totals sanity. Returns typed `AnomalyFlag[]` (`id`, `severity`, `month`, `metric`, `value`, `comparison`, `delta`, `deltaPct`, `factText`). Thresholds live in one exported constant block.

**`supabase/functions/reports-xai-insights/index.ts` (new)** — auth via bearer token + `has_reports_access` RPC (same header as `revenue-report-excel` / `revenue-report-draft`), Zod-validated body (`run_id`, optional `action: "generate" | "accept"`). Loads run, snapshot, additional inputs and property report settings with the service-role client, computes the flags with the shared anomaly module, then calls `aiChat` from `_shared/aiModels.ts` with `preferFallback: true` and a new `revenue_report_insights` task added to `AI_MODELS` (chat tier). `response_format: json_object`, temperature 0.5 for prose. The prompt receives the property name, as-of date, per-month figures, computed flags and the current note fields, and is instructed to quote only the supplied figures. Response is parsed and clamped (max flags, max suggestion length), then upserted into `report_insights`. Registered in `supabase/config.toml` with `verify_jwt = true`.

**`src/hooks/useReportInsights.ts` (new)** — react-query read of the saved row plus a `generate` mutation and an `acceptSuggestion` mutation that writes the chosen field into `report_additional_inputs` and invalidates the run queries so `ManualInputsCard` and the draft preview refresh.

**`src/components/reports/AiInsightsPanel.tsx` (new)** — TOBI-branded panel (no vendor names in copy): generate/regenerate button with a spinner, "last generated" timestamp, narrative block with copy-to-clipboard, flag list with severity accents from semantic tokens, suggestion rows with Accept/Copy, and the chart recommendation line. Empty state before first generation; failure state surfaces the transport's message.

**`src/pages/reports/ReportsRunReview.tsx`** — mount the panel between the snapshot tables and the baseline card, gated on a snapshot existing.

**Draft report and workbook** — no generator changes needed: accepted suggestions land in the existing note fields that both outputs already render.

## Out of scope

Auto-generating on run completion, insight history/versioning beyond the latest, and applying insights to the Excel as a separate sheet.
