# Fix Cheetah Plains daily PDF pagination and table orientation

## Outcome
The Cheetah Plains Daily Detailed PDF will no longer contain a blank second page. Every financial comparison table will print on an A4 landscape page, using the wider sheet to increase table text and column spacing. The opening daily summary and the final chart page will remain portrait.

## Implementation
1. **Remove the blank page**
   - Replace the current page-breaking rule with explicit section boundaries that do not create an overflow or an empty trailing sheet.
   - Constrain the portrait summary to one physical A4 page while preserving all existing content.

2. **Make financial table sheets landscape**
   - Mark each financial-year table section as a landscape print page.
   - Use a named A4 landscape print rule so only those table sections rotate; the summary and chart sections stay A4 portrait.
   - Expand each table across the usable landscape width and increase the dense-table type and spacing from the current compressed portrait treatment.

3. **Preserve report content and companion formats**
   - Keep all figures, quarter totals, daily pickup, STLY variance, headings, and colour rules unchanged.
   - Keep the existing Word and Canva content intact; this change targets the PDF page layout.

4. **Rebuild and verify the real report**
   - Rebuild the 21 September Cheetah Plains daily report.
   - Produce the PDF and inspect every rendered page: no blank page, correct mixed orientation, no clipped columns, no wrapped monetary values, and readable tables using the full landscape page.
   - Confirm the page sequence is summary, three financial tables, then charts.

## Technical details
- The generated report currently applies one global `@page { size: A4 }` rule to every section and gives each section a `297mm` minimum height. The report document itself contains five populated sections; therefore the blank sheet is introduced during print pagination rather than by an empty report section.
- Mixed orientation will use named CSS print pages for the financial sections, with section-specific A4 dimensions and page breaks.
