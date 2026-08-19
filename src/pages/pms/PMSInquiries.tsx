import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePmsPropertyId } from "@/hooks/usePmsPropertyId";
import {
  useInquiries,
  useInquiryEvents,
  INQUIRY_STAGES,
  STAGE_LABELS,
  type Inquiry,
  type InquiryStage,
} from "@/hooks/useInquiries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ManualBookingDialog } from "@/components/pms/ManualBookingDialog";
import { InquiryIntakeKeysCard } from "@/components/pms/crm/InquiryIntakeKeysCard";
import { Loader2, Plus, Inbox, Briefcase, User, ArrowRight, Repeat, Clock } from "lucide-react";
import { toast } from "sonner";

/** Days without a booking after which a returning guest counts as lapsed. */
const STAGE_TONE: Record<InquiryStage, string> = {
  new: "bg-primary text-primary-foreground",
  contacted: "bg-secondary text-secondary-foreground",
  quoted: "bg-secondary text-secondary-foreground",
  provisional: "bg-secondary text-secondary-foreground",
  confirmed: "bg-primary text-primary-foreground",
  lost: "bg-muted text-muted-foreground",
};

const emptyDraft = {
  guest_name: "",
  guest_email: "",
  guest_phone: "",
  company_name: "",
  check_in: "",
  check_out: "",
  adults: "2",
  children: "0",
  estimated_value: "",
  notes: "",
};

