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
import { Plus, TrendingUp } from "lucide-react";
import { callPmsApi } from "@/hooks/usePmsApi";
import { toast } from "sonner";

interface RatePlan {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  is_active: boolean;
  min_stay: number;
  requires_deposit: boolean;
}

export default function PMSRatePlans() {
  const { propertyId, loading: propertyLoading } = usePmsPropertyId();
  const [plans, setPlans] = useState<RatePlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ name: "", code: "", description: "", min_stay: "1", requires_deposit: false });

  const fetchPlans = async () => {
    if (!propertyId) return;
    setLoading(true);
    try {
      const res = await callPmsApi<{ rate_plans: RatePlan[] }>("get_rate_plans", { propertyId });
      if (res.success) setPlans(res.data?.rate_plans || []);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { fetchPlans(); }, [propertyId]);

  const handleCreate = async () => {
    if (!propertyId || !form.name) return;
    try {
      const res = await callPmsApi("create_rate_plan", {
        propertyId, name: form.name, code: form.code || null, description: form.description || null,
        min_stay: parseInt(form.min_stay) || 1, requires_deposit: form.requires_deposit,
      });
      if (res.success) {
        toast.success("Rate plan created");
        setDialogOpen(false);
        setForm({ name: "", code: "", description: "", min_stay: "1", requires_deposit: false });
        fetchPlans();
      }
    } catch (e: any) { toast.error(e.message); }
  };

  if (propertyLoading) return <PMSLayout><p className="text-muted-foreground">Loading property…</p></PMSLayout>;
  if (!propertyId) return <PMSLayout><p className="text-muted-foreground">Select a property first.</p></PMSLayout>;

  return (
    <PMSLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight">Rate Plans</h1>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />New Rate Plan</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create Rate Plan</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div><Label>Name *</Label><Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} /></div>
                <div><Label>Code</Label><Input value={form.code} onChange={e => setForm(p => ({ ...p, code: e.target.value }))} placeholder="e.g. BAR, PROMO" /></div>
                <div><Label>Description</Label><Input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} /></div>
                <div><Label>Min Stay (nights)</Label><Input type="number" value={form.min_stay} onChange={e => setForm(p => ({ ...p, min_stay: e.target.value }))} /></div>
                <div className="flex items-center gap-2"><Switch checked={form.requires_deposit} onCheckedChange={v => setForm(p => ({ ...p, requires_deposit: v }))} /><Label>Requires Deposit</Label></div>
                <Button onClick={handleCreate} className="w-full">Create</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {loading ? <p className="text-muted-foreground">Loading...</p> : plans.length === 0 ? (
          <Card><CardContent className="py-12 text-center"><TrendingUp className="h-12 w-12 mx-auto text-muted-foreground mb-4" /><p className="text-muted-foreground">No rate plans configured.</p></CardContent></Card>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {plans.map((plan) => (
              <Card key={plan.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{plan.name}</CardTitle>
                    <Badge variant={plan.is_active ? "default" : "secondary"}>{plan.is_active ? "Active" : "Inactive"}</Badge>
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
        )}
      </div>
    </PMSLayout>
  );
}
