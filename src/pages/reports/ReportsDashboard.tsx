import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Building2, FilePlus2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { usePageSEO } from "@/hooks/usePageSEO";
import { useReportProperties } from "@/hooks/useReportProperties";
import { useReportRuns } from "@/hooks/useReportRuns";
import { RunStatusPill } from "@/components/reports/RunStatusPill";
import { NewReportsClientDialog } from "@/components/reports/NewReportsClientDialog";
import { ReportPropertyCard } from "@/components/reports/ReportPropertyCard";
import { reportsPath } from "@/lib/config";
import { sourceLabel } from "@/lib/report-adapters";


const formatRunDate = (iso: string): string =>
  new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

export default function ReportsDashboard() {
  const [search, setSearch] = useState("");
  const { properties, isLoading, error } = useReportProperties(search);
  const { runs, isLoading: runsLoading } = useReportRuns();

  // Dashboard lists only properties that already have at least one run;
  // everything else lives on the reporting settings page.
  const withRuns = useMemo(() => properties.filter((p) => p.lastRunDate), [properties]);
  const reportsClientCount = withRuns.filter((p) => p.isReportsClient).length;




  usePageSEO({
    title: "Revenue Reports | Rooms Online",
    description:
      "Internal Rooms Online workspace for building consolidated revenue reviews per property.",
    noIndex: true,
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Revenue Reports</h1>
          <p className="text-sm text-muted-foreground">
            Consolidated bi-monthly revenue reviews per property.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <NewReportsClientDialog />
          <Button asChild>
            <Link to={reportsPath("/new")}>
              <FilePlus2 className="h-4 w-4 mr-2" />
              New report
            </Link>
          </Button>
        </div>

      </div>

      {/* ─── Recent runs ─────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium">Recent runs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {runsLoading && [1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full rounded-md" />)}

          {!runsLoading && runs.length === 0 && (
            <div className="rounded-lg border border-dashed py-12 text-center space-y-2">
              <p className="text-sm font-medium">No report runs yet</p>
              <p className="text-sm text-muted-foreground">
                Create a run to upload NightsBridge bookingsummary files.
              </p>
            </div>
          )}

          {runs.map((run) => (
            <Link
              key={run.id}
              to={reportsPath(`/runs/${run.id}`)}
              className="flex items-center gap-3 rounded-md border px-3 py-2.5 hover:bg-muted/40 transition-colors"
            >
              {run.propertyLogoUrl ? (
                <img
                  src={run.propertyLogoUrl}
                  alt={`${run.propertyName ?? "Property"} logo`}
                  loading="lazy"
                  className="h-9 w-9 rounded object-contain bg-muted"
                />
              ) : (
                <span className="h-9 w-9 rounded bg-muted flex items-center justify-center">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                </span>
              )}
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium truncate">
                  {run.propertyName ?? "Unknown property"}
                </span>
                <span className="block text-xs text-muted-foreground truncate">
                  As-of {formatRunDate(run.asOfDate)} · {run.fileCount} file
                  {run.fileCount === 1 ? "" : "s"} · {sourceLabel(run.sourceType)}
                  {run.specialReportSet ? " · + extras" : ""}
                </span>
              </span>
              <RunStatusPill status={run.status} />
            </Link>
          ))}
        </CardContent>
      </Card>


      {/* ─── Properties ─────────────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-medium tracking-tight">
            Properties with reports{" "}
            <span className="text-sm font-normal text-muted-foreground">
              ({withRuns.length}
              {reportsClientCount > 0 ? ` · ${reportsClientCount} reporting-only` : ""})
            </span>
          </h2>

          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search properties"
              className="pl-9"
              aria-label="Search properties"
            />
          </div>
        </div>

        {error && (
          <p className="text-sm text-destructive">
            Could not load properties: {error.message}
          </p>
        )}

        {isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-24 w-full rounded-lg" />
            ))}
          </div>
        ) : withRuns.length === 0 ? (
          <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground space-y-1">
            <p>{search ? `No property with reports matches “${search}”.` : "No property has reports yet."}</p>
            <p>
              Configure a property under{" "}
              <Link to={reportsPath("/settings")} className="underline">
                reporting settings
              </Link>
              .
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {withRuns.map((property) => (
              <ReportPropertyCard key={property.id} property={property} />
            ))}
          </div>
        )}
      </section>

    </div>
  );
}
