import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Pencil, Trash2, Copy } from "lucide-react";
import { CopyToPortfolioDialog } from "./CopyToPortfolioDialog";
import { toast } from "sonner";

interface PromoCode {
  id: string;
  code: string;
  discount_type: string;
  discount_value: number;
  description: string | null;
  valid_from: string | null;
  valid_until: string | null;
  max_uses: number | null;
  current_uses: number | null;
  is_active: boolean | null;
  conditions: Record<string, unknown> | null;
}

interface FormState {
  code: string;
  discount_type: string;
  discount_value: string;
  description: string;
  valid_from: string;
  valid_until: string;
  max_uses: string;
  non_refundable: boolean;
  min_nights: string;
}

const emptyForm: FormState = {
  code: "",
  discount_type: "percentage",
  discount_value: "",
  description: "",
  valid_from: "",
  valid_until: "",
  max_uses: "",
  non_refundable: false,
  min_nights: "",
};

export function PromoCodesTab({ propertyId }: { propertyId: string }) {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [copyId, setCopyId] = useState<string | null>(null);
  const [copyAll, setCopyAll] = useState(false);

  const { data: codes = [], isLoading } = useQuery({
    queryKey: ["promo_codes", propertyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("promo_codes")
        .select("*")
        .eq("property_id", propertyId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as PromoCode[];
    },
    enabled: !!propertyId,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const conditions: Record<string, boolean | number> = {};
      if (form.non_refundable) conditions.non_refundable = true;
      if (form.min_nights) conditions.min_nights = Number(form.min_nights);

      const payload = {
        code: form.code.toUpperCase().trim(),
        property_id: propertyId,
        discount_type: form.discount_type,
        discount_value: Number(form.discount_value),
        description: form.description || null,
        valid_from: form.valid_from || null,
        valid_until: form.valid_until || null,
        max_uses: form.max_uses ? Number(form.max_uses) : null,
        conditions: conditions as unknown as import("@/integrations/supabase/types").Json,
      };

      if (editingId) {
        const { error } = await supabase
          .from("promo_codes")
          .update(payload)
          .eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("promo_codes")
          .insert([payload]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["promo_codes", propertyId] });
      setDialogOpen(false);
      setEditingId(null);
      setForm(emptyForm);
      toast.success(editingId ? "Voucher updated" : "Voucher created");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("promo_codes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["promo_codes", propertyId] });
      setDeleteId(null);
      toast.success("Voucher deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("promo_codes")
        .update({ is_active })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["promo_codes", propertyId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  /** Clone the given vouchers onto sibling properties (update-in-place on code match). */
  const copyToProperties = async (rows: PromoCode[], targetIds: string[]) => {
    for (const targetId of targetIds) {
      const { data: existing, error: readErr } = await supabase
        .from("promo_codes")
        .select("id, code")
        .eq("property_id", targetId);
      if (readErr) throw readErr;
      const byCode = new Map((existing || []).map((e) => [e.code, e.id]));

      for (const c of rows) {
        const payload = {
          code: c.code,
          property_id: targetId,
          discount_type: c.discount_type,
          discount_value: c.discount_value,
          description: c.description,
          valid_from: c.valid_from,
          valid_until: c.valid_until,
          max_uses: c.max_uses,
          is_active: c.is_active ?? true,
          conditions: (c.conditions ?? {}) as unknown as import("@/integrations/supabase/types").Json,
        };
        const existingId = byCode.get(c.code);
        if (existingId) {
          const { error } = await supabase.from("promo_codes").update(payload).eq("id", existingId);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("promo_codes").insert([payload]);
          if (error) throw error;
        }
      }
    }
    toast.success(
      `${rows.length} voucher${rows.length === 1 ? "" : "s"} copied to ${targetIds.length} propert${targetIds.length === 1 ? "y" : "ies"}`,
    );
  };

  const copyRows = copyAll ? codes : codes.filter((c) => c.id === copyId);

  const openEdit = (c: PromoCode) => {
    const cond = (c.conditions || {}) as Record<string, unknown>;
    setForm({
      code: c.code,
      discount_type: c.discount_type,
      discount_value: String(c.discount_value),
      description: c.description || "",
      valid_from: c.valid_from || "",
      valid_until: c.valid_until || "",
      max_uses: c.max_uses != null ? String(c.max_uses) : "",
      non_refundable: !!cond.non_refundable,
      min_nights: cond.min_nights ? String(cond.min_nights) : "",
    });
    setEditingId(c.id);
    setDialogOpen(true);
  };

  const openNew = () => {
    setForm(emptyForm);
    setEditingId(null);
    setDialogOpen(true);
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase">Voucher Codes</h3>
        <div className="flex items-center gap-1">
          {codes.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => {
                setCopyAll(true);
                setCopyId(null);
              }}
            >
              <Copy className="h-3 w-3 mr-1" /> Copy all to portfolio
            </Button>
          )}
          <Button size="sm" className="h-7 text-xs" onClick={openNew}>
            <Plus className="h-3 w-3 mr-1" /> Add Voucher
          </Button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground text-center py-4">Loading…</p>
      ) : codes.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-6">No voucher codes yet. Click "Add Voucher" to create one.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Code</TableHead>
              <TableHead className="text-xs">Discount</TableHead>
              <TableHead className="text-xs">Valid</TableHead>
              <TableHead className="text-xs text-center">Used</TableHead>
              <TableHead className="text-xs text-center">Max</TableHead>
              <TableHead className="text-xs text-center">Active</TableHead>
              <TableHead className="text-xs w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {codes.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="text-xs font-mono font-medium">{c.code}</TableCell>
                <TableCell className="text-xs">
                  {c.discount_type === "percentage" ? `${c.discount_value}%` : `R ${c.discount_value}`}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {c.valid_from && c.valid_until
                    ? `${c.valid_from} – ${c.valid_until}`
                    : c.valid_from || c.valid_until || "Always"}
                </TableCell>
                <TableCell className="text-xs text-center">{c.current_uses ?? 0}</TableCell>
                <TableCell className="text-xs text-center">{c.max_uses ?? "∞"}</TableCell>
                <TableCell className="text-center">
                  <Switch
                    checked={c.is_active ?? true}
                    onCheckedChange={(v) => toggleActive.mutate({ id: c.id, is_active: v })}
                    className="scale-75"
                  />
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => openEdit(c)}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0"
                      title="Copy to portfolio"
                      onClick={() => {
                        setCopyAll(false);
                        setCopyId(c.id);
                      }}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive" onClick={() => setDeleteId(c.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Copy to portfolio */}
      <CopyToPortfolioDialog
        open={copyAll || !!copyId}
        onOpenChange={(o) => {
          if (!o) {
            setCopyAll(false);
            setCopyId(null);
          }
        }}
        propertyId={propertyId}
        itemLabel={copyAll ? `${codes.length} vouchers` : (copyRows[0]?.code ?? "this voucher")}
        title="Copy vouchers to portfolio"
        onCopy={async (ids) => {
          await copyToProperties(copyRows, ids);
        }}
      />

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">{editingId ? "Edit Voucher" : "New Voucher"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Code *</Label>
                <Input
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                  placeholder="e.g. SUMMER20"
                  className="h-8 text-xs font-mono"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Discount Type</Label>
                <Select value={form.discount_type} onValueChange={(v) => setForm({ ...form, discount_type: v })}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage" className="text-xs">Percentage (%)</SelectItem>
                    <SelectItem value="fixed" className="text-xs">Fixed Amount (R)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">
                  Discount Value {form.discount_type === "percentage" ? "(%)" : "(R)"}
                </Label>
                <Input
                  type="number"
                  value={form.discount_value}
                  onChange={(e) => setForm({ ...form, discount_value: e.target.value })}
                  className="h-8 text-xs"
                  min="0"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Max Uses</Label>
                <Input
                  type="number"
                  value={form.max_uses}
                  onChange={(e) => setForm({ ...form, max_uses: e.target.value })}
                  placeholder="Unlimited"
                  className="h-8 text-xs"
                  min="0"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Description</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="e.g. Non-refundable 15% discount"
                className="h-8 text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Valid From</Label>
                <Input
                  type="date"
                  value={form.valid_from}
                  onChange={(e) => setForm({ ...form, valid_from: e.target.value })}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Valid Until</Label>
                <Input
                  type="date"
                  value={form.valid_until}
                  onChange={(e) => setForm({ ...form, valid_until: e.target.value })}
                  className="h-8 text-xs"
                />
              </div>
            </div>

            <div className="space-y-2 pt-1">
              <Label className="text-xs font-semibold">Conditions</Label>
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={form.non_refundable}
                  onCheckedChange={(v) => setForm({ ...form, non_refundable: !!v })}
                />
                <Label className="text-xs">Non-refundable booking</Label>
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs">Min nights:</Label>
                <Input
                  type="number"
                  value={form.min_nights}
                  onChange={(e) => setForm({ ...form, min_nights: e.target.value })}
                  className="h-7 text-xs w-20"
                  min="0"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" className="text-xs" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="text-xs"
              onClick={() => saveMutation.mutate()}
              disabled={!form.code || !form.discount_value || saveMutation.isPending}
            >
              {saveMutation.isPending ? "Saving…" : editingId ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Voucher?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteMutation.mutate(deleteId)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
