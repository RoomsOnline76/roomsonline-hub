import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Receipt, FileText } from "lucide-react";
import {
  usePortfolioShareConfig,
  useUpsertShareConfig,
  useSharePairs,
  useUpsertSharePair,
  usePortfolioShareInvoices,
  type ShareBasis,
} from "@/hooks/usePortfolioRevenueShare";
import { format } from "date-fns";

interface Props {
  portfolioId: string;
  properties: Array<{ id: string; name: string }>;
  isAdmin: boolean;
}

export function RevenueShareSection({ portfolioId, properties, isAdmin }: Props) {
  const { toast } = useToast();
  const { data: cfg, isLoading: cfgLoading } = usePortfolioShareConfig(portfolioId);
  const { data: pairs = [] } = useSharePairs(portfolioId);
  const { data: invoices = [], refetch: refetchInvoices } = usePortfolioShareInvoices(portfolioId);
  const upsertCfg = useUpsertShareConfig();
  const upsertPair = useUpsertSharePair();

  const [basis, setBasis] = useState<ShareBasis>(cfg?.share_basis ?? "net_accommodation");
  const [includePortfolio, setIncludePortfolio] = useState(cfg?.include_portfolio_origin ?? true);
  const [includeCross, setIncludeCross] = useState(cfg?.include_cross_property_origin ?? true);
  const [portfolioDefault, setPortfolioDefault] = useState<number>(cfg?.portfolio_origin_default_percent ?? 0);
  const [generating, setGenerating] = useState(false);

  // Hydrate when cfg loads
  useMemo(() => {
    if (cfg) {
      setBasis(cfg.share_basis);
      setIncludePortfolio(cfg.include_portfolio_origin);
      setIncludeCross(cfg.include_cross_property_origin);
      setPortfolioDefault(cfg.portfolio_origin_default_percent);
    }
  }, [cfg]);

  const pairMap = useMemo(() => {
    const m = new Map<string, number>();
    pairs.forEach((p) => m.set(`${p.from_property_id}:${p.to_property_id}`, Number(p.share_percent)));
    return m;
  }, [pairs]);

  const handleCellChange = (from: string, to: string, val: string) => {
    const num = Math.max(0, Math.min(100, Number(val) || 0));
    upsertPair.mutate({
      portfolio_id: portfolioId,
      from_property_id: from,
      to_property_id: to,
      share_percent: num,
      set_by_role: isAdmin ? "admin" : "owner",
    });
  };

  const generateInvoices = async () => {
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-portfolio-share-invoices", {
        body: { portfolio_id: portfolioId },
      });
      if (error) throw error;
      toast({ title: "Invoices generated", description: `${(data as { created?: number })?.created ?? 0} draft invoice(s) created.` });
      refetchInvoices();
    } catch (e) {
      toast({ title: "Generation failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const sendInvoice = async (invoiceId: string) => {
    const { error } = await supabase.functions.invoke("send-portfolio-share-invoice", { body: { invoice_id: invoiceId } });
    if (error) {
      toast({ title: "Send failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Invoice sent" });
    refetchInvoices();
  };

  if (cfgLoading) {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading revenue share…</div>;
  }

  return (
    <div className="space-y-6 p-4 bg-background border border-border rounded-lg">
      <div>
        <h3 className="text-sm font-semibold mb-1 flex items-center gap-2"><Receipt className="h-4 w-4" /> Cross-Property Revenue Share</h3>
        <p className="text-xs text-muted-foreground">When a booking for one property in this portfolio originates from another, the originating property earns the agreed % of the booking. Invoices are batched monthly.</p>
      </div>

      {/* Config */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label className="text-xs">Share basis</Label>
          <Select value={basis} onValueChange={(v) => setBasis(v as ShareBasis)}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="gross_total">Gross booking total</SelectItem>
              <SelectItem value="net_accommodation">Net accommodation only</SelectItem>
              <SelectItem value="net_after_rl_fees">Net after RL fees</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Portfolio-link default %</Label>
          <Input type="number" min={0} max={100} step={0.5} value={portfolioDefault} onChange={(e) => setPortfolioDefault(Number(e.target.value))} className="h-9" />
        </div>
        <div className="flex items-center justify-between p-2 border border-border rounded-md">
          <div>
            <p className="text-xs font-medium">Include portfolio-link bookings</p>
            <p className="text-[10px] text-muted-foreground">Bookings from /portfolio/&lt;slug&gt;</p>
          </div>
          <Switch checked={includePortfolio} onCheckedChange={setIncludePortfolio} />
        </div>
        <div className="flex items-center justify-between p-2 border border-border rounded-md">
          <div>
            <p className="text-xs font-medium">Include cross-property bookings</p>
            <p className="text-[10px] text-muted-foreground">Bookings from another property's site</p>
          </div>
          <Switch checked={includeCross} onCheckedChange={setIncludeCross} />
        </div>
      </div>
      <Button size="sm" onClick={() => upsertCfg.mutate({
        portfolio_id: portfolioId,
        share_basis: basis,
        include_portfolio_origin: includePortfolio,
        include_cross_property_origin: includeCross,
        portfolio_origin_default_percent: portfolioDefault,
      })} disabled={upsertCfg.isPending}>
        {upsertCfg.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}Save config
      </Button>

      {/* Matrix */}
      {properties.length >= 2 && (
        <div>
          <Label className="text-xs mb-2 block">Pairwise share matrix — % the <strong>row property</strong> earns when a booking for the <strong>column property</strong> originates from it</Label>
          <div className="overflow-x-auto border border-border rounded-md">
            <table className="text-xs w-full">
              <thead className="bg-muted/40">
                <tr>
                  <th className="text-left p-2 font-medium">From ↓  /  To →</th>
                  {properties.map((p) => <th key={p.id} className="p-2 text-left font-medium whitespace-nowrap">{p.name}</th>)}
                </tr>
              </thead>
              <tbody>
                {properties.map((from) => (
                  <tr key={from.id} className="border-t border-border">
                    <td className="p-2 font-medium whitespace-nowrap">{from.name}</td>
                    {properties.map((to) => (
                      <td key={to.id} className="p-1">
                        {from.id === to.id ? (
                          <span className="text-muted-foreground/50">—</span>
                        ) : (
                          <Input
                            type="number" min={0} max={100} step={0.5}
                            className="h-8 w-20 text-xs"
                            defaultValue={pairMap.get(`${from.id}:${to.id}`) ?? 0}
                            onBlur={(e) => handleCellChange(from.id, to.id, e.target.value)}
                          />
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Invoices */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-semibold flex items-center gap-1"><FileText className="h-3 w-3" /> Monthly share invoices</h4>
          <Button size="sm" variant="outline" onClick={generateInvoices} disabled={generating}>
            {generating && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}Generate for last month
          </Button>
        </div>
        {invoices.length === 0 ? (
          <p className="text-xs text-muted-foreground">No invoices yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Period</TableHead>
                <TableHead className="text-xs">From → To</TableHead>
                <TableHead className="text-xs">Total</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((inv) => {
                const fromName = properties.find((p) => p.id === inv.from_property_id)?.name ?? inv.from_property_id.slice(0, 6);
                const toName = properties.find((p) => p.id === inv.to_property_id)?.name ?? inv.to_property_id.slice(0, 6);
                return (
                  <TableRow key={inv.id}>
                    <TableCell className="text-xs">{format(new Date(inv.period_start), "MMM yyyy")}</TableCell>
                    <TableCell className="text-xs">{fromName} → {toName}</TableCell>
                    <TableCell className="text-xs font-medium">{inv.currency} {Number(inv.total).toFixed(2)}</TableCell>
                    <TableCell><Badge variant={inv.status === "paid" ? "default" : inv.status === "sent" ? "secondary" : "outline"} className="text-[10px]">{inv.status}</Badge></TableCell>
                    <TableCell>
                      {inv.status === "draft" && <Button size="sm" variant="ghost" onClick={() => sendInvoice(inv.id)}>Send</Button>}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
