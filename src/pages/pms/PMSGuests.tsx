import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { usePmsPropertyId } from "@/hooks/usePmsPropertyId";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { GuestHubspotPanel } from "@/components/pms/crm/GuestHubspotPanel";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Search, Users, Mail, Phone, CalendarDays, AlertCircle, Download, Star, Repeat, Ban, Building2, Moon, Pencil, Archive, Wallet } from "lucide-react";
import { displayBookingReference } from "@/lib/bookingReference";
import { callPmsApi } from "@/hooks/usePmsApi";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { PmsPageSkeleton } from "@/components/pms/PmsPageSkeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CrmAccountsTab } from "@/components/pms/crm/CrmAccountsTab";
import { useCrmAccounts } from "@/hooks/useCrmAccounts";
import { GuestEditDialog } from "@/components/pms/crm/GuestEditDialog";

interface Guest {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  nationality?: string | null;
  notes?: string | null;
  total_stays: number;
  is_trade?: boolean | null;
  /** Legacy alias, kept in sync with total_received. */
  total_spent: number;
  /** Money actually paid on live bookings. */
  total_received: number;
  /** Booked value still owing on live bookings. */
  total_outstanding: number;
  /** Value of cancelled / no-show bookings — never counted as spend. */
  total_cancelled_value: number;
  cancelled_stays: number;
  is_archived?: boolean;
  tags: string[];
  is_blacklisted: boolean;
  last_stay_date: string | null;
  property_id?: string | null;
  complaints?: any[];
}

type Segment = "all" | "repeat" | "vip" | "owing" | "never_paid" | "blacklisted" | "no_contact" | "archived";
type SortKey = "recent" | "name" | "stays" | "spent" | "owing";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

/** Nights between two ISO dates — 0 when either is missing. */
function nightsBetween(from: string | null, to: string | null): number {
  if (!from || !to) return 0;
  const ms = new Date(to).getTime() - new Date(from).getTime();
  return ms > 0 ? Math.round(ms / 86400000) : 0;
}

/** First letter used by the A–Z rail; anything non-alphabetic lands under "#". */
function guestInitial(name: string): string {
  const ch = (name || "").trim().charAt(0).toUpperCase();
  return /[A-Z]/.test(ch) ? ch : "#";
}

/** Rand amounts, no cents — CRM figures are summaries, not invoices. */
function zar(value: number | null | undefined): string {
  return `R${Math.round(Number(value) || 0).toLocaleString("en-ZA")}`;
}

/** Payment state of a single booking, used for the honesty badges. */
function paymentState(bk: GuestBooking): { label: string; tone: "paid" | "part" | "unpaid" | "cancelled" } {
  if (["cancelled", "no_show"].includes(bk.status)) return { label: "Cancelled", tone: "cancelled" };
  const paid = Number(bk.amount_paid) || 0;
  const total = Number(bk.total_price) || 0;
  if (paid <= 0) return { label: "Unpaid", tone: "unpaid" };
  if (paid + 0.01 < total) return { label: "Part paid", tone: "part" };
  return { label: "Paid", tone: "paid" };
}

interface GuestBooking {
  id: string;
  check_in_date: string;
  check_out_date: string;
  status: string;
  total_price: number;
  amount_paid?: number | null;
  payment_status?: string | null;
  special_requests: string | null;
  booking_channel: string | null;
  rol_reference?: string | null;
  external_reservation_id?: string | null;
  property_id?: string | null;
}

