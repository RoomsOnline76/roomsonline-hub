import { useEffect, useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Archive, ArchiveRestore, Trash2, Loader2 } from "lucide-react";
import { callPmsApi } from "@/hooks/usePmsApi";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface EditableGuest {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  nationality?: string | null;
  notes?: string | null;
  tags: string[];
  is_blacklisted: boolean;
  is_archived?: boolean;
}

interface GuestEditDialogProps {
  guest: EditableGuest | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after any successful write so the caller can refetch. */
  onSaved: () => void;
  /** Called after a permanent delete so the caller can close detail views. */
  onDeleted?: (guestId: string) => void;
}

const VIP_TAG = "VIP";

/** Edit, archive/restore and (when no bookings exist) delete a guest profile. */
export function GuestEditDialog({ guest, open, onOpenChange, onSaved, onDeleted }: GuestEditDialogProps) {
  const [form, setForm] = useState({
    full_name: "", email: "", phone: "", nationality: "", notes: "",
    vip: false, blacklisted: false,
  });
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<"archive" | "delete" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [bookingCount, setBookingCount] = useState<number | null>(null);

  useEffect(() => {
    if (!guest || !open) return;
    setForm({
      full_name: guest.full_name || "",
      email: guest.email || "",
      phone: guest.phone || "",
      nationality: guest.nationality || "",
      notes: guest.notes || "",
      vip: (guest.tags || []).some((t) => t.toLowerCase() === "vip"),
      blacklisted: !!guest.is_blacklisted,
    });
    setConfirmText("");
    setBookingCount(null);
  }, [guest, open]);

  /** Count booking history so delete can be refused before we call the API. */
  const loadBookingCount = useCallback(async (guestId: string): Promise<number> => {
    const { count, error } = await supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("rolos_guest_id", guestId);
    if (error) throw new Error(error.message);
    const total = count || 0;
    setBookingCount(total);
    return total;
  }, []);

  const handleSave = useCallback(async () => {
    if (!guest) return;
    const name = form.full_name.trim();
    if (!name) { toast.error("Full name is required"); return; }
    setSaving(true);
    try {
      const nextTags = (guest.tags || []).filter((t) => t.toLowerCase() !== "vip");
      if (form.vip) nextTags.push(VIP_TAG);
      const res = await callPmsApi("update_guest_profile", {
        guest_id: guest.id,
        full_name: name,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        nationality: form.nationality.trim() || null,
        notes: form.notes.trim() || null,
        tags: nextTags,
        is_blacklisted: form.blacklisted,
      });
      if (!res.success) throw new Error(res.error?.message || "Save failed");
      toast.success("Guest updated");
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save guest");
    }
    setSaving(false);
  }, [guest, form, onSaved, onOpenChange]);

  const handleArchiveToggle = useCallback(async () => {
    if (!guest) return;
    const archiving = !guest.is_archived;
    setBusy("archive");
    try {
      const res = await callPmsApi("update_guest_profile", { guest_id: guest.id, is_archived: archiving });
      if (!res.success) throw new Error(res.error?.message || "Archive failed");
      toast.success(archiving ? "Guest archived" : "Guest restored");
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to archive guest");
    }
    setBusy(null);
  }, [guest, onSaved, onOpenChange]);

  const openDeleteFlow = useCallback(async () => {
    if (!guest) return;
    setBusy("delete");
    try {
      const total = await loadBookingCount(guest.id);
      if (total > 0) {
        toast.error(`${total} booking${total === 1 ? "" : "s"} on record — archive this guest instead of deleting.`);
      } else {
        setConfirmDelete(true);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not check booking history");
    }
    setBusy(null);
  }, [guest, loadBookingCount]);

  const handleDelete = useCallback(async () => {
    if (!guest) return;
    setBusy("delete");
    try {
      const res = await callPmsApi("delete_guest_profile", { guest_id: guest.id });
      if (!res.success) throw new Error(res.error?.message || "Delete failed");
      toast.success("Guest deleted");
      setConfirmDelete(false);
      onDeleted?.(guest.id);
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete guest");
    }
    setBusy(null);
  }, [guest, onSaved, onOpenChange, onDeleted]);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit guest</DialogTitle>
            <DialogDescription>
              Contact details and flags. Stay counts and amounts are derived from bookings and cannot be edited.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <Label htmlFor="guest-name">Full name *</Label>
              <Input id="guest-name" value={form.full_name} onChange={(e) => setForm((p) => ({ ...p, full_name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="guest-email">Email</Label>
                <Input id="guest-email" type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} />
              </div>
              <div>
                <Label htmlFor="guest-phone">Phone</Label>
                <Input id="guest-phone" value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label htmlFor="guest-nationality">Nationality</Label>
              <Input id="guest-nationality" value={form.nationality} onChange={(e) => setForm((p) => ({ ...p, nationality: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="guest-notes">Notes</Label>
              <Textarea id="guest-notes" rows={3} value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <Label htmlFor="guest-vip" className="cursor-pointer">VIP</Label>
              <Switch id="guest-vip" checked={form.vip} onCheckedChange={(v) => setForm((p) => ({ ...p, vip: v }))} />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <Label htmlFor="guest-blacklist" className="cursor-pointer">Blacklisted</Label>
              <Switch id="guest-blacklist" checked={form.blacklisted} onCheckedChange={(v) => setForm((p) => ({ ...p, blacklisted: v }))} />
            </div>
            {bookingCount !== null && bookingCount > 0 && (
              <p className="text-xs text-muted-foreground">
                {bookingCount} booking{bookingCount === 1 ? "" : "s"} on record — this guest can be archived but not deleted.
              </p>
            )}
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleArchiveToggle} disabled={!!busy || saving}>
                {busy === "archive" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : guest?.is_archived
                  ? <ArchiveRestore className="h-4 w-4 mr-2" />
                  : <Archive className="h-4 w-4 mr-2" />}
                {guest?.is_archived ? "Restore" : "Archive"}
              </Button>
              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={openDeleteFlow} disabled={!!busy || saving}>
                {busy === "delete" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
                Delete
              </Button>
            </div>
            <Button onClick={handleSave} disabled={saving || !!busy}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={(o) => { setConfirmDelete(o); if (!o) setConfirmText(""); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {guest?.full_name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the profile and its comments. It has no bookings, so no history is lost.
              Type DELETE to confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="DELETE" />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={confirmText.trim().toUpperCase() !== "DELETE" || busy === "delete"}
              onClick={(e) => { e.preventDefault(); handleDelete(); }}
            >
              Delete permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
