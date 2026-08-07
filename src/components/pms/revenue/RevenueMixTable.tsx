import { useMemo, useState } from "react";
import { ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RevenueMixPropertyRow } from "@/hooks/useRevenueStreamTotals";

type SortKey = "propertyName" | "total" | "accommodation" | "fnb" | "other" | "accomAdr";

const money = (n: number) => `R${Math.round(n).toLocaleString("en-ZA")}`;

interface Props {
  rows: RevenueMixPropertyRow[];
  totals: { accommodation: number; fnb: number; other: number; total: number; accomAdr: number };
  /** Hide the property column when a single property is in scope. */
  compact?: boolean;
}

/** Per-property Accommodation / F&B / Other breakdown with a portfolio total row. */
export function RevenueMixTable({ rows, totals, compact }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("total");
  const [asc, setAsc] = useState(false);

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      if (sortKey === "propertyName") return a.propertyName.localeCompare(b.propertyName);
      return Number(b[sortKey]) - Number(a[sortKey]);
    });
    return asc ? copy.reverse() : copy;
  }, [rows, sortKey, asc]);

  const toggle = (key: SortKey) => {
    if (key === sortKey) setAsc((v) => !v);
    else {
      setSortKey(key);
      setAsc(key === "propertyName");
    }
  };

  const headCell = (key: SortKey, label: string, className?: string) => (
    <th className={cn("py-1.5 font-medium", className)}>
      <button
        type="button"
        onClick={() => toggle(key)}
        className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
      >
        {label}
        <ArrowUpDown className={cn("h-3 w-3 opacity-40", sortKey === key && "opacity-100 text-primary")} />
      </button>
    </th>
  );

  return (
    <>
      {/* Desktop / tablet table */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground border-b">
            <tr className="text-right">
              {!compact && headCell("propertyName", "Property", "text-left")}
              {headCell("total", "Total", "text-right")}
              {headCell("accommodation", "Accommodation", "text-right")}
              {headCell("fnb", "F&B", "text-right")}
              {headCell("other", "Other", "text-right")}
              {headCell("accomAdr", "Accom ADR", "text-right")}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.propertyId} className="border-b last:border-0 text-right">
                {!compact && (
                  <td className="py-1.5 text-left font-medium text-foreground">{r.propertyName}</td>
                )}
                <td className="py-1.5 tabular-nums">{money(r.total)}</td>
                <td className="py-1.5 tabular-nums text-foreground">{money(r.accommodation)}</td>
                <td className="py-1.5 tabular-nums text-primary">{money(r.fnb)}</td>
                <td className="py-1.5 tabular-nums text-muted-foreground">{money(r.other)}</td>
                <td className="py-1.5 tabular-nums">{money(r.accomAdr)}</td>
              </tr>
            ))}
          </tbody>
          {rows.length > 1 && (
            <tfoot>
              <tr className="text-right font-semibold bg-muted/50">
                {!compact && <td className="py-2 text-left">Portfolio</td>}
                <td className="py-2 tabular-nums">{money(totals.total)}</td>
                <td className="py-2 tabular-nums">{money(totals.accommodation)}</td>
                <td className="py-2 tabular-nums text-primary">{money(totals.fnb)}</td>
                <td className="py-2 tabular-nums">{money(totals.other)}</td>
                <td className="py-2 tabular-nums">{money(totals.accomAdr)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Mobile: condensed two-line rows */}
      <div className="sm:hidden divide-y">
        {sorted.map((r) => (
          <div key={r.propertyId} className="py-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-medium truncate">{r.propertyName}</span>
              <span className="text-sm tabular-nums">{money(r.total)}</span>
            </div>
            <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground tabular-nums">
              <span>Accom {money(r.accommodation)}</span>
              <span className="text-primary">F&B {money(r.fnb)}</span>
              <span>Other {money(r.other)}</span>
              <span>ADR {money(r.accomAdr)}</span>
            </div>
          </div>
        ))}
        {rows.length > 1 && (
          <div className="py-2 flex items-baseline justify-between font-semibold">
            <span className="text-sm">Portfolio</span>
            <span className="text-sm tabular-nums">{money(totals.total)}</span>
          </div>
        )}
      </div>
    </>
  );
}
