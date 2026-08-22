import { useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { usePageSEO } from "@/hooks/usePageSEO";
import { useReportProperties } from "@/hooks/useReportProperties";
import { NewReportsClientDialog } from "@/components/reports/NewReportsClientDialog";
import { ReportPropertyCard } from "@/components/reports/ReportPropertyCard";

export default function ReportsSettings() {
  const [search, setSearch] = useState("");
  const { properties, total, isLoading, error } = useReportProperties(search);
  const reportsClientCount = properties.filter((p) => p.isReportsClient).length;

  usePageSEO({
    title: "Reporting settings | Rooms Online",
    description: "Configure capacity, branding and reporting options per property.",
    noIndex: true,
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Reporting settings</h1>
          <p className="text-sm text-muted-foreground">
            Pick a property to set its capacity, branding and report options.
          </p>
        </div>
        <NewReportsClientDialog />
      </div>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-medium tracking-tight">
            Properties{" "}
            <span className="text-sm font-normal text-muted-foreground">
              ({total}
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
          <p className="text-sm text-destructive">Could not load properties: {error.message}</p>
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
              <ReportPropertyCard key={property.id} property={property} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
