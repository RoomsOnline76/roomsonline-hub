import { useState } from "react";
import { Link } from "react-router-dom";
import { Building2, FilePlus2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { usePageSEO } from "@/hooks/usePageSEO";
import { useReportProperties } from "@/hooks/useReportProperties";
import { useReportRuns } from "@/hooks/useReportRuns";
import { RunStatusPill } from "@/components/reports/RunStatusPill";

const formatRunDate = (iso: string): string =>
  new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

export default function ReportsDashboard() {
  const [search, setSearch] = useState("");
  const { properties, total, isLoading, error } = useReportProperties(search);
  const { runs, isLoading: runsLoading } = useReportRuns();


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
        <Button asChild>
          <Link to="/new">
            <FilePlus2 className="h-4 w-4 mr-2" />
            New report
          </Link>
        </Button>
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
              to={`/runs/${run.id}`}
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
                  {run.fileCount === 1 ? "" : "s"}
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
            Properties{" "}
            <span className="text-sm font-normal text-muted-foreground">({total})</span>
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
        ) : properties.length === 0 ? (
          <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
            No properties match “{search}”.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {properties.map((property) => (
              <Link
                key={property.id}
                to={`/settings/${property.id}`}
                className="group rounded-lg border p-4 transition-colors hover:bg-muted/50"
              >
                <div className="flex items-start gap-3">
                  {property.logoUrl ? (
                    <img
                      src={property.logoUrl}
                      alt={`${property.name} logo`}
                      loading="lazy"
                      className="h-10 w-10 rounded-md object-contain bg-muted"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center">
                      <Building2 className="h-5 w-5 text-muted-foreground" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="truncate text-sm font-medium group-hover:text-primary">
                      {property.name}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {property.city ?? "Location not set"}
                      {property.roomCount ? ` · ${property.roomCount} rooms` : ""}
                    </p>
                    <Badge variant="secondary" className="text-[11px] font-normal">
                      Last run: —
                    </Badge>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
