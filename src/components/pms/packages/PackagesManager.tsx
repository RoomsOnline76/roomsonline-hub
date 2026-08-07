import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Package as PackageIcon, Pencil, Trash2 } from "lucide-react";
import {
  COMPONENT_TYPE_LABELS,
  QUANTITY_BASIS_LABELS,
  defaultStreamForType,
  expandPackage,
  packageAddOnTotal,
  packageStreamTotals,
  type PackageComponentType,
  type PackageQuantityBasis,
  type PackageValueType,
  type RolosPackage,
  type RolosPackageComponent,
} from "@/lib/packages";
import { getRevenueStreamLabel, type RevenueStream } from "@/components/charges/ChargeCalculator";

interface RatePlanOption {
  id: string;
  name: string;
}

interface ComponentDraft {
  id?: string;
  name: string;
  component_type: PackageComponentType;
  value_type: PackageValueType;
  amount: string;
  revenue_stream: RevenueStream;
  quantity_basis: PackageQuantityBasis;
  quantity: string;
  is_included_in_rate: boolean;
}

const emptyComponent = (): ComponentDraft => ({
  name: "",
  component_type: "breakfast",
  value_type: "amount",
  amount: "",
  revenue_stream: "fnb",
  quantity_basis: "per_person_per_night",
  quantity: "1",
  is_included_in_rate: true,
});

interface PackagesManagerProps {
  propertyId: string;
  ratePlans?: RatePlanOption[];
  readOnly?: boolean;
}