export default function PMSInquiries() {
  const { propertyId, loading: propertyLoading } = usePmsPropertyId();
  const { inquiries, byStage, openCount, loading, create, update, addNote, reload } =
    useInquiries(propertyId);

  const [newOpen, setNewOpen] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<Inquiry | null>(null);
  const [note, setNote] = useState("");
  const [convertFor, setConvertFor] = useState<Inquiry | null>(null);

  const { events, reload: reloadEvents } = useInquiryEvents(selected?.id ?? null);

  // Minimal room/rate context so a converted inquiry can be booked in place.
  const { data: bookingContext } = useQuery({
    queryKey: ["pms-inquiry-booking-context", propertyId],
    enabled: !!propertyId && !!convertFor,
    queryFn: async () => {
      const [types, rooms, plans] = await Promise.all([
        supabase
          .from("rolos_room_types")
          .select("id, name, base_occupancy, max_occupancy, default_rate")
          .eq("property_id", propertyId as string)
          .eq("is_active", true),
        supabase
          .from("rolos_rooms")
          .select("id, room_number, room_name, room_type_id, status")
          .eq("property_id", propertyId as string),
        supabase
          .from("rolos_rate_plans")
          .select("id, name, base_rate, pricing_model")
          .eq("property_id", propertyId as string)
          .eq("is_active", true),
      ]);
      return {
        roomTypes: types.data || [],
        rooms: rooms.data || [],
        ratePlans: plans.data || [],
      };
    },
  });

  const submitDraft = useCallback(async () => {
    if (!draft.guest_name.trim()) {
      toast.error("A guest name is required");
      return;
    }
    setSaving(true);
    const created = await create({
      guest_name: draft.guest_name.trim(),
      guest_email: draft.guest_email,
      guest_phone: draft.guest_phone,
      company_name: draft.company_name,
      check_in: draft.check_in || undefined,
      check_out: draft.check_out || undefined,
      adults: Number(draft.adults) || 2,
      children: Number(draft.children) || 0,
      estimated_value: draft.estimated_value ? Number(draft.estimated_value) : undefined,
      notes: draft.notes,
    });
    setSaving(false);
    if (created) {
      toast.success("Inquiry captured");
      setDraft(emptyDraft);
      setNewOpen(false);
    }
  }, [draft, create]);

  const moveStage = useCallback(
    async (inquiry: Inquiry, status: InquiryStage) => {
      const ok = await update(inquiry.id, { status });
      if (ok) {
        toast.success(`Moved to ${STAGE_LABELS[status]}`);
        setSelected((prev) => (prev && prev.id === inquiry.id ? { ...prev, status } : prev));
        void reloadEvents();
      }
    },
    [update, reloadEvents],
  );

  const saveNote = useCallback(async () => {
    if (!selected || !note.trim()) return;
    const ok = await addNote(selected.id, note.trim());
    if (ok) {
      setNote("");
      toast.success("Note added");
      void reloadEvents();
    }
  }, [selected, note, addNote, reloadEvents]);

  const linkBooking = useCallback(
    async (bookingId: string) => {
      if (!convertFor) return;
      await update(convertFor.id, { status: "confirmed", linked_booking_id: bookingId });
      await supabase.from("rolos_inquiry_events").insert({
        inquiry_id: convertFor.id,
        event_type: "converted",
        to_status: "confirmed",
        note: "Converted to a booking from the inquiry pipeline",
      });
      toast.success("Inquiry converted to a booking");
      setConvertFor(null);
      setSelected(null);
      void reload();
    },
    [convertFor, update, reload],
  );

  const stats = useMemo(() => {
    const trade = inquiries.filter((i) => i.is_trade).length;
    const awaitingReply = inquiries.filter((i) => i.status === "new" && !i.first_response_at).length;
    return { trade, awaitingReply };
  }, [inquiries]);

  if (propertyLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading…
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Inquiries</h1>
          <p className="text-sm text-muted-foreground">
            Every lead — website, phone, walk-in — from first contact to a confirmed stay.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{openCount} open</Badge>
          {stats.awaitingReply > 0 && (
            <Badge variant="outline" className="gap-1">
              <Clock className="h-3 w-3" /> {stats.awaitingReply} awaiting reply
            </Badge>
          )}
          {stats.trade > 0 && (
            <Badge variant="outline" className="gap-1">
              <Briefcase className="h-3 w-3" /> {stats.trade} trade
            </Badge>
          )}
          <Button onClick={() => setNewOpen(true)} disabled={!propertyId}>
            <Plus className="mr-2 h-4 w-4" /> New inquiry
          </Button>
        </div>
      </header>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading inquiries…
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-6">
          {INQUIRY_STAGES.map((stage) => {
            const items = byStage.get(stage) || [];
            return (
              <section key={stage} className="rounded-lg border border-border bg-card/40 p-2">
                <div className="mb-2 flex items-center justify-between px-1">
                  <h2 className="text-sm font-semibold">{STAGE_LABELS[stage]}</h2>
                  <span className="text-xs text-muted-foreground">{items.length}</span>
                </div>
                <div className="space-y-2">
                  {items.length === 0 ? (
                    <p className="px-1 py-6 text-center text-xs text-muted-foreground">
                      <Inbox className="mx-auto mb-1 h-4 w-4" />
                      Nothing here
                    </p>
                  ) : (
                    items.map((inq) => (
                      <button
                        key={inq.id}
                        type="button"
                        onClick={() => setSelected(inq)}
                        className="w-full rounded-md border border-border bg-background p-2 text-left transition-colors hover:border-primary"
                      >
                        <div className="flex items-center gap-1.5">
                          {inq.is_trade ? (
                            <Briefcase className="h-3 w-3 text-muted-foreground" />
                          ) : (
                            <User className="h-3 w-3 text-muted-foreground" />
                          )}
                          <span className="truncate text-sm font-medium">{inq.guest_name}</span>
                        </div>
                        {inq.check_in && (
                          <p className="text-xs text-muted-foreground">
                            {inq.check_in}
                            {inq.check_out ? ` → ${inq.check_out}` : ""}
                          </p>
                        )}
                        <p className="truncate text-xs text-muted-foreground">
                          {inq.source.replace(/_/g, " ")}
                          {inq.estimated_value ? ` · ${inq.currency} ${inq.estimated_value}` : ""}
                        </p>
                      </button>
                    ))
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <InquiryIntakeKeysCard propertyId={propertyId} />

      {/* ── New inquiry ─────────────────────────────────────── */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>New inquiry</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="inq-name">Guest name *</Label>
              <Input
                id="inq-name"
                value={draft.guest_name}
                onChange={(e) => setDraft((p) => ({ ...p, guest_name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inq-company">Company / agent</Label>
              <Input
                id="inq-company"
                value={draft.company_name}
                onChange={(e) => setDraft((p) => ({ ...p, company_name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inq-email">Email</Label>
              <Input
                id="inq-email"
                type="email"
                value={draft.guest_email}
                onChange={(e) => setDraft((p) => ({ ...p, guest_email: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inq-phone">Phone</Label>
              <Input
                id="inq-phone"
                value={draft.guest_phone}
                onChange={(e) => setDraft((p) => ({ ...p, guest_phone: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inq-in">Arrival</Label>
              <Input
                id="inq-in"
                type="date"
                value={draft.check_in}
                onChange={(e) => setDraft((p) => ({ ...p, check_in: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inq-out">Departure</Label>
              <Input
                id="inq-out"
                type="date"
                value={draft.check_out}
                onChange={(e) => setDraft((p) => ({ ...p, check_out: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inq-adults">Adults</Label>
              <Input
                id="inq-adults"
                type="number"
                min={1}
                value={draft.adults}
                onChange={(e) => setDraft((p) => ({ ...p, adults: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inq-children">Children</Label>
              <Input
                id="inq-children"
                type="number"
                min={0}
                value={draft.children}
                onChange={(e) => setDraft((p) => ({ ...p, children: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inq-value">Estimated value</Label>
              <Input
                id="inq-value"
                type="number"
                min={0}
                value={draft.estimated_value}
                onChange={(e) => setDraft((p) => ({ ...p, estimated_value: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="inq-notes">Notes</Label>
              <Textarea
                id="inq-notes"
                rows={3}
                value={draft.notes}
                onChange={(e) => setDraft((p) => ({ ...p, notes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitDraft} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save inquiry
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Detail ──────────────────────────────────────────── */}
      <Sheet open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              {selected?.guest_name}
              {selected && (
                <Badge className={STAGE_TONE[selected.status]}>{STAGE_LABELS[selected.status]}</Badge>
              )}
            </SheetTitle>
          </SheetHeader>

          {selected && (
            <div className="mt-4 space-y-5">
              <div className="space-y-1 text-sm">
                {selected.company_name && (
                  <p className="flex items-center gap-2">
                    <Briefcase className="h-3.5 w-3.5 text-muted-foreground" />
                    {selected.company_name}
                    <Badge variant="outline">{selected.is_trade ? "Trade" : "Direct"}</Badge>
                  </p>
                )}
                {selected.guest_email && <p>{selected.guest_email}</p>}
                {selected.guest_phone && <p>{selected.guest_phone}</p>}
                {selected.check_in && (
                  <p className="text-muted-foreground">
                    {selected.check_in} → {selected.check_out || "open"} · {selected.adults} adults
                    {selected.children ? `, ${selected.children} children` : ""}
                  </p>
                )}
                <p className="text-muted-foreground">
                  Source: {selected.source.replace(/_/g, " ")} · captured{" "}
                  {new Date(selected.created_at).toLocaleString()}
                </p>
                {selected.notes && <p className="whitespace-pre-wrap pt-2">{selected.notes}</p>}
              </div>

              <div className="space-y-2">
                <Label>Stage</Label>
                <Select
                  value={selected.status}
                  onValueChange={(value) => moveStage(selected, value as InquiryStage)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INQUIRY_STAGES.map((stage) => (
                      <SelectItem key={stage} value={stage}>
                        {STAGE_LABELS[stage]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selected.linked_booking_id ? (
                <p className="flex items-center gap-2 rounded-md border border-border p-3 text-sm text-muted-foreground">
                  <Repeat className="h-4 w-4" /> Already converted to a booking.
                </p>
              ) : (
                <Button className="w-full" onClick={() => setConvertFor(selected)}>
                  Convert to booking <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              )}

              <Separator />

              <div className="space-y-2">
                <Label htmlFor="inq-note">Add a note</Label>
                <Textarea
                  id="inq-note"
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
                <Button size="sm" variant="outline" onClick={saveNote} disabled={!note.trim()}>
                  Save note
                </Button>
              </div>

              <div className="space-y-2">
                <Label>History</Label>
                <div className="space-y-2">
                  {events.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
                  ) : (
                    events.map((event) => (
                      <div key={event.id} className="rounded-md border border-border p-2 text-xs">
                        <p className="font-medium">
                          {event.event_type.replace(/_/g, " ")}
                          {event.to_status ? ` → ${STAGE_LABELS[event.to_status]}` : ""}
                        </p>
                        {event.note && <p className="text-muted-foreground">{event.note}</p>}
                        <p className="text-muted-foreground">
                          {new Date(event.created_at).toLocaleString()}
                          {event.actor_label ? ` · ${event.actor_label}` : ""}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* ── Convert to booking ──────────────────────────────── */}
      {convertFor && propertyId && (
        <ManualBookingDialog
          open={!!convertFor}
          onOpenChange={(open) => !open && setConvertFor(null)}
          propertyId={propertyId}
          roomTypes={bookingContext?.roomTypes || []}
          rooms={bookingContext?.rooms || []}
          ratePlans={bookingContext?.ratePlans || []}
          initialValues={{
            guestName: convertFor.guest_name,
            guestEmail: convertFor.guest_email,
            guestPhone: convertFor.guest_phone,
            notes: convertFor.notes,
            adults: convertFor.adults,
            children: convertFor.children,
            checkIn: convertFor.check_in ? new Date(convertFor.check_in) : null,
            checkOut: convertFor.check_out ? new Date(convertFor.check_out) : null,
          }}
          onCreated={() => void reload()}
          onCreatedBooking={linkBooking}
        />
      )}
    </div>
  );
}
