import { useMemo } from "react";
import { CalendarClock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { BookingTrends } from "@/hooks/useReportSnapshot";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

const LEAD_LABELS: Array<[string, string]> = [
  ["d0_7", "0–7 days"],
  ["d8_30", "8–30 days"],
  ["d31_90", "31–90 days"],
  ["d91_plus", "91+ days"],
];

interface Props {
  trends: BookingTrends;
  months: string[];
}

const monthLabel = (key: string): string => {
  const [year, month] = key.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return Number.isNaN(date.getTime())
    ? key
    : date.toLocaleDateString("en-ZA", { month: "short", year: "2-digit" });
};

/** Booking behaviour for the run: stay length, booking weekdays and lead time. */
export function BookingTrendsCard({ trends, months }: Props) {
  const arrivalTotal = useMemo(
    () => trends.arrivalWeekdays.reduce((sum, value) => sum + value, 0),
    [trends.arrivalWeekdays],
  );
  const bookedTotal = useMemo(
    () => trends.bookedWeekdays.reduce((sum, value) => sum + value, 0),
    [trends.bookedWeekdays],
  );
  const leadTotal = useMemo(
    () => LEAD_LABELS.reduce((sum, [key]) => sum + (trends.leadTimeBuckets[key] ?? 0), 0),
    [trends.leadTimeBuckets],
  );

  const share = (value: number, total: number): string =>
    total > 0 ? `${Math.round((value / total) * 100)}%` : "—";

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-medium flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-primary" />
          Booking trends
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {trends.bookings.toLocaleString("en-ZA")} bookings arriving in this window · average stay{" "}
          {trends.alos.toFixed(1)} nights
          {trends.hasBookedDates
            ? ` · average lead time ${trends.leadTimeAvg ?? 0} days (median ${
                trends.leadTimeMedian ?? 0
              })`
            : ""}
        </p>
      </CardHeader>
      <CardContent className="space-y-5 text-sm">
        {months.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="text-left font-medium py-1 pr-3">Average stay</th>
                  {months.map((key) => (
                    <th key={key} className="text-right font-medium py-1 px-2">
                      {monthLabel(key)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-border">
                  <td className="py-1 pr-3">Nights per booking</td>
                  {months.map((key) => (
                    <td key={key} className="text-right py-1 px-2 tabular-nums">
                      {(trends.alosByMonth[key] ?? 0).toFixed(1)}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
              Arrivals by weekday
            </p>
            <ul className="space-y-1">
              {WEEKDAYS.map((day, index) => (
                <li key={day} className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">{day}</span>
                  <span className="tabular-nums">
                    {trends.arrivalWeekdays[index]}{" "}
                    <span className="text-muted-foreground">
                      ({share(trends.arrivalWeekdays[index], arrivalTotal)})
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
              Bookings taken by weekday
            </p>
            {trends.hasBookedDates && bookedTotal > 0 ? (
              <ul className="space-y-1">
                {WEEKDAYS.map((day, index) => (
                  <li key={day} className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">{day}</span>
                    <span className="tabular-nums">
                      {trends.bookedWeekdays[index]}{" "}
                      <span className="text-muted-foreground">
                        ({share(trends.bookedWeekdays[index], bookedTotal)})
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground text-xs">
                The upload carried no “date booked” column, so the weekday bookings arrive on and
                how far ahead they are made cannot be shown. Add that column to the export and
                re-process the run.
              </p>
            )}
          </div>
        </div>

        {trends.hasBookedDates && leadTotal > 0 && (
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
              How far ahead bookings are made
            </p>
            <div className="flex flex-wrap gap-2">
              {LEAD_LABELS.map(([key, label]) => (
                <Badge key={key} variant="outline" className="font-normal">
                  {label}: {trends.leadTimeBuckets[key] ?? 0} (
                  {share(trends.leadTimeBuckets[key] ?? 0, leadTotal)})
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
