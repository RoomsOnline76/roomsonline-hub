import { LayoutList, CalendarRange, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { listAdapters } from "@/lib/report-adapters";

export type PortfolioView = "portfolio" | "timeline";
export type PortfolioSort = "attention" | "recent" | "name";

export interface PortfolioFilterState {
  search: string;
  source: string;
  month: string;
  sort: PortfolioSort;
  view: PortfolioView;
}

export const DEFAULT_FILTERS: PortfolioFilterState = {
  search: "",
  source: "all",
  month: "all",
  sort: "attention",
  view: "portfolio",
};

const SORT_LABEL: Record<PortfolioSort, string> = {
  attention: "Needs attention first",
  recent: "Last reported",
  name: "Property name",
};

export function PortfolioFilters({
  value,
  months,
  onChange,
}: {
  value: PortfolioFilterState;
  /** `YYYY-MM` values present in the data, newest first. */
  months: string[];
  onChange: (next: Partial<PortfolioFilterState>) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-full sm:w-64">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={value.search}
          onChange={(event) => onChange({ search: event.target.value })}
          placeholder="Search properties"
          className="pl-9"
          aria-label="Search properties"
        />
      </div>

      <Select value={value.source} onValueChange={(source) => onChange({ source })}>
        <SelectTrigger className="w-[150px]" aria-label="Filter by source">
          <SelectValue placeholder="Source" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All sources</SelectItem>
          {listAdapters().map((adapter) => (
            <SelectItem key={adapter.key} value={adapter.key}>
              {adapter.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={value.month} onValueChange={(month) => onChange({ month })}>
        <SelectTrigger className="w-[160px]" aria-label="Filter by reporting month">
          <SelectValue placeholder="Reporting month" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All months</SelectItem>
          {months.map((month) => (
            <SelectItem key={month} value={month}>
              {new Date(`${month}-01T00:00:00`).toLocaleDateString("en-ZA", {
                month: "long",
                year: "numeric",
              })}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={value.sort}
        onValueChange={(sort) => onChange({ sort: sort as PortfolioSort })}
      >
        <SelectTrigger className="w-[190px]" aria-label="Sort properties">
          <SelectValue placeholder="Sort" />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(SORT_LABEL) as PortfolioSort[]).map((key) => (
            <SelectItem key={key} value={key}>
              {SORT_LABEL[key]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <ToggleGroup
        type="single"
        value={value.view}
        onValueChange={(view) => view && onChange({ view: view as PortfolioView })}
        className="ml-auto"
      >
        <ToggleGroupItem value="portfolio" aria-label="Portfolio view" className="gap-1.5 px-3">
          <LayoutList className="h-4 w-4" />
          <span className="hidden sm:inline text-xs">Portfolio</span>
        </ToggleGroupItem>
        <ToggleGroupItem value="timeline" aria-label="Timeline view" className="gap-1.5 px-3">
          <CalendarRange className="h-4 w-4" />
          <span className="hidden sm:inline text-xs">Timeline</span>
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
}

export default PortfolioFilters;
