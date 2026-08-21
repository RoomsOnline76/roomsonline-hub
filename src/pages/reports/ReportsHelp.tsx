import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { usePageSEO } from "@/hooks/usePageSEO";

const STEPS = [
  "Select the property and set the as-of date for the on-the-books snapshot.",
  "Upload the raw bookingsummary export files received from the property system.",
  "Confirm the additional revenue inputs (dinner, room 0, complimentary room nights) and notes.",
  "Process the run, review the consolidated tables, then download the workbook and draft report.",
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
    </div>
  );
}
