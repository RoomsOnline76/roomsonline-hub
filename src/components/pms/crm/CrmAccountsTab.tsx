import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Building2, Plus, Search, Users2 } from "lucide-react";
import { toast } from "sonner";
import { CRM_ACCOUNT_TYPES, crmAccountTypeLabel, type CrmAccountType } from "@/lib/crmSegmentation";
import { CrmAccountDialog } from "./CrmAccountDialog";
import type { CrmAccount, CrmAccountStats } from "@/hooks/useCrmAccounts";

interface CrmAccountsTabProps {
  accounts: CrmAccount[];
  stats: Record<string, CrmAccountStats>;
  loading: boolean;
  isPortfolioScoped: boolean;
  onSave: (values: Partial<CrmAccount> & { name: string }) => Promise<string>;
  onArchive: (id: string, isActive: boolean) => Promise<void>;
}

const money = (v: number) => `R${(v || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

/** Companies, travel agents, tour operators and sources for the portfolio. */
export function CrmAccountsTab({ accounts, stats, loading, isPortfolioScoped, onSave, onArchive }: CrmAccountsTabProps) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<CrmAccountType | "all">("all");
  const [showInactive, setShowInactive] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CrmAccount | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return accounts.filter((a) => {
      if (!showInactive && !a.is_active) return false;
      if (typeFilter !== "all" && a.account_type !== typeFilter) return false;
      if (!q) return true;
      return [a.name, a.email, a.phone, a.vat_number, a.city, (a.tags || []).join(" ")]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [accounts, search, typeFilter, showInactive]);

  const openNew = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-10"
            placeholder="Search companies, agents, sources..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="inline-flex rounded-md border bg-muted/40 p-0.5">
          <Button
            size="sm"
            variant={typeFilter === "all" ? "default" : "ghost"}
            className="h-7 px-3 text-xs"
            onClick={() => setTypeFilter("all")}
          >
            All
          </Button>
          {CRM_ACCOUNT_TYPES.map((t) => (
            <Button
              key={t.value}
              size="sm"
              variant={typeFilter === t.value ? "default" : "ghost"}
              className="h-7 px-3 text-xs"
              onClick={() => setTypeFilter(t.value)}
            >
              {t.label}
            </Button>
          ))}
        </div>
        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setShowInactive((v) => !v)}>
          {showInactive ? "Hide inactive" : "Show inactive"}
        </Button>
        <Button onClick={openNew}>
          <Plus className="mr-2 h-4 w-4" />
          Add Profile
        </Button>
      </div>

      {isPortfolioScoped && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Users2 className="h-3 w-3" />
          These profiles are shared with every property in the portfolio.
        </p>
      )}

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-md bg-muted" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Building2 className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
            <p className="text-muted-foreground">
              No company, agent or source profiles yet.
            </p>
            <Button variant="outline" className="mt-4" onClick={openNew}>
              <Plus className="mr-2 h-4 w-4" />
              Add the first profile
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((a) => {
            const s = stats[a.id];
            return (
              <Card
                key={a.id}
                className="cursor-pointer transition-shadow hover:shadow-sm"
                onClick={() => {
                  setEditing(a);
                  setDialogOpen(true);
                }}
              >
                <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                  <div className="flex min-w-0 items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-sm font-bold text-primary">
                      {a.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-medium">{a.name}</p>
                        <Badge variant="outline" className="text-[10px]">{crmAccountTypeLabel(a.account_type)}</Badge>
                        {!a.is_active && <Badge variant="secondary" className="text-[10px]">Inactive</Badge>}
                        {a.is_credit_account && <Badge variant="outline" className="text-[10px]">Credit</Badge>}
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {[a.email, a.phone, a.vat_number ? `VAT ${a.vat_number}` : null].filter(Boolean).join(" · ") || "No contact details"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right text-sm">
                      <p className="font-medium">{s?.booking_count ?? 0} bookings</p>
                      <p className="text-xs text-muted-foreground">
                        {money(s?.total_revenue ?? 0)} · {s?.room_nights ?? 0} nights
                      </p>
                    </div>
                    {a.default_commission_rate != null && (
                      <Badge variant="secondary" className="text-[10px]">{a.default_commission_rate}% comm.</Badge>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      onClick={async (e) => {
                        e.stopPropagation();
                        try {
                          await onArchive(a.id, !a.is_active);
                          toast.success(a.is_active ? "Profile deactivated" : "Profile reactivated");
                        } catch (err) {
                          toast.error((err as Error).message);
                        }
                      }}
                    >
                      {a.is_active ? "Deactivate" : "Reactivate"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <CrmAccountDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        account={editing}
        stats={editing ? stats[editing.id] : undefined}
        isPortfolioScoped={isPortfolioScoped}
        onSave={onSave}
      />
    </div>
  );
}
