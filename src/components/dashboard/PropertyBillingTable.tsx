import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ExternalLink, Search } from "lucide-react";
import type { BillingEntityRow, BillingEntityStatus } from "@/hooks/usePropertyBillingRevenue";

const zar = (value: number) =>
  `R ${Number(value || 0).toLocaleString("en-ZA", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const STATUS_META: Record<BillingEntityStatus, { label: string; className: string }> = {
  active: { label: "Active", className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" },
  trial: { label: "Free period", className: "bg-sky-500/10 text-sky-600 border-sky-500/30" },
  pending: { label: "Pending", className: "bg-muted text-muted-foreground border-border" },
  past_due: { label: "Past due", className: "bg-destructive/10 text-destructive border-destructive/30" },
  cancelled: { label: "Cancelled", className: "bg-muted text-muted-foreground border-border" },
  reservation_only: {
    label: "Reservation only",
    className: "bg-amber-500/10 text-amber-600 border-amber-500/30",
  },
};

const FILTERS: Array<{ key: "all" | BillingEntityStatus; label: string }> = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "trial", label: "Free period" },
  { key: "pending", label: "Pending" },
  { key: "past_due", label: "Past due" },
  { key: "reservation_only", label: "Reservation only" },
  { key: "cancelled", label: "Cancelled" },
];

type SortKey = "balance" | "monthly" | "name";

interface Props {
  rows: BillingEntityRow[];
  isLoading?: boolean;
}

export function PropertyBillingTable({ rows, isLoading }: Props) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | BillingEntityStatus>("all");
  const [sort, setSort] = useState<SortKey>("balance");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = rows.filter((row) => {
      if (filter !== "all" && row.status !== filter) return false;
      if (q && !row.name.toLowerCase().includes(q)) return false;
      return true;
    });
    return [...filtered].sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "monthly") return b.monthlyExpected - a.monthlyExpected;
      return b.balance - a.balance || b.monthlyExpected - a.monthlyExpected;
    });
  }, [rows, query, filter, sort]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-sm font-medium">Billing by property &amp; portfolio</CardTitle>
          <div className="relative w-full sm:w-56">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name…"
              className="h-8 pl-7 text-xs"
            />
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <Button
              key={f.key}
              size="sm"
              variant={filter === f.key ? "default" : "outline"}
              className="h-6 px-2 text-[10px]"
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="px-0 pb-2">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2 text-left">
                  <button type="button" className="hover:text-foreground" onClick={() => setSort("name")}>
                    Client
                  </button>
                </th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-right">
                  <button type="button" className="hover:text-foreground" onClick={() => setSort("monthly")}>
                    Monthly expected
                  </button>
                </th>
                <th className="px-3 py-2 text-right">Setup expected</th>
                <th className="px-3 py-2 text-right">Invoiced</th>
                <th className="px-3 py-2 text-right">Paid</th>
                <th className="px-3 py-2 text-right">
                  <button type="button" className="hover:text-foreground" onClick={() => setSort("balance")}>
                    Balance
                  </button>
                </th>
                <th className="px-3 py-2 text-left">First billing</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">
                    Loading billing data…
                  </td>
                </tr>
              )}
              {!isLoading && visible.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">
                    No billing entities match this filter.
                  </td>
                </tr>
              )}
              {visible.map((row) => {
                const meta = STATUS_META[row.status];
                return (
                  <tr key={row.key} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="px-3 py-2">
                      <div className="font-medium">{row.name}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {row.scope === "portfolio" ? "Portfolio" : "Property"}
                        {row.rooms > 0 ? ` · ${row.rooms} unit${row.rooms === 1 ? "" : "s"}` : ""}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant="outline" className={cn("text-[10px]", meta.className)}>
                        {meta.label}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {row.requiresCustomFee && row.monthlyExpected === 0 ? (
                        <span className="text-muted-foreground">Custom</span>
                      ) : (
                        zar(row.monthlyExpected)
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{zar(row.setupExpected)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {zar(row.invoicedMonthly + row.invoicedOnceOff)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {zar(row.paidMonthly + row.paidOnceOff)}
                    </td>
                    <td
                      className={cn(
                        "px-3 py-2 text-right tabular-nums",
                        row.overdue && row.balance > 0 && "font-bold text-destructive",
                      )}
                    >
                      {zar(row.balance)}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{row.firstBillingDate ?? "—"}</td>
                    <td className="px-3 py-2 text-right">
                      <Button asChild size="sm" variant="ghost" className="h-6 px-2 text-[10px]">
                        <Link to={`/admin/account?scope=${row.scope}&id=${row.id}`}>
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      </Button>
                    </td>

                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
