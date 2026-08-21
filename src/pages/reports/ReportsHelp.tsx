import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { usePageSEO } from "@/hooks/usePageSEO";

const STEPS = [
  "Select the property and set the as-of date for the on-the-books snapshot.",
  "Upload the raw bookingsummary export files received from the property system.",
  "Confirm the additional revenue inputs (dinner, room 0, complimentary room nights) and notes.",
  "Process the run, review the consolidated tables, then download the workbook and draft report.",
];

const TROUBLESHOOTING: { question: string; answer: string }[] = [
  {
    question: "Processing says it stopped before the time limit",
    answer:
      "The parser works to a fixed time budget so it never times out mid-file. It records how many files it finished and stops cleanly — press Process again and it continues with the files that are still outstanding. Very large bookingsummary exports are best uploaded as a few smaller files.",
  },
  {
    question: "One file failed but the rest are fine",
    answer:
      "Open Source files, expand the issues under the failing file to read the exact rows or columns that could not be read, then use the circular arrow to re-parse just that file. Nothing else is re-read. Once it parses, press Process to refresh the run totals.",
  },
  {
    question: "Totals look wrong after removing or replacing a file",
    answer:
      "Snapshots are rebuilt from scratch on every run, never merged. After adding or removing a source file, press Process (or Re-process) so the snapshot matches exactly the files currently stored on the run.",
  },
  {
    question: "Occupancy is missing or clearly wrong",
    answer:
      "Occupancy needs the sellable room count in the property's report settings. Use 'Use ROL' to pull the number straight from the property's inventory, or type it in. Capacity days = rooms x days in the month.",
  },
  {
    question: "No year-on-year comparison in the report",
    answer:
      "Last-year actuals come from the historical baseline on the property's report settings page. Paste or upload the monthly figures there; the readiness checklist flags when a baseline is missing.",
  },
  {
    question: "Logo or colours are wrong on the report",
    answer:
      "Branding follows the source chosen on the settings page: the property's own brand, the Rooms Online default, or report-only custom colours. The resolved swatches on that page show exactly what the report will use.",
  },
  {
    question: "Who changed what on a run?",
    answer:
      "Every run carries an Activity trail at the bottom of the review page — uploads, removals, re-parses, processing outcomes, workbook, draft and insight generation are all recorded with a timestamp.",
  },
];

export default function ReportsHelp() {
  usePageSEO({
    title: "Revenue Reports help | Rooms Online",
    description: "Process notes for producing a bi-monthly revenue review.",
    noIndex: true,
  });

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Help &amp; process notes</h1>
        <p className="text-sm text-muted-foreground">
          How a bi-monthly revenue review is produced.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-medium">The run in four steps</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3 text-sm text-muted-foreground">
            {STEPS.map((step, i) => (
              <li key={i} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-foreground">
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-medium">Definitions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p><span className="text-foreground font-medium">OTB</span> — on the books, revenue already reserved for the period.</p>
          <p><span className="text-foreground font-medium">ADR</span> — OTB revenue divided by room nights.</p>
          <p><span className="text-foreground font-medium">Occupancy</span> — room nights divided by capacity days (rooms x days in month).</p>
          <p>All provisional bookings are included in the OTB figures.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-medium">Troubleshooting</CardTitle>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="w-full">
            {TROUBLESHOOTING.map((entry, i) => (
              <AccordionItem key={i} value={`item-${i}`}>
                <AccordionTrigger className="text-sm text-left">
                  {entry.question}
                </AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground">
                  {entry.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
}
