# Add STLY variance and daily BOB pickup to the Cheetah Plains report

## Outcome
The final Cheetah Plains Daily Detailed PDF will follow the supplied examples and make two comparisons visible for every month, quarter, and financial-year total:

- **BOB variance to STLY** = current-day BOB minus STLY BOB.
- **BOB pickup from the previous report day** = current-day BOB minus the latest earlier daily report’s BOB.

Positive values will use the report’s positive colour, negative values its warning colour, and zero will remain neutral. Missing source values will print as a dash rather than zero.

## Implementation
1. **Retain each day’s full monthly BOB snapshot**
   - Save the current run’s per-month BOB revenue and occupancy with that day’s stored report figures.
   - Resolve “previous day” from the latest earlier successful Cheetah Plains daily report, not merely the previous calendar date.
   - Keep old reports compatible: when an older run has no monthly snapshot, previous-day columns print dashes.

2. **Extend the financial-year comparison rows**
   - Add previous-day BOB and previous-day occupancy to each month row.
   - Calculate current-vs-previous pickup and current-vs-STLY variance from source figures only.
   - Calculate quarter and total money figures by summing their months; retain the established occupancy averaging method.

3. **Match the example table structure**
   - Show current BOB, current occupancy, previous-day BOB, previous-day occupancy, and current-vs-previous variance together.
   - Show STLY BOB, STLY occupancy, last-year BOB, last-year occupancy, and BOB variance to STLY together.
   - Keep the table readable on A4 by using grouped headings and the existing dense financial-form styling.

4. **Keep report downloads consistent**
   - Build the PDF from the enhanced report page.
   - Because Word is generated from that same page, its table will match automatically.
   - Update the Canva table CSV so its columns and calculations match the final report.

5. **Verify against real daily data**
   - Add focused tests for positive, negative, zero, and missing variances, plus quarter and total calculations.
   - Rebuild the 21 September report and compare it with the latest valid earlier daily snapshot.
   - Confirm the PDF visually: no clipped columns, correct coloured variance values, correct quarter totals, and dashes where no previous snapshot exists.

## Technical details
- Current BOB/STLY/LY values are stored in `report_comparison_months`; daily report records currently retain only the selected month’s summary, so a full per-month daily snapshot must be added before later reports overwrite the current comparison values.
- No spreadsheet generation or downloadable workbook will be reintroduced.
