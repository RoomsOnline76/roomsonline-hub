import { Link } from "react-router-dom";
import { Building2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { reportsPath } from "@/lib/config";
import type { ReportProperty } from "@/hooks/useReportProperties";

const formatRunDate = (iso: string): string =>
  new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

export function ReportPropertyCard({ property }: { property: ReportProperty }) {
  return (
    <Link
      to={reportsPath(`/settings/${property.id}`)}
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
          <p className="truncate text-sm font-medium group-hover:text-primary">{property.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {property.city ?? "Location not set"}
            {property.roomCount ? ` · ${property.roomCount} rooms` : ""}
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary" className="text-[11px] font-normal">
              Last run: {property.lastRunDate ? formatRunDate(property.lastRunDate) : "—"}
            </Badge>
            {property.isReportsClient && (
              <Badge variant="outline" className="text-[11px] font-normal">
                Reporting only
              </Badge>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}

export default ReportPropertyCard;
