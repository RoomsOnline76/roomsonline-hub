import { useCallback, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Plus, Pencil, Trash2, Gift } from "lucide-react";
import { toast } from "sonner";

interface PartnerOffer {
  id: string;
  partner_name: string;
  title: string;
  description: string | null;
  redemption_instructions: string | null;
  redemption_code: string | null;
  partner_url: string | null;
  partner_contact: string | null;
  image_url: string | null;
  valid_from: string | null;
  valid_until: string | null;
  max_redemptions: number | null;
  current_redemptions: number | null;
  min_nights: number | null;
  is_active: boolean | null;
}

interface FormState {
  partner_name: string;
  title: string;
  description: string;
  redemption_instructions: string;
  redemption_code: string;
  partner_url: string;
  partner_contact: string;
  image_url: string;
  valid_from: string;
  valid_until: string;
  max_redemptions: string;
  min_nights: string;
}

const emptyForm: FormState = {
  partner_name: "",
  title: "",
  description: "",
  redemption_instructions: "",
  redemption_code: "",
  partner_url: "",
  partner_contact: "",
  image_url: "",
  valid_from: "",
  valid_until: "",
  max_redemptions: "",
  min_nights: "",
};

export function PartnerOffersTab({ propertyId }: { propertyId: string }) {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  const queryKey = useMemo(() => ["property_partner_offers", propertyId], [propertyId]);

  const { data: offers = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("property_partner_offers")
        .select("*")
        .eq("property_id", propertyId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as PartnerOffer[];
    },
    enabled: !!propertyId,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.partner_name.trim() || !form.title.trim()) {
        throw new Error("Partner name and offer title are required");
      }
      const payload = {
        property_id: propertyId,
        partner_name: form.partner_name.trim(),
        title: form.title.trim(),
        description: form.description.trim() || null,
        redemption_instructions: form.redemption_instructions.trim() || null,
        redemption_code: form.redemption_code.trim() || null,
        partner_url: form.partner_url.trim() || null,
        partner_contact: form.partner_contact.trim() || null,
        image_url: form.image_url.trim() || null,
        valid_from: form.valid_from || null,
        valid_until: form.valid_until || null,
        max_redemptions: form.max_redemptions ? Number(form.max_redemptions) : null,
        min_nights: form.min_nights ? Number(form.min_nights) : null,
      };

      if (editingId) {
        const { error } = await supabase
          .from("property_partner_offers")
          .update(payload)
          .eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("property_partner_offers").insert([payload]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      setDialogOpen(false);
      setEditingId(null);
      setForm(emptyForm);
      toast.success(editingId ? "Partner offer updated" : "Partner offer created");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("property_partner_offers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      setDeleteId(null);
      toast.success("Partner offer deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("property_partner_offers")
        .update({ is_active })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
    onError: (e: Error) => toast.error(e.message),
  });

  const openEdit = useCallback((o: PartnerOffer) => {
    setForm({
      partner_name: o.partner_name,
      title: o.title,
      description: o.description || "",
      redemption_instructions: o.redemption_instructions || "",
      redemption_code: o.redemption_code || "",
      partner_url: o.partner_url || "",
      partner_contact: o.partner_contact || "",
      image_url: o.image_url || "",
      valid_from: o.valid_from || "",
      valid_until: o.valid_until || "",
      max_redemptions: o.max_redemptions != null ? String(o.max_redemptions) : "",
      min_nights: o.min_nights != null ? String(o.min_nights) : "",
    });
    setEditingId(o.id);
    setDialogOpen(true);
  }, []);

  const openNew = useCallback(() => {
    setForm(emptyForm);
    setEditingId(null);
    setDialogOpen(true);
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase text-muted-foreground">Partner / affiliate offers</h3>
        <Button size="sm" className="h-7 text-xs" onClick={openNew}>
          <Plus className="mr-1 h-3 w-3" /> Add offer
        </Button>
      </div>

      <Alert className="py-2">
        <Gift className="h-3.5 w-3.5" />
        <AlertDescription className="text-[11px] leading-tight">
          Perks from partners you are affiliated with (wine tasting, spa, restaurant credit, tours).
          They never discount the stay and never appear at checkout — they are revealed as a surprise
          once the booking is paid, in the journey brochure, the confirmation email and the guest portal.
          Only add a redemption code if the partner actually issued one.
        </AlertDescription>
      </Alert>

      {isLoading ? (
        <p className="py-4 text-center text-xs text-muted-foreground">Loading…</p>
      ) : offers.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">
          No partner offers yet. Click "Add offer" to load one.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Partner</TableHead>
              <TableHead className="text-xs">Offer</TableHead>
              <TableHead className="text-xs">Code</TableHead>
              <TableHead className="text-xs">Valid</TableHead>
              <TableHead className="text-center text-xs">Min nights</TableHead>
              <TableHead className="text-center text-xs">Used</TableHead>
              <TableHead className="text-center text-xs">Max</TableHead>
              <TableHead className="text-center text-xs">Active</TableHead>
              <TableHead className="w-20 text-xs" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {offers.map((o) => (
              <TableRow key={o.id}>
                <TableCell className="text-xs font-medium">{o.partner_name}</TableCell>
                <TableCell className="text-xs">{o.title}</TableCell>
                <TableCell className="font-mono text-xs">{o.redemption_code || "—"}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {o.valid_from && o.valid_until
                    ? `${o.valid_from} – ${o.valid_until}`
                    : o.valid_from || o.valid_until || "Always"}
                </TableCell>
                <TableCell className="text-center text-xs">{o.min_nights ?? "—"}</TableCell>
                <TableCell className="text-center text-xs">{o.current_redemptions ?? 0}</TableCell>
                <TableCell className="text-center text-xs">{o.max_redemptions ?? "∞"}</TableCell>
                <TableCell className="text-center">
                  <Switch
                    checked={o.is_active ?? true}
                    onCheckedChange={(v) => toggleActive.mutate({ id: o.id, is_active: v })}
                    className="scale-75"
                  />
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => openEdit(o)}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0 text-destructive"
                      onClick={() => setDeleteId(o.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sm">
              {editingId ? "Edit partner offer" : "New partner offer"}
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[65vh] space-y-3 overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Partner name *</Label>
                <Input
                  value={form.partner_name}
                  onChange={(e) => setForm({ ...form, partner_name: e.target.value })}
                  placeholder="e.g. Boschendal Wine Estate"
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Offer title *</Label>
                <Input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="e.g. Complimentary wine tasting for two"
                  className="h-8 text-xs"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">What the guest receives</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Describe the perk in guest-facing language."
                className="min-h-[60px] text-xs"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">How to redeem</Label>
              <Textarea
                value={form.redemption_instructions}
                onChange={(e) => setForm({ ...form, redemption_instructions: e.target.value })}
                placeholder="e.g. Show your booking confirmation at the tasting room, Wed–Sun 10:00–16:00."
                className="min-h-[60px] text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Partner redemption code</Label>
                <Input
                  value={form.redemption_code}
                  onChange={(e) => setForm({ ...form, redemption_code: e.target.value })}
                  placeholder="Only if the partner issued one"
                  className="h-8 font-mono text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Partner link</Label>
                <Input
                  value={form.partner_url}
                  onChange={(e) => setForm({ ...form, partner_url: e.target.value })}
                  placeholder="https://…"
                  className="h-8 text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Partner contact</Label>
                <Input
                  value={form.partner_contact}
                  onChange={(e) => setForm({ ...form, partner_contact: e.target.value })}
                  placeholder="Phone or email for bookings"
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Image URL</Label>
                <Input
                  value={form.image_url}
                  onChange={(e) => setForm({ ...form, image_url: e.target.value })}
                  placeholder="Optional"
                  className="h-8 text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Valid from</Label>
                <Input
                  type="date"
                  value={form.valid_from}
                  onChange={(e) => setForm({ ...form, valid_from: e.target.value })}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Valid until</Label>
                <Input
                  type="date"
                  value={form.valid_until}
                  onChange={(e) => setForm({ ...form, valid_until: e.target.value })}
                  className="h-8 text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Max redemptions</Label>
                <Input
                  type="number"
                  min="0"
                  value={form.max_redemptions}
                  onChange={(e) => setForm({ ...form, max_redemptions: e.target.value })}
                  placeholder="Unlimited"
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Minimum nights to qualify</Label>
                <Input
                  type="number"
                  min="0"
                  value={form.min_nights}
                  onChange={(e) => setForm({ ...form, min_nights: e.target.value })}
                  placeholder="Any stay"
                  className="h-8 text-xs"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs"
              disabled={saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              {saveMutation.isPending ? "Saving…" : editingId ? "Save changes" : "Create offer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm">Delete this partner offer?</AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              Guests with existing bookings will no longer see it in new brochures or emails.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-7 text-xs">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="h-7 text-xs"
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default PartnerOffersTab;
