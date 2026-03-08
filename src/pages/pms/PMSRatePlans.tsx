import { useEffect, useState } from "react";
import { usePmsPropertyId } from "@/hooks/usePmsPropertyId";
import { PMSLayout } from "@/components/layout/PMSLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, TrendingUp, RefreshCw, Link2, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface RatePlan {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  is_active: boolean;
  min_stay: number;
  requires_deposit: boolean;
  deposit_percentage: number | null;
}

interface OverviewRateType {
  id: string;
  name: string;
  description: string | null;
  price_type: string | null;
  min_stay_days: number | null;
}

export default function PMSRatePlans() {
  const { propertyId, loading: propertyLoading } = usePmsPropertyId();
  const [plans, setPlans] = useState<RatePlan[]>([]);
  const [overviewRateTypes, setOverviewRateTypes] = useState<OverviewRateType[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<RatePlan | null>(null);
  const [form, setForm] = useState({ name: "", code: "", description: "", min_stay: "1", requires_deposit: false });

  const fetchData = async () => {
    if (!propertyId) return;
    setLoading(true);

    const [plansRes, overviewRes] = await Promise.all([
      supabase
        .from("rolos_rate_plans")
        .select("id, name, code, description, is_active, min_stay, requires_deposit, deposit_percentage")
        .eq("property_id", propertyId)
        .order("name"),
      supabase
        .from("pms_rate_types_cache")
        .select("id, name, description, price_type, min_stay_days")
        .eq("property_id", propertyId)
        .order("name"),
    ]);

    setPlans((plansRes.data || []) as RatePlan[]);
    setOverviewRateTypes((overviewRes.data || []) as OverviewRateType[]);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [propertyId]);

  const resetForm = () => {
    setForm({ name: "", code: "", description: "", min_stay: "1", requires_deposit: false });
    setEditingPlan(null);
  };

  const handleOpenDialog = (plan?: RatePlan) => {
    if (plan) {
      setEditingPlan(plan);
      setForm({
        name: plan.name,
        code: plan.code || "",
        description: plan.description || "",
        min_stay: String(plan.min_stay || 1),
        requires_deposit: plan.requires_deposit,
      });
    } else {
      resetForm();
    }
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!propertyId || !form.name) return;

    const payload = {
      property_id: propertyId,
      name: form.name,
      code: form.code || null,
      description: form.description || null,
      min_stay: parseInt(form.min_stay) || 1,
      requires_deposit: form.requires_deposit,
    };

    let error;
    if (editingPlan) {
      ({ error } = await supabase
        .from("rolos_rate_plans")
        .update(payload)
        .eq("id", editingPlan.id));
    } else {
      ({ error } = await supabase
        .from("rolos_rate_plans")
        .insert(payload));
    }

    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(editingPlan ? "Rate plan updated" : "Rate plan created");
    setDialogOpen(false);
    resetForm();
    fetchData();
  };

  const handleImportFromOverview = async () => {
    if (!propertyId || overviewRateTypes.length === 0) return;

    const existingNames = new Set(plans.map(p => p.name.toLowerCase()));
    const toImport = overviewRateTypes.filter(rt => !existingNames.has(rt.name.toLowerCase()));

    if (toImport.length === 0) {
      toast.info("All rate types are already imported");
      return;
    }

    const rows = toImport.map(rt => ({
      property_id: propertyId,
      name: rt.name,
      description: rt.description || null,
      min_stay: rt.min_stay_days || 1,
      is_active: true,
    }));

    const { error } = await supabase.from("rolos_rate_plans").insert(rows);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Imported ${toImport.length} rate type${toImport.length !== 1 ? 's' : ''} from Property Overview`);
    fetchData();
  };

  const handleToggleActive = async (plan: RatePlan) => {
    const { error } = await supabase
      .from("rolos_rate_plans")
      .update({ is_active: !plan.is_active })
      .eq("id", plan.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    fetchData();
  };

  if (propertyLoading) return <PMSLayout><p className="text-muted-foreground">Loading property…</p></PMSLayout>;
  if (!propertyId) return <PMSLayout><p className="text-muted-foreground">Select a property first.</p></PMSLayout>;

  const hasUnimported = overviewRateTypes.some(
    rt => !plans.some(p => p.name.toLowerCase() === rt.name.toLowerCase())
  );

  return (
    <PMSLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Rate Plans</h1>
            <p className="text-sm text-muted-foreground">
              Manage rate plans. Import from Property Overview or create custom plans.
            </p>
          </div>
          <div className="flex gap-2">
            {hasUnimported && (
              <Button variant="outline" onClick={handleImportFromOverview}>
                <Link2 className="h-4 w-4 mr-2" />Import from Overview
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={fetchData}>
              <RefreshCw className="h-4 w-4 mr-2" />Refresh
            </Button>
            <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
              <DialogTrigger asChild>
                <Button onClick={() => handleOpenDialog()}><Plus className="h-4 w-4 mr-2" />New Rate Plan</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>{editingPlan ? "Edit Rate Plan" : "Create Rate Plan"}</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div><Label>Name *</Label><Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} /></div>
                  <div><Label>Code</Label><Input value={form.code} onChange={e => setForm(p => ({ ...p, code: e.target.value }))} placeholder="e.g. BAR, PROMO" /></div>
                  <div><Label>Description</Label><Input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} /></div>
                  <div><Label>Min Stay (nights)</Label><Input type="number" value={form.min_stay} onChange={e => setForm(p => ({ ...p, min_stay: e.target.value }))} /></div>
                  <div className="flex items-center gap-2"><Switch checked={form.requires_deposit} onCheckedChange={v => setForm(p => ({ ...p, requires_deposit: v }))} /><Label>Requires Deposit</Label></div>
                  <Button onClick={handleSave} className="w-full">{editingPlan ? "Update" : "Create"}</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Overview rate types info */}
        {overviewRateTypes.length > 0 && plans.length === 0 && (
          <Card className="border-dashed">
            <CardContent className="py-6">
              <div className="flex items-center gap-4">
                <Link2 className="h-8 w-8 text-muted-foreground shrink-0" />
                <div className="flex-1">
                  <p className="font-medium">
                    {overviewRateTypes.length} rate type{overviewRateTypes.length !== 1 ? 's' : ''} found in Property Overview
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Import them to use as PMS rate plans: {overviewRateTypes.map(rt => rt.name).join(", ")}
                  </p>
                </div>
                <Button onClick={handleImportFromOverview}>Import All</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {loading ? <p className="text-muted-foreground">Loading...</p> : plans.length === 0 && overviewRateTypes.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <TrendingUp className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-2">No rate plans configured.</p>
              <p className="text-sm text-muted-foreground">
                Add rate types in Property Overview → Rates tab, or create them directly here.
              </p>
            </CardContent>
          </Card>
        ) : plans.length > 0 ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {plans.map((plan) => (
              <Card key={plan.id} className="group">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{plan.name}</CardTitle>
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => handleOpenDialog(plan)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Switch checked={plan.is_active} onCheckedChange={() => handleToggleActive(plan)} />
                    </div>
                  </div>
                  {plan.code && <p className="text-xs text-muted-foreground font-mono">{plan.code}</p>}
                </CardHeader>
                <CardContent>
                  {plan.description && <p className="text-sm text-muted-foreground mb-2">{plan.description}</p>}
                  <div className="flex gap-3 text-xs text-muted-foreground">
                    <span>Min stay: {plan.min_stay}n</span>
                    {plan.requires_deposit && <Badge variant="outline" className="text-xs">Deposit</Badge>}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : null}
      </div>
    </PMSLayout>
  );
}
