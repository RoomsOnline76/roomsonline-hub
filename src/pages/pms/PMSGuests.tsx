import { useEffect, useState, useCallback, useRef } from "react";
import { usePmsPropertyId } from "@/hooks/usePmsPropertyId";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Search, Users, Mail, Phone, CalendarDays, AlertCircle } from "lucide-react";
import { callPmsApi } from "@/hooks/usePmsApi";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Guest {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  total_stays: number;
  total_spent: number;
  tags: string[];
  is_blacklisted: boolean;
  last_stay_date: string | null;
  complaints?: any[];
}

interface GuestBooking {
  id: string;
  check_in_date: string;
  check_out_date: string;
  status: string;
  total_price: number;
  special_requests: string | null;
  booking_channel: string | null;
}

export default function PMSGuests() {
  const { propertyId, properties, portfolioProperties, showPortfolioToggle, switchProperty, loading: propertyLoading } = usePmsPropertyId();
  const [viewMode, setViewMode] = useState<"portfolio" | "single">(() =>
    (portfolioProperties && portfolioProperties.length > 1) ? "portfolio" : "single"
  );
  const [guests, setGuests] = useState<Guest[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ full_name: "", email: "", phone: "" });
  const [selectedGuest, setSelectedGuest] = useState<Guest | null>(null);
  const [guestBookings, setGuestBookings] = useState<GuestBooking[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(timer);
  }, [search]);

  // Default to portfolio when multiple properties become available
  const didAutoPortfolio = useRef(false);
  useEffect(() => {
    if (!didAutoPortfolio.current && portfolioProperties && portfolioProperties.length > 1) {
      didAutoPortfolio.current = true;
      setViewMode("portfolio");
    }
  }, [portfolioProperties]);


  const activeIds = (viewMode === "portfolio" && portfolioProperties?.length)
    ? portfolioProperties.map(p => p.id)
    : (propertyId ? [propertyId] : []);

  const fetchGuests = useCallback(async () => {
    setLoading(true);
    try {
      let q = supabase
        .from("rolos_guest_profiles")
        .select("id, full_name, email, phone, total_stays, total_spent, tags, is_blacklisted, last_stay_date, property_id")
        .order("last_stay_date", { ascending: false, nullsFirst: false })
        .limit(1000);

      // In single-property mode, scope to that property. In portfolio mode
      // show every guest the user can read (RLS handles authorisation), so
      // guests created in manual bookings — or imported under a sibling
      // property — still appear without forcing a search.
      if (viewMode === "single" && propertyId) {
        q = q.eq("property_id", propertyId);
      }

      if (debouncedSearch) {
        q = q.or(`full_name.ilike.%${debouncedSearch}%,email.ilike.%${debouncedSearch}%,phone.ilike.%${debouncedSearch}%`);
      }
      const { data, error } = await q;
      if (error) throw error;
      setGuests((data || []) as Guest[]);
    } catch (e: any) {
      toast.error(e.message || "Failed to load guests");
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId, debouncedSearch, viewMode, portfolioProperties]);


  useEffect(() => { fetchGuests(); }, [fetchGuests]);

  const handleCreate = async () => {
    const targetPropertyId = propertyId || activeIds[0];
    if (!targetPropertyId || !form.full_name) return;
    try {
      const res = await callPmsApi("create_guest_profile", {
        propertyId: targetPropertyId, full_name: form.full_name, email: form.email || null, phone: form.phone || null,
      });
      if (res.success) { toast.success("Guest added"); setDialogOpen(false); setForm({ full_name: "", email: "", phone: "" }); fetchGuests(); }
    } catch (e: any) { toast.error(e.message); }
  };

  const openGuestDetail = async (guest: Guest) => {
    setSelectedGuest(guest);
    setLoadingHistory(true);
    // Fetch bookings for this guest
    const { data } = await supabase.from("bookings")
      .select("id, check_in_date, check_out_date, status, total_price, special_requests, booking_channel")
      .eq("rolos_guest_id", guest.id)
      .order("check_in_date", { ascending: false })
      .limit(50);
    setGuestBookings(data || []);
    // Fetch complaints
    const { data: profileData } = await supabase.from("rolos_guest_profiles").select("complaints").eq("id", guest.id).single();
    if (profileData?.complaints) {
      setSelectedGuest(prev => prev ? { ...prev, complaints: profileData.complaints as Guest["complaints"] } : prev);
    }
    setLoadingHistory(false);
  };

  if (propertyLoading) return <p className="text-muted-foreground">Loading property…</p>;
  if (viewMode === "single" && !activeIds.length) return <p className="text-muted-foreground">Select a property first.</p>;


  return (
    <>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Guest CRM</h1>
            <p className="text-sm text-muted-foreground">
              {viewMode === "portfolio"
                ? `Portfolio view — ${activeIds.length} properties aggregated`
                : "Single property view"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {showPortfolioToggle && (
              <div className="inline-flex rounded-md border bg-muted/40 p-0.5">
                <Button size="sm" variant={viewMode === "portfolio" ? "default" : "ghost"} className="h-7 px-3 text-xs" onClick={() => setViewMode("portfolio")}>Portfolio</Button>
                <Button size="sm" variant={viewMode === "single" ? "default" : "ghost"} className="h-7 px-3 text-xs" onClick={() => setViewMode("single")}>Single</Button>
              </div>
            )}
            {viewMode === "single" && properties.length > 1 && (
              <select
                className="h-8 rounded-md border bg-background px-2 text-xs"
                value={propertyId || ""}
                onChange={(e) => switchProperty(e.target.value)}
              >
                {(portfolioProperties || properties).map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            )}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Add Guest</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Add Guest Profile</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div><Label>Full Name *</Label><Input value={form.full_name} onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))} /></div>
                  <div><Label>Email</Label><Input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} /></div>
                  <div><Label>Phone</Label><Input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} /></div>
                  <Button onClick={handleCreate} className="w-full">Add Guest</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search guests by name, email, or phone..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
        </div>


        {loading ? <p className="text-muted-foreground">Loading...</p> : guests.length === 0 ? (
          <Card><CardContent className="py-12 text-center"><Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" /><p className="text-muted-foreground">No guest profiles yet.</p></CardContent></Card>
        ) : (
          <div className="space-y-2">
            {guests.map((guest) => (
              <Card key={guest.id} className="hover:shadow-sm transition-shadow cursor-pointer" onClick={() => openGuestDetail(guest)}>
                <CardContent className="py-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                      {guest.full_name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium">{guest.full_name}</p>
                      <div className="flex gap-3 text-xs text-muted-foreground">
                        {guest.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{guest.email}</span>}
                        {guest.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{guest.phone}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right text-sm">
                      <p className="font-medium">{guest.total_stays} stays</p>
                      <p className="text-xs text-muted-foreground">R{guest.total_spent.toLocaleString()}</p>
                    </div>
                    {guest.tags?.map(tag => <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>)}
                    {guest.is_blacklisted && <Badge variant="destructive" className="text-xs">Blacklisted</Badge>}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Guest Detail Sheet */}
      <Sheet open={!!selectedGuest} onOpenChange={(open) => !open && setSelectedGuest(null)}>
        <SheetContent className="sm:max-w-md overflow-y-auto">
          {selectedGuest && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                    {selectedGuest.full_name.charAt(0).toUpperCase()}
                  </div>
                  {selectedGuest.full_name}
                </SheetTitle>
                <SheetDescription>
                  {selectedGuest.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{selectedGuest.email}</span>}
                </SheetDescription>
              </SheetHeader>

              <div className="space-y-4 mt-4">
                {/* Stats */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-muted/50 rounded-md p-3 text-center">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Stays</p>
                    <p className="text-lg font-bold">{selectedGuest.total_stays}</p>
                  </div>
                  <div className="bg-muted/50 rounded-md p-3 text-center">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Spent</p>
                    <p className="text-sm font-semibold">R{selectedGuest.total_spent.toLocaleString()}</p>
                  </div>
                  <div className="bg-muted/50 rounded-md p-3 text-center">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Last Stay</p>
                    <p className="text-xs font-medium">{selectedGuest.last_stay_date || "—"}</p>
                  </div>
                </div>

                {selectedGuest.phone && (
                  <div className="flex items-center gap-2 text-sm"><Phone className="h-3.5 w-3.5 text-muted-foreground" />{selectedGuest.phone}</div>
                )}

                {selectedGuest.is_blacklisted && <Badge variant="destructive">Blacklisted</Badge>}
                {selectedGuest.tags?.length > 0 && (
                  <div className="flex flex-wrap gap-1">{selectedGuest.tags.map(t => <Badge key={t} variant="outline" className="text-xs">{t}</Badge>)}</div>
                )}

                <Separator />

                {/* Booking History */}
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                    <CalendarDays className="h-3 w-3" />Booking History
                  </h4>
                  {loadingHistory ? <p className="text-xs text-muted-foreground">Loading...</p> : guestBookings.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No bookings found.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {guestBookings.map(bk => (
                        <div key={bk.id} className="text-xs bg-muted/30 p-2 rounded border border-border">
                          <div className="flex items-center justify-between">
                            <span className="font-medium">{bk.check_in_date} → {bk.check_out_date}</span>
                            <Badge variant={bk.status === "checked_out" ? "outline" : bk.status === "cancelled" ? "destructive" : "secondary"} className="text-[10px] capitalize">{bk.status.replace("_", " ")}</Badge>
                          </div>
                          <div className="flex justify-between mt-1 text-muted-foreground">
                            <span>R{bk.total_price.toLocaleString()}</span>
                            {bk.booking_channel && <span className="capitalize">{bk.booking_channel}</span>}
                          </div>
                          {bk.special_requests && <p className="mt-1 text-muted-foreground italic truncate">{bk.special_requests}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <Separator />

                {/* Complaints */}
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />Complaints ({(selectedGuest.complaints || []).filter((c: any) => c.resolution_status === "open").length} open)
                  </h4>
                  {(selectedGuest.complaints || []).length === 0 ? (
                    <p className="text-xs text-muted-foreground">No complaints.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {(selectedGuest.complaints || []).sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).map((c: any) => (
                        <div key={c.id} className={`text-xs p-2 rounded border ${c.resolution_status === "open" ? "border-destructive/30 bg-destructive/5" : "border-border bg-muted/30"}`}>
                          <div className="flex items-center justify-between">
                            <Badge variant={c.resolution_status === "open" ? "destructive" : "secondary"} className="text-[10px]">{c.resolution_status}</Badge>
                            <span className="text-muted-foreground">{new Date(c.timestamp).toLocaleDateString()}</span>
                          </div>
                          <p className="mt-1">{c.description}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
