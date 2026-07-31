import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Loader2, Plus, ArrowLeft, UserPlus, Pencil, Trash2 } from "lucide-react";
import { useSalesReps, SalesRep } from "@/hooks/useSalesReps";
import { useAuth } from "@/hooks/useAuth";
import { RepBankingForm } from "@/components/sales-reps/RepBankingForm";
import { fetchRepGlobals, resolveRepTerms, RepTierKey } from "@/lib/repContractVariables";

const TIER_LABELS: Record<string, { label: string; color: string }> = {
  base: { label: "Base", color: "bg-muted text-muted-foreground" },
  accelerated: { label: "Accelerated", color: "bg-primary/10 text-primary" },
  elite: { label: "Elite", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400" },
};

const TIER_KEYS: RepTierKey[] = ["base", "accelerated", "elite"];


function RepForm({ rep, onSave, saving, onCancel }: {
  rep?: SalesRep;
  onSave: (data: any) => void;
  saving: boolean;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    rep_code: rep?.rep_code ?? "",
    display_name: rep?.display_name ?? "",
    email: rep?.email ?? "",
    phone: rep?.phone ?? "",
    commission_tier: rep?.commission_tier ?? "base",
    is_active: rep?.is_active ?? true,
    quarterly_target: rep?.quarterly_target?.toString() ?? "5",
    notes: rep?.notes ?? "",
  });

  const handleSubmit = () => {
    onSave({
      ...(rep ? { id: rep.id } : {}),
      rep_code: form.rep_code,
      display_name: form.display_name,
      email: form.email,
      phone: form.phone || null,
      commission_tier: form.commission_tier,
      is_active: form.is_active,
      quarterly_target: form.quarterly_target ? parseInt(form.quarterly_target) : null,
      notes: form.notes || null,
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Rep Code</Label>
          <Input value={form.rep_code} onChange={(e) => setForm({ ...form, rep_code: e.target.value })} placeholder="REP-001" className="h-8 text-sm" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Display Name</Label>
          <Input value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} placeholder="John Smith" className="h-8 text-sm" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Email</Label>
          <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="rep@example.com" className="h-8 text-sm" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Phone</Label>
          <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+27..." className="h-8 text-sm" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Commission Tier</Label>
          <Select value={form.commission_tier} onValueChange={(v: "base" | "accelerated" | "elite") => setForm({ ...form, commission_tier: v })}>
            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="base">Base (20% / 5%)</SelectItem>
              <SelectItem value="accelerated">Accelerated (25% / 7.5%)</SelectItem>
              <SelectItem value="elite">Elite (30% / 10%)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Quarterly Target</Label>
          <Input type="number" value={form.quarterly_target} onChange={(e) => setForm({ ...form, quarterly_target: e.target.value })} className="h-8 text-sm" />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
        <Label className="text-xs">Active</Label>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Notes</Label>
        <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className="text-xs" />
      </div>
      <div className="flex gap-2 justify-end">
        <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
        <Button size="sm" onClick={handleSubmit} disabled={saving || !form.rep_code || !form.display_name || !form.email}>
          {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
          {rep ? "Update" : "Create"} Rep
        </Button>
      </div>
    </div>
  );
}

export default function AdminSalesReps() {
  const navigate = useNavigate();
  const { isDev, isFearlessLeader, isAdmin, loading: authLoading } = useAuth();
  const { reps, isLoading, create, update, remove } = useSalesReps();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRep, setEditingRep] = useState<SalesRep | undefined>();
  const [repGlobals, setRepGlobals] = useState<Record<string, any> | null>(null);

  useEffect(() => {
    fetchRepGlobals()
      .then(setRepGlobals)
      .catch((e) => console.warn("Failed to load rep commission defaults", e));
  }, []);

  // Live tier economics, resolved from Billing Defaults (never hardcoded).
  const tierTerms = useMemo(
    () => TIER_KEYS.map((tier) => ({ tier, terms: resolveRepTerms({ commission_tier: tier }, repGlobals) })),
    [repGlobals]
  );



  if (authLoading) {
    return <div className="flex items-center justify-center p-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  if (!isDev && !isFearlessLeader && !isAdmin) {
    navigate("/admin/dashboard");
    return null;
  }

  const handleSave = (data: any) => {
    if (data.id) {
      update.mutate(data, { onSuccess: () => { setDialogOpen(false); setEditingRep(undefined); } });
    } else {
      create.mutate(data, { onSuccess: () => { setDialogOpen(false); setEditingRep(undefined); } });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">Sales Reps</h1>
            <p className="text-sm text-muted-foreground">Manage your property acquisition team and commission tiers.</p>
          </div>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) setEditingRep(undefined); }}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-3 w-3 mr-1" /> Add Rep</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingRep ? "Edit" : "Add"} Sales Rep</DialogTitle>
            </DialogHeader>
            <RepForm
              rep={editingRep}
              onSave={handleSave}
              saving={create.isPending || update.isPending}
              onCancel={() => { setDialogOpen(false); setEditingRep(undefined); }}
            />
          </DialogContent>
        </Dialog>
      </div>

      {/* Tier reference card — resolved live from Billing Defaults */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Commission Tiers Reference</CardTitle>
          <p className="text-xs text-muted-foreground">
            These are the exact figures written into Referral Partner Agreements. Edit them in Admin → Billing Defaults.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-xs">
            {tierTerms.map(({ tier, terms }) => (
              <div key={tier} className="space-y-1">
                <Badge className={TIER_LABELS[tier].color}>{TIER_LABELS[tier].label}</Badge>
                <p>First-year: <strong>{terms.first_year_rate}%</strong></p>
                <p>Residual: <strong>{terms.residual_rate}%</strong> for {terms.residual_months} mo</p>
                <p className="text-muted-foreground">Clawback: {terms.clawback_days} days</p>
                <p className="text-muted-foreground">
                  {terms.source === "tier_criteria"
                    ? "From tier criteria"
                    : terms.source === "global_default"
                    ? "From billing defaults"
                    : "Platform fallback"}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>


      {isLoading ? (
        <div className="flex items-center justify-center p-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : reps.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <UserPlus className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No sales reps yet. Add your first rep to start tracking referrals.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {reps.map((rep) => (
            <Card key={rep.id}>
              <CardContent className="pt-4 space-y-2">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-sm">{rep.display_name}</p>
                    <p className="text-xs text-muted-foreground">{rep.rep_code} · {rep.email}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Badge className={TIER_LABELS[rep.commission_tier]?.color || ""}>
                      {TIER_LABELS[rep.commission_tier]?.label || rep.commission_tier}
                    </Badge>
                    {!rep.is_active && <Badge variant="outline" className="text-destructive">Inactive</Badge>}
                  </div>
                </div>
                {rep.phone && <p className="text-xs text-muted-foreground">{rep.phone}</p>}
                <p className="text-xs">Target: {rep.quarterly_target ?? "—"} properties/quarter</p>
                {(() => {
                  const t = resolveRepTerms(rep, repGlobals);
                  return (
                    <p className="text-xs text-muted-foreground">
                      Contract terms: {t.first_year_rate}% first year · {t.residual_rate}% residual for {t.residual_months} mo
                    </p>
                  );
                })()}
                {rep.notes && <p className="text-xs text-muted-foreground italic">{rep.notes}</p>}
                <div className="flex gap-1 pt-1">
                  <Button variant="ghost" size="sm" onClick={() => { setEditingRep(rep); setDialogOpen(true); }}>
                    <Pencil className="h-3 w-3 mr-1" /> Edit
                  </Button>
                  <Button variant="ghost" size="sm" className="text-destructive" onClick={() => {
                    if (confirm("Remove this sales rep?")) remove.mutate(rep.id);
                  }}>
                    <Trash2 className="h-3 w-3 mr-1" /> Remove
                  </Button>
                </div>
                <RepBankingForm repId={rep.id} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
