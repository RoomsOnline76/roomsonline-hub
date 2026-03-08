import { useEffect, useState, useCallback } from "react";
import { usePmsPropertyId } from "@/hooks/usePmsPropertyId";
import { PMSLayout } from "@/components/layout/PMSLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, TrendingUp, RefreshCw, Pencil, Link2 } from "lucide-react";
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

interface RoomType {
  id: string;
  name: string;
}

interface RatePlanRoomLink {
  rate_plan_id: string;
  room_type_id: string;
}

export default function PMSRatePlans() {
  const { propertyId, loading: propertyLoading } = usePmsPropertyId();
  const [plans, setPlans] = useState<RatePlan[]>([]);
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [links, setLinks] = useState<RatePlanRoomLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<RatePlan | null>(null);
  const [form, setForm] = useState({
    name: "", code: "", description: "", min_stay: "1", requires_deposit: false,
    linkedRoomTypeIds: [] as string[],
  });

  const fetchData = useCallback(async () => {
    if (!propertyId) return;
    setLoading(true);

    const [plansRes, roomTypesRes, linksRes] = await Promise.all([
      supabase
        .from("rolos_rate_plans")
        .select("id, name, code, description, is_active, min_stay, requires_deposit, deposit_percentage")
        .eq("property_id", propertyId)
        .order("name"),
      supabase
        .from("rolos_room_types")
        .select("id, name")
        .eq("property_id", propertyId)
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("rolos_rate_plan_room_types")
        .select("rate_plan_id, room_type_id")
        .in("rate_plan_id",
          // We need to scope to this property's plans - fetch ids inline
          (await supabase.from("rolos_rate_plans").select("id").eq("property_id", propertyId)).data?.map(p => p.id) || []
        ),
    ]);

    setPlans((plansRes.data || []) as RatePlan[]);
    setRoomTypes((roomTypesRes.data || []) as RoomType[]);
    setLinks((linksRes.data || []) as RatePlanRoomLink[]);
    setLoading(false);
  }, [propertyId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const getLinkedRoomTypes = (planId: string) =>
    links.filter(l => l.rate_plan_id === planId).map(l => l.room_type_id);

  const getRoomTypeName = (id: string) =>
    roomTypes.find(rt => rt.id === id)?.name || id;

  const resetForm = () => {
    setForm({ name: "", code: "", description: "", min_stay: "1", requires_deposit: false, linkedRoomTypeIds: [] });
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
        linkedRoomTypeIds: getLinkedRoomTypes(plan.id),
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

    let planId: string;
    let error;

    if (editingPlan) {
      planId = editingPlan.id;
      ({ error } = await supabase.from("rolos_rate_plans").update(payload).eq("id", planId));
    } else {
      const res = await supabase.from("rolos_rate_plans").insert(payload).select("id").single();
      error = res.error;
      planId = res.data?.id || "";
    }

    if (error) { toast.error(error.message); return; }

    // Sync room type links
    // Delete existing links for this plan
    await supabase.from("rolos_rate_plan_room_types").delete().eq("rate_plan_id", planId);

    // Insert new links
    if (form.linkedRoomTypeIds.length > 0) {
      const linkRows = form.linkedRoomTypeIds.map(rtId => ({
        rate_plan_id: planId,
        room_type_id: rtId,
      }));
      const { error: linkError } = await supabase.from("rolos_rate_plan_room_types").insert(linkRows);
      if (linkError) { toast.error("Saved rate plan but failed to link room types: " + linkError.message); }
    }

    toast.success(editingPlan ? "Rate plan updated" : "Rate plan created");
    setDialogOpen(false);
    resetForm();
    fetchData();
  };

  const handleToggleActive = async (plan: RatePlan) => {
    const { error } = await supabase
      .from("rolos_rate_plans")
      .update({ is_active: !plan.is_active })
      .eq("id", plan.id);
    if (error) { toast.error(error.message); return; }
    fetchData();
  };

  const toggleRoomType = (roomTypeId: string) => {
    setForm(prev => ({
      ...prev,
      linkedRoomTypeIds: prev.linkedRoomTypeIds.includes(roomTypeId)
        ? prev.linkedRoomTypeIds.filter(id => id !== roomTypeId)
        : [...prev.linkedRoomTypeIds, roomTypeId],
    }));
  };

  if (propertyLoading) return <PMSLayout><p className="text-muted-foreground">Loading property…</p></PMSLayout>;
  if (!propertyId) return <PMSLayout><p className="text-muted-foreground">Select a property first.</p></PMSLayout>;

  return (
    <PMSLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Rate Plans</h1>
            <p className="text-sm text-muted-foreground">
              Create rate plans and link them to room types.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchData}>
              <RefreshCw className="h-4 w-4 mr-2" />Refresh
            </Button>
            <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
              <DialogTrigger asChild>
                <Button onClick={() => handleOpenDialog()}><Plus className="h-4 w-4 mr-2" />New Rate Plan</Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader><DialogTitle>{editingPlan ? "Edit Rate Plan" : "Create Rate Plan"}</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div><Label>Name *</Label><Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} /></div>
                  <div><Label>Code</Label><Input value={form.code} onChange={e => setForm(p => ({ ...p, code: e.target.value }))} placeholder="e.g. BAR, PROMO" /></div>
                  <div><Label>Description</Label><Input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} /></div>
                  <div><Label>Min Stay (nights)</Label><Input type="number" value={form.min_stay} onChange={e => setForm(p => ({ ...p, min_stay: e.target.value }))} /></div>
                  <div className="flex items-center gap-2"><Switch checked={form.requires_deposit} onCheckedChange={v => setForm(p => ({ ...p, requires_deposit: v }))} /><Label>Requires Deposit</Label></div>

                  {/* Room type linking */}
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2"><Link2 className="h-4 w-4" />Linked Room Types</Label>
                    {roomTypes.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No room types found. Add room types first.</p>
                    ) : (
                      <div className="space-y-2 rounded-md border border-border p-3">
                        {roomTypes.map(rt => (
                          <label key={rt.id} className="flex items-center gap-2 cursor-pointer">
                            <Checkbox
                              checked={form.linkedRoomTypeIds.includes(rt.id)}
                              onCheckedChange={() => toggleRoomType(rt.id)}
                            />
                            <span className="text-sm">{rt.name}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>

                  <Button onClick={handleSave} className="w-full">{editingPlan ? "Update" : "Create"}</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {loading ? <p className="text-muted-foreground">Loading...</p> : plans.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <TrendingUp className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-2">No rate plans configured.</p>
              <p className="text-sm text-muted-foreground">
                Create rate plans and link them to your room types.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {plans.map((plan) => {
              const linkedIds = getLinkedRoomTypes(plan.id);
              return (
                <Card key={plan.id} className="group">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">{plan.name}</CardTitle>
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => handleOpenDialog(plan)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Switch checked={plan.is_active ?? true} onCheckedChange={() => handleToggleActive(plan)} />
                      </div>
                    </div>
                    {plan.code && <p className="text-xs text-muted-foreground font-mono">{plan.code}</p>}
                  </CardHeader>
                  <CardContent>
                    {plan.description && <p className="text-sm text-muted-foreground mb-2">{plan.description}</p>}
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground mb-2">
                      <span>Min stay: {plan.min_stay}n</span>
                      {plan.requires_deposit && <Badge variant="outline" className="text-xs">Deposit</Badge>}
                    </div>
                    {linkedIds.length > 0 ? (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {linkedIds.map(rtId => (
                          <Badge key={rtId} variant="secondary" className="text-xs">
                            {getRoomTypeName(rtId)}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground/60 mt-2 italic">Not linked to any room types</p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </PMSLayout>
  );
}
