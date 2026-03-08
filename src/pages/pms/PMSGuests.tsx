import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { PMSLayout } from "@/components/layout/PMSLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Search, Users, Mail, Phone } from "lucide-react";
import { callPmsApi } from "@/hooks/usePmsApi";
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
}

export default function PMSGuests() {
  const [searchParams] = useSearchParams();
  const propertyId = searchParams.get("property");
  const [guests, setGuests] = useState<Guest[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ full_name: "", email: "", phone: "" });

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchGuests = useCallback(async () => {
    if (!propertyId) return;
    setLoading(true);
    try {
      const res = await callPmsApi<{ guests: Guest[] }>("get_guest_profiles", { propertyId, search: debouncedSearch || undefined, limit: 100 });
      if (res.success) setGuests(res.data?.guests || []);
    } catch { /* ignore */ }
    setLoading(false);
  }, [propertyId, debouncedSearch]);

  useEffect(() => { fetchGuests(); }, [fetchGuests]);

  const handleCreate = async () => {
    if (!propertyId || !form.full_name) return;
    try {
      const res = await callPmsApi("create_guest_profile", {
        propertyId, full_name: form.full_name, email: form.email || null, phone: form.phone || null,
      });
      if (res.success) { toast.success("Guest added"); setDialogOpen(false); setForm({ full_name: "", email: "", phone: "" }); fetchGuests(); }
    } catch (e: any) { toast.error(e.message); }
  };

  if (!propertyId) return <PMSLayout><p className="text-muted-foreground">Select a property first.</p></PMSLayout>;

  return (
    <PMSLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight">Guest CRM</h1>
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

        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search guests..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
        </div>

        {loading ? <p className="text-muted-foreground">Loading...</p> : guests.length === 0 ? (
          <Card><CardContent className="py-12 text-center"><Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" /><p className="text-muted-foreground">No guest profiles yet.</p></CardContent></Card>
        ) : (
          <div className="space-y-2">
            {guests.map((guest) => (
              <Card key={guest.id} className="hover:shadow-sm transition-shadow">
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
    </PMSLayout>
  );
}