export default function PMSGuests() {
  const { propertyId, properties, portfolioProperties, portfolioIds, showPortfolioToggle, switchProperty, loading: propertyLoading } = usePmsPropertyId();
  const crm = useCrmAccounts({ propertyId, portfolioIds });
  const [viewMode, setViewMode] = useState<"portfolio" | "single">(() =>
    (portfolioProperties && portfolioProperties.length > 1) ? "portfolio" : "single"
  );
  const [guests, setGuests] = useState<Guest[]>([]);
  const [editGuest, setEditGuest] = useState<Guest | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ full_name: "", email: "", phone: "" });
  const [selectedGuest, setSelectedGuest] = useState<Guest | null>(null);
  const [guestBookings, setGuestBookings] = useState<GuestBooking[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [letter, setLetter] = useState<string | null>(null);
  const [segment, setSegment] = useState<Segment>("all");
  const [sortKey, setSortKey] = useState<SortKey>("recent");

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
        .select("id, full_name, email, phone, nationality, notes, is_trade, total_stays, total_spent, total_received, total_outstanding, total_cancelled_value, cancelled_stays, is_archived, tags, is_blacklisted, last_stay_date, property_id")
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

  const propertyNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of [...(portfolioProperties || []), ...(properties || [])]) map.set(p.id, p.name);
    return map;
  }, [portfolioProperties, properties]);

  /** Letters that actually have guests — the rail greys out the rest. */
  const lettersPresent = useMemo(() => {
    const set = new Set<string>();
    for (const g of guests) set.add(guestInitial(g.full_name));
    return set;
  }, [guests]);

  /** Archived profiles are hidden everywhere except the Archived segment. */
  const liveGuests = useMemo(() => guests.filter(g => !g.is_archived), [guests]);

  const segmentCounts = useMemo(() => ({
    all: liveGuests.length,
    repeat: liveGuests.filter(g => (g.total_stays || 0) > 1).length,
    vip: liveGuests.filter(g => (g.tags || []).some(t => t.toLowerCase() === "vip")).length,
    owing: liveGuests.filter(g => (g.total_outstanding || 0) > 0).length,
    never_paid: liveGuests.filter(g => (g.total_received || 0) <= 0).length,
    blacklisted: liveGuests.filter(g => g.is_blacklisted).length,
    no_contact: liveGuests.filter(g => !g.email && !g.phone).length,
    archived: guests.filter(g => g.is_archived).length,
  }), [guests, liveGuests]);

  const visibleGuests = useMemo(() => {
    let rows = segment === "archived" ? guests.filter(g => g.is_archived) : liveGuests;
    if (letter) rows = rows.filter(g => guestInitial(g.full_name) === letter);
    if (segment === "repeat") rows = rows.filter(g => (g.total_stays || 0) > 1);
    if (segment === "vip") rows = rows.filter(g => (g.tags || []).some(t => t.toLowerCase() === "vip"));
    if (segment === "owing") rows = rows.filter(g => (g.total_outstanding || 0) > 0);
    if (segment === "never_paid") rows = rows.filter(g => (g.total_received || 0) <= 0);
    if (segment === "blacklisted") rows = rows.filter(g => g.is_blacklisted);
    if (segment === "no_contact") rows = rows.filter(g => !g.email && !g.phone);
    const sorted = [...rows];
    if (sortKey === "name") sorted.sort((a, b) => a.full_name.localeCompare(b.full_name));
    else if (sortKey === "stays") sorted.sort((a, b) => (b.total_stays || 0) - (a.total_stays || 0));
    else if (sortKey === "spent") sorted.sort((a, b) => (b.total_received || 0) - (a.total_received || 0));
    else if (sortKey === "owing") sorted.sort((a, b) => (b.total_outstanding || 0) - (a.total_outstanding || 0));
    else sorted.sort((a, b) => (b.last_stay_date || "").localeCompare(a.last_stay_date || ""));
    return sorted;
  }, [guests, liveGuests, letter, segment, sortKey]);

  const exportCsv = useCallback(() => {
    const header = ["Name", "Email", "Phone", "Stays", "Received", "Outstanding", "Cancelled value", "Last stay", "Property", "Tags", "Blacklisted"];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [header.map(esc).join(",")];
    for (const g of visibleGuests) {
      lines.push([
        g.full_name, g.email || "", g.phone || "", g.total_stays || 0,
        g.total_received || 0, g.total_outstanding || 0, g.total_cancelled_value || 0,
        g.last_stay_date || "", (g.property_id && propertyNameById.get(g.property_id)) || "",
        (g.tags || []).join(" | "), g.is_blacklisted ? "yes" : "no",
      ].map(esc).join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `guest-crm-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${visibleGuests.length} guest${visibleGuests.length === 1 ? "" : "s"}`);
  }, [visibleGuests, propertyNameById]);

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
      .select("id, check_in_date, check_out_date, status, total_price, amount_paid, payment_status, special_requests, booking_channel, rol_reference, external_reservation_id, property_id")
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

  if (propertyLoading) return <PmsPageSkeleton rows={4} />;
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

        <Tabs defaultValue="guests" className="space-y-4">
          <TabsList>
            <TabsTrigger value="guests">Guests</TabsTrigger>
            <TabsTrigger value="accounts">Companies &amp; Agents</TabsTrigger>
          </TabsList>

          <TabsContent value="guests" className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[220px] max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search guests by name, email, or phone..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
              </div>
              <select
                className="h-9 rounded-md border bg-background px-2 text-xs"
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as SortKey)}
                aria-label="Sort guests"
              >
                <option value="recent">Most recent stay</option>
                <option value="name">Name A–Z</option>
                <option value="stays">Most stays</option>
                <option value="spent">Highest received</option>
                <option value="owing">Most owing</option>
              </select>
              <Button variant="outline" size="sm" className="h-9" onClick={exportCsv} disabled={!visibleGuests.length}>
                <Download className="h-4 w-4 mr-2" />Export CSV
              </Button>
            </div>

            {/* Segment chips */}
            <div className="flex flex-wrap items-center gap-1.5">
              {([
                { key: "all", label: "All guests", icon: Users },
                { key: "repeat", label: "Repeat", icon: Repeat },
                { key: "vip", label: "VIP", icon: Star },
                { key: "owing", label: "Owing", icon: Wallet },
                { key: "never_paid", label: "Never paid", icon: AlertCircle },
                { key: "blacklisted", label: "Blacklisted", icon: Ban },
                { key: "no_contact", label: "No contact details", icon: AlertCircle },
                { key: "archived", label: "Archived", icon: Archive },
              ] as { key: Segment; label: string; icon: typeof Users }[]).map(({ key, label, icon: Icon }) => (
                <Button
                  key={key}
                  size="sm"
                  variant={segment === key ? "default" : "outline"}
                  className="h-7 rounded-full px-3 text-xs"
                  onClick={() => setSegment(key)}
                >
                  <Icon className="h-3 w-3 mr-1.5" />{label}
                  <span className="ml-1.5 opacity-70">{segmentCounts[key]}</span>
                </Button>
              ))}
            </div>

            {loading ? (
              <div className="space-y-2">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="h-14 rounded-md bg-muted animate-pulse" />
                ))}
              </div>
            ) : guests.length === 0 ? (
              <Card><CardContent className="py-12 text-center"><Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" /><p className="text-muted-foreground">No guest profiles yet.</p></CardContent></Card>
            ) : (
              <div className="flex gap-3">
                {/* A–Z rail */}
                <div className="flex flex-col items-center gap-0.5 pt-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => setLetter(null)}
                    className={`h-5 w-5 rounded text-[10px] font-semibold ${letter === null ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
                  >
                    All
                  </button>
                  {[...ALPHABET, "#"].map((l) => {
                    const has = lettersPresent.has(l);
                    return (
                      <button
                        key={l}
                        type="button"
                        disabled={!has}
                        onClick={() => setLetter(letter === l ? null : l)}
                        className={`h-5 w-5 rounded text-[10px] font-semibold transition-colors ${
                          letter === l
                            ? "bg-primary text-primary-foreground"
                            : has
                              ? "text-foreground hover:bg-muted"
                              : "text-muted-foreground/40 cursor-default"
                        }`}
                      >
                        {l}
                      </button>
                    );
                  })}
                </div>

                <div className="flex-1 space-y-2">
                  {visibleGuests.length === 0 ? (
                    <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No guests match this filter.</CardContent></Card>
                  ) : visibleGuests.map((guest) => {
                    const homeProperty = guest.property_id ? propertyNameById.get(guest.property_id) : null;
                    return (
                      <Card key={guest.id} className="hover:shadow-sm transition-shadow cursor-pointer" onClick={() => openGuestDetail(guest)}>
                        <CardContent className="py-4 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-4 min-w-0">
                            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                              {guest.full_name.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium truncate">{guest.full_name}</p>
                              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                                {guest.email && <span className="flex items-center gap-1 truncate"><Mail className="h-3 w-3" />{guest.email}</span>}
                                {guest.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{guest.phone}</span>}
                                {homeProperty && viewMode === "portfolio" && (
                                  <span className="flex items-center gap-1"><Building2 className="h-3 w-3" />{homeProperty}</span>
                                )}
                                {guest.last_stay_date && (
                                  <span className="flex items-center gap-1"><CalendarDays className="h-3 w-3" />Last {guest.last_stay_date}</span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <div className="text-right text-sm">
                              <p className="font-medium">{guest.total_stays || 0} stay{(guest.total_stays || 0) === 1 ? "" : "s"}</p>
                              <p className="text-xs text-muted-foreground">{zar(guest.total_received)} received</p>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                              {(guest.total_outstanding || 0) > 0 && (
                                <Badge variant="outline" className="text-[10px] border-amber-500 text-amber-600 dark:text-amber-400">
                                  {zar(guest.total_outstanding)} owing
                                </Badge>
                              )}
                              {(guest.total_cancelled_value || 0) > 0 && (
                                <Badge variant="outline" className="text-[10px] text-muted-foreground line-through">
                                  {zar(guest.total_cancelled_value)} cancelled
                                </Badge>
                              )}
                            </div>
                            {(guest.total_stays || 0) > 1 && <Badge variant="secondary" className="text-xs">Repeat</Badge>}
                            <Badge variant="outline" className="text-xs">{guest.is_trade ? "Trade" : "Direct"}</Badge>
                            {guest.tags?.map(tag => <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>)}
                            {guest.is_blacklisted && <Badge variant="destructive" className="text-xs">Blacklisted</Badge>}
                            {guest.is_archived && <Badge variant="outline" className="text-xs text-muted-foreground">Archived</Badge>}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              aria-label={`Edit ${guest.full_name}`}
                              onClick={(e) => { e.stopPropagation(); setEditGuest(guest); }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}
      </TabsContent>


          <TabsContent value="accounts">
            <CrmAccountsTab
              accounts={crm.accounts}
              stats={crm.stats}
              loading={crm.loading}
              isPortfolioScoped={crm.isPortfolioScoped}
              onSave={crm.saveAccount}
              onArchive={crm.archiveAccount}
            />
          </TabsContent>
        </Tabs>
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
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">Figures below are derived from bookings.</p>
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setEditGuest(selectedGuest)}>
                    <Pencil className="h-3 w-3 mr-1.5" />Edit
                  </Button>
                </div>

                {/* Stats — received / owing / cancelled kept apart */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-muted/50 rounded-md p-3 text-center">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Received</p>
                    <p className="text-sm font-semibold">{zar(selectedGuest.total_received)}</p>
                  </div>
                  <div className="bg-muted/50 rounded-md p-3 text-center">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Outstanding</p>
                    <p className={`text-sm font-semibold ${(selectedGuest.total_outstanding || 0) > 0 ? "text-amber-600 dark:text-amber-400" : ""}`}>
                      {zar(selectedGuest.total_outstanding)}
                    </p>
                  </div>
                  <div className="bg-muted/50 rounded-md p-3 text-center">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Cancelled</p>
                    <p className="text-sm font-semibold text-muted-foreground">
                      {zar(selectedGuest.total_cancelled_value)}
                      {(selectedGuest.cancelled_stays || 0) > 0 && (
                        <span className="ml-1 text-[10px]">({selectedGuest.cancelled_stays})</span>
                      )}
                    </p>
                  </div>
                  <div className="bg-muted/50 rounded-md p-3 text-center">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Stays</p>
                    <p className="text-sm font-semibold">{selectedGuest.total_stays || 0}</p>
                    <p className="text-[10px] text-muted-foreground">Last {selectedGuest.last_stay_date || "—"}</p>
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

                {/* Optional CRM mirror — hidden unless the add-on is live and matched */}
                <GuestHubspotPanel email={selectedGuest.email} propertyId={propertyId} />

                {/* Booking History */}
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                    <CalendarDays className="h-3 w-3" />Booking History
                  </h4>
                  {loadingHistory ? (
                    <div className="space-y-2">
                      {[0, 1].map((i) => (
                        <div key={i} className="h-10 rounded-md bg-muted animate-pulse" />
                      ))}
                    </div>
                  ) : guestBookings.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No bookings found.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {guestBookings.map(bk => {
                        const pay = paymentState(bk);
                        return (
                        <div key={bk.id} className="text-xs bg-muted/30 p-2 rounded border border-border">
                          <div className="flex items-center justify-between">
                            <span className="font-medium">{bk.check_in_date} → {bk.check_out_date}</span>
                            <Badge variant={bk.status === "checked_out" ? "outline" : bk.status === "cancelled" ? "destructive" : "secondary"} className="text-[10px] capitalize">{bk.status.replace("_", " ")}</Badge>
                          </div>
                          <div className="flex justify-between mt-1 text-muted-foreground">
                            <span className={pay.tone === "cancelled" ? "line-through" : ""}>
                              {zar(bk.total_price)}
                              {pay.tone === "part" && <span className="ml-1">({zar(bk.amount_paid)} paid)</span>}
                            </span>
                            <span className="flex items-center gap-2">
                              <Badge
                                variant="outline"
                                className={`text-[10px] ${
                                  pay.tone === "paid" ? "border-emerald-500 text-emerald-600 dark:text-emerald-400"
                                  : pay.tone === "part" ? "border-amber-500 text-amber-600 dark:text-amber-400"
                                  : pay.tone === "unpaid" ? "border-destructive text-destructive"
                                  : "text-muted-foreground"
                                }`}
                              >
                                {pay.label}
                              </Badge>
                              <span className="flex items-center gap-1"><Moon className="h-3 w-3" />{nightsBetween(bk.check_in_date, bk.check_out_date)}</span>
                              {bk.booking_channel && <span className="capitalize">{bk.booking_channel}</span>}
                            </span>
                          </div>
                          <p className="mt-1 font-mono text-[10px] text-muted-foreground">{displayBookingReference(bk)}</p>
                          {bk.special_requests && <p className="mt-1 text-muted-foreground italic truncate">{bk.special_requests}</p>}
                        </div>
                        );
                      })}
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

      <GuestEditDialog
        guest={editGuest}
        open={!!editGuest}
        onOpenChange={(open) => !open && setEditGuest(null)}
        onSaved={() => { setEditGuest(null); fetchGuests(); }}
        onDeleted={(id) => {
          setEditGuest(null);
          setSelectedGuest(prev => (prev?.id === id ? null : prev));
          fetchGuests();
        }}
      />
    </>
  );
}
