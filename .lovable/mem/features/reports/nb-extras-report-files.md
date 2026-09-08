---
name: NightsBridge Extras Report files
description: TBL Dinner-style extras/F&B charge lists are recognised and totalled separately; they never become rooms revenue
type: feature
---

- Properties that sell dinners and sundries hand in the NightsBridge **Extras
  Report** ("Extras Report for 01/08/2026 to 31/08/2026", columns
  `Date, Booking ID, Room Unit, Description, Quantity, Price, Total`) alongside the
  bookings export. `supabase/functions/_shared/nbExtrasReport.ts` recognises it and
  `nightsbridge-report-parser` marks it **parsed** with a note of its totals — it
  used to land as `needs_mapping` with zero rows every month.
- Extras totals never enter the booking ledger: rooms revenue, ADR and occupancy
  stay the bookings export's business, and `additional_revenue` keeps coming from
  the ledger's own Extras column. Extras figures are returned as
  `extras_reports[]` for the reviewer only.
- Category semantics differ per client: the filed Torburnlea "dinner" figure is
  Meals + Dinner + Harvest Box, not the extras grand total (which includes drinks,
  additional beds and gratuities). Never fold the grand total into a report.
- Torburnlea 31 Aug 2026 verification: revenue matches the filed pack to the cent
  (Aug 297,963.85; Sep 70,311.89). Filed room nights are derived from the pack's own
  rounded ADR, so ledger-counted nights can differ by 1–2 (Aug 105 vs filed 103).