export function PackagesManager({ propertyId, ratePlans = [], readOnly }: PackagesManagerProps) {
  const [packages, setPackages] = useState<RolosPackage[]>([]);
  const [components, setComponents] = useState<RolosPackageComponent[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<RolosPackage | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    code: "",
    description: "",
    base_rate_plan_id: "",
    min_nights: "0",
    max_nights: "0",
    sell_standalone: false,
    is_active: true,
  });
  const [drafts, setDrafts] = useState<ComponentDraft[]>([emptyComponent()]);

  const fetchData = useCallback(async () => {
    if (!propertyId) return;
    setLoading(true);
    const { data: pkgs, error } = await supabase
      .from("rolos_packages")
      .select("*")
      .eq("property_id", propertyId)
      .order("display_order")
      .order("name");
    if (error) toast.error(error.message);
    const list = (pkgs || []) as RolosPackage[];
    setPackages(list);
    if (list.length) {
      const { data: comps } = await supabase
        .from("rolos_package_components")
        .select("*")
        .in("package_id", list.map((p) => p.id))
        .order("display_order");
      setComponents((comps || []) as RolosPackageComponent[]);
    } else {
      setComponents([]);
    }
    setLoading(false);
  }, [propertyId]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  const componentsFor = useCallback(
    (packageId: string) => components.filter((c) => c.package_id === packageId),
    [components],
  );

  const openDialog = (pkg?: RolosPackage) => {
    if (pkg) {
      setEditing(pkg);
      setForm({
        name: pkg.name,
        code: pkg.code || "",
        description: pkg.description || "",
        base_rate_plan_id: pkg.base_rate_plan_id || "",
        min_nights: String(pkg.min_nights ?? 0),
        max_nights: String(pkg.max_nights ?? 0),
        sell_standalone: pkg.sell_standalone,
        is_active: pkg.is_active,
      });
      const existing = componentsFor(pkg.id);
      setDrafts(
        existing.length
          ? existing.map((c) => ({
              id: c.id,
              name: c.name,
              component_type: c.component_type,
              value_type: c.value_type,
              amount: String(c.amount ?? ""),
              revenue_stream: c.revenue_stream,
              quantity_basis: c.quantity_basis,
              quantity: String(c.quantity ?? 1),
              is_included_in_rate: c.is_included_in_rate,
            }))
          : [emptyComponent()],
      );
    } else {
      setEditing(null);
      setForm({ name: "", code: "", description: "", base_rate_plan_id: "", min_nights: "0", max_nights: "0", sell_standalone: false, is_active: true });
      setDrafts([emptyComponent()]);
    }
    setDialogOpen(true);
  };

  const updateDraft = (index: number, patch: Partial<ComponentDraft>) => {
    setDrafts((prev) => prev.map((d, i) => (i === index ? { ...d, ...patch } : d)));
  };

  const previewLines = useMemo(
    () =>
      expandPackage(
        drafts
          .filter((d) => d.name && d.amount)
          .map((d, i) => ({
            id: d.id || `draft-${i}`,
            package_id: "preview",
            name: d.name,
            component_type: d.component_type,
            value_type: d.value_type,
            amount: parseFloat(d.amount) || 0,
            revenue_stream: d.revenue_stream,
            quantity_basis: d.quantity_basis,
            quantity: parseFloat(d.quantity) || 1,
            is_included_in_rate: d.is_included_in_rate,
            description: null,
            display_order: i,
          })),
        { subtotal: 1000, nights: 2, rooms: 1, adults: 2, children: 0 },
      ),
    [drafts],
  );

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error("Package name is required"); return; }
    const valid = drafts.filter((d) => d.name.trim() && d.amount !== "");
    if (!valid.length) { toast.error("Add at least one package component"); return; }

    setSaving(true);
    const payload = {
      property_id: propertyId,
      name: form.name.trim(),
      code: form.code.trim() || null,
      description: form.description.trim() || null,
      base_rate_plan_id: form.base_rate_plan_id || null,
      min_nights: parseInt(form.min_nights) || 0,
      max_nights: parseInt(form.max_nights) || 0,
      sell_standalone: form.sell_standalone,
      is_active: form.is_active,
    };

    let packageId = editing?.id || "";
    if (editing) {
      const { error } = await supabase.from("rolos_packages").update(payload).eq("id", editing.id);
      if (error) { toast.error(error.message); setSaving(false); return; }
    } else {
      const { data, error } = await supabase.from("rolos_packages").insert(payload).select("id").single();
      if (error || !data) { toast.error(error?.message || "Could not create package"); setSaving(false); return; }
      packageId = data.id;
    }

    await supabase.from("rolos_package_components").delete().eq("package_id", packageId);
    const { error: compErr } = await supabase.from("rolos_package_components").insert(
      valid.map((d, i) => ({
        package_id: packageId,
        name: d.name.trim(),
        component_type: d.component_type,
        value_type: d.value_type,
        amount: parseFloat(d.amount) || 0,
        revenue_stream: d.revenue_stream,
        quantity_basis: d.quantity_basis,
        quantity: parseFloat(d.quantity) || 1,
        is_included_in_rate: d.is_included_in_rate,
        display_order: i,
      })),
    );
    setSaving(false);
    if (compErr) { toast.error("Package saved but components failed: " + compErr.message); return; }
    toast.success(editing ? "Package updated" : "Package created");
    setDialogOpen(false);
    void fetchData();
  };

  const toggleActive = async (pkg: RolosPackage) => {
    const { error } = await supabase.from("rolos_packages").update({ is_active: !pkg.is_active }).eq("id", pkg.id);
    if (error) { toast.error(error.message); return; }
    void fetchData();
  };

  const remove = async (pkg: RolosPackage) => {
    const { error } = await supabase.from("rolos_packages").delete().eq("id", pkg.id);
    if (error) { toast.error(error.message); return; }
    toast.success(`Package "${pkg.name}" deleted`);
    void fetchData();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <PackageIcon className="h-4 w-4" /> Packages
          </h3>
          <p className="text-sm text-muted-foreground">
            Bundle accommodation with extras. Components post to the folio already split by revenue stream.
          </p>
        </div>
        {!readOnly && (
          <Button size="sm" onClick={() => openDialog()}>
            <Plus className="h-4 w-4 mr-1" /> New Package
          </Button>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading packages…</p>
      ) : packages.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">No packages yet for this property.</p>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {packages.map((pkg) => {
            const comps = componentsFor(pkg.id);
            return (
              <Card key={pkg.id} className={`group ${pkg.is_active ? "" : "opacity-50"}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base">{pkg.name}</CardTitle>
                    <div className="flex items-center gap-1">
                      {!readOnly && (
                        <>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openDialog(pkg)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => remove(pkg)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                          <Switch checked={pkg.is_active} onCheckedChange={() => toggleActive(pkg)} />
                        </>
                      )}
                    </div>
                  </div>
                  {pkg.code && <p className="text-xs font-mono text-muted-foreground">{pkg.code}</p>}
                </CardHeader>
                <CardContent className="space-y-2">
                  {pkg.description && <p className="text-sm text-muted-foreground">{pkg.description}</p>}
                  <div className="flex flex-wrap gap-1">
                    {pkg.sell_standalone && <Badge variant="outline" className="text-xs">Sold standalone</Badge>}
                    {pkg.min_nights > 0 && <Badge variant="outline" className="text-xs">Min {pkg.min_nights}n</Badge>}
                    {pkg.max_nights > 0 && <Badge variant="outline" className="text-xs">Max {pkg.max_nights}n</Badge>}
                  </div>
                  <Separator />
                  {comps.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">No components</p>
                  ) : (
                    <ul className="space-y-1 text-xs">
                      {comps.map((c) => (
                        <li key={c.id} className="flex items-center justify-between gap-2">
                          <span className="truncate">{c.name}</span>
                          <span className="flex items-center gap-1 shrink-0 text-muted-foreground">
                            <Badge variant="secondary" className="text-[10px]">{getRevenueStreamLabel(c.revenue_stream)}</Badge>
                            {c.value_type === "percentage" ? `${c.amount}%` : `R${Number(c.amount).toLocaleString()}`}
                            {c.is_included_in_rate && <Badge variant="outline" className="text-[10px]">incl.</Badge>}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${editing.name}` : "New Package"}</DialogTitle>
          </DialogHeader>

          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Dinner, Bed & Breakfast" />
            </div>
            <div className="space-y-1.5">
              <Label>Code</Label>
              <Input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} placeholder="DBB" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Description</Label>
              <Textarea rows={2} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Base rate plan</Label>
              <Select value={form.base_rate_plan_id || "none"} onValueChange={(v) => setForm((f) => ({ ...f, base_rate_plan_id: v === "none" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {ratePlans.map((rp) => <SelectItem key={rp.id} value={rp.id}>{rp.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Min nights</Label>
                <Input type="number" min={0} value={form.min_nights} onChange={(e) => setForm((f) => ({ ...f, min_nights: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Max nights</Label>
                <Input type="number" min={0} value={form.max_nights} onChange={(e) => setForm((f) => ({ ...f, max_nights: e.target.value }))} />
              </div>
            </div>
            <div className="flex items-center gap-2 sm:col-span-2">
              <Switch checked={form.sell_standalone} onCheckedChange={(v) => setForm((f) => ({ ...f, sell_standalone: v }))} />
              <Label className="font-normal">Can be sold on its own (not tied to a rate plan)</Label>
            </div>
          </div>

          <Separator />

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">Components</Label>
              <Button size="sm" variant="outline" onClick={() => setDrafts((prev) => [...prev, emptyComponent()])}>
                <Plus className="h-4 w-4 mr-1" /> Add component
              </Button>
            </div>

            {drafts.map((d, i) => (
              <div key={i} className="rounded-lg border p-3 space-y-3">
                <div className="grid sm:grid-cols-3 gap-2">
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label className="text-xs">Label</Label>
                    <Input value={d.name} onChange={(e) => updateDraft(i, { name: e.target.value })} placeholder="Breakfast" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Type</Label>
                    <Select
                      value={d.component_type}
                      onValueChange={(v) => updateDraft(i, {
                        component_type: v as PackageComponentType,
                        revenue_stream: defaultStreamForType(v as PackageComponentType),
                      })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(Object.keys(COMPONENT_TYPE_LABELS) as PackageComponentType[]).map((t) => (
                          <SelectItem key={t} value={t}>{COMPONENT_TYPE_LABELS[t]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid sm:grid-cols-4 gap-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Value type</Label>
                    <Select value={d.value_type} onValueChange={(v) => updateDraft(i, { value_type: v as PackageValueType })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="amount">Fixed amount</SelectItem>
                        <SelectItem value="percentage">% of accommodation</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">{d.value_type === "percentage" ? "Percent" : "Amount"}</Label>
                    <Input type="number" step="0.01" value={d.amount} onChange={(e) => updateDraft(i, { amount: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Basis</Label>
                    <Select
                      value={d.quantity_basis}
                      onValueChange={(v) => updateDraft(i, { quantity_basis: v as PackageQuantityBasis })}
                      disabled={d.value_type === "percentage"}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(Object.keys(QUANTITY_BASIS_LABELS) as PackageQuantityBasis[]).map((b) => (
                          <SelectItem key={b} value={b}>{QUANTITY_BASIS_LABELS[b]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Revenue stream</Label>
                    <Select value={d.revenue_stream} onValueChange={(v) => updateDraft(i, { revenue_stream: v as RevenueStream })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="accommodation">Accommodation</SelectItem>
                        <SelectItem value="fnb">F&amp;B</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Switch checked={d.is_included_in_rate} onCheckedChange={(v) => updateDraft(i, { is_included_in_rate: v })} />
                    <Label className="font-normal text-xs">Already included in the rate (split only, not added on top)</Label>
                  </div>
                  {drafts.length > 1 && (
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDrafts((prev) => prev.filter((_, idx) => idx !== i))}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}

            {previewLines.length > 0 && (
              <div className="rounded-lg bg-muted p-3 text-xs space-y-1">
                <p className="font-semibold">Preview — 2 nights, 2 guests, R1 000 accommodation</p>
                {previewLines.map((l, i) => (
                  <div key={i} className="flex justify-between">
                    <span>{l.name} <span className="text-muted-foreground">({l.breakdown}{l.includedInRate ? ", included" : ""})</span></span>
                    <span>R{l.amount.toLocaleString()}</span>
                  </div>
                ))}
                <Separator className="my-1" />
                <div className="flex justify-between font-semibold">
                  <span>Added on top</span>
                  <span>R{packageAddOnTotal(previewLines).toLocaleString()}</span>
                </div>
                <div className="text-muted-foreground">
                  Split — Accommodation R{packageStreamTotals(previewLines).accommodation.toLocaleString()} · F&amp;B R{packageStreamTotals(previewLines).fnb.toLocaleString()} · Other R{packageStreamTotals(previewLines).other.toLocaleString()}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : editing ? "Save changes" : "Create package"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
