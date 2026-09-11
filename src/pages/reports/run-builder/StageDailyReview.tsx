import { Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DailyFigures } from "@/hooks/useDailyDetailedReport";
import type { RunBuilderContext } from "./types";

const rand = (value: number | null | undefined): string =>
  value === null || value === undefined || !Number.isFinite(value)
    ? "—"
    : `R${Math.round(value).toLocaleString("en-ZA")}`;

const pct = (value: number | null | undefined): string =>
  value === null || value === undefined || !Number.isFinite(value)
    ? "—"
    : `${(value * 100).toFixed(1)}%`;

const num = (value: number | null | undefined): string =>
  value === null || value === undefined || !Number.isFinite(value) ? "—" : String(value);

const Stat = ({ label, value, hint }: { label: string; value: string; hint?: string }) => (
  <div className="rounded-md border px-3 py-2.5">
    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
    <p className="text-lg font-semibold">{value}</p>
    {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
  </div>
);

/** Daily stage B — read the day back before it joins the running workbook. */
export function StageDailyReview({ ctx }: { ctx: RunBuilderContext }) {
  const figures: DailyFigures | null = ctx.dailyFigures;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-5">
          <div className="space-y-1">
            <p className="text-sm font-medium">Read the day's files</p>
            <p className="text-sm text-muted-foreground">
              {figures
                ? `Figures read for ${figures.date}. Run it again after changing a file.`
                : "Read the uploaded files into the day's figures."}
            </p>
          </div>
          <Button onClick={ctx.onDailyBuild} disabled={ctx.isDailyBusy || ctx.run.files.length === 0}>
            {ctx.isDailyBusy ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Play className="mr-2 h-4 w-4" />
            )}
            {figures ? "Read again" : "Read the day"}
          </Button>
        </CardContent>
      </Card>

      {figures && (
        <>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-medium">The day</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-3">
              <Stat
                label="Villas occupied"
                value={num(figures.villasOccupied)}
                hint={figures.villaCount ? `of ${figures.villaCount}` : undefined}
              />
              <Stat label="Occupancy" value={pct(figures.occupancy)} />
              <Stat label="Accommodation" value={rand(figures.accommodation)} />
              <Stat label="ADR" value={rand(figures.adr)} />
              <Stat label="Arrivals" value={num(figures.arrivals)} />
              <Stat label="Departures" value={num(figures.departures)} />
              <Stat label="Food &amp; beverage" value={rand(figures.foodAndBeverage)} />
              <Stat label="Extras" value={rand(figures.extras)} />
              <Stat label="Total for the day" value={rand(figures.total)} />
            </CardContent>
          </Card>


          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-medium">Month &amp; movement</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-3">
              <Stat label="Month to date" value={rand(figures.monthToDate.revenue)} hint={`${num(figures.monthToDate.nights)} villa nights`} />
              <Stat label="Month on the books" value={rand(figures.monthOnBooks.revenue)} hint={pct(figures.monthOnBooks.occupancy)} />
              <Stat label="Active enquiries" value={rand(figures.enquiries?.revenue ?? null)} hint={`${num(figures.enquiries?.nights ?? null)} nights`} />
              <Stat label="Bookings created" value={num(figures.created?.count ?? null)} hint={rand(figures.created?.value ?? null)} />
              <Stat label="Bookings cancelled" value={num(figures.cancelled?.count ?? null)} hint={`${num(figures.cancelled?.nights ?? null)} nights`} />
              <Stat label="Month-to-date ADR" value={rand(figures.monthToDate.adr)} />
            </CardContent>
          </Card>
        </>
      )}

      {!figures && (
        <p className="text-sm text-muted-foreground">
          Nothing read yet. A figure with no source in the day's files prints as a dash.
        </p>
      )}
    </div>
  );
}
