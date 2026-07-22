import { useEffect, useMemo, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { GripVertical, Plus, Trash2, Phone, Mail, Clock, Globe, ShieldCheck, Users } from "lucide-react";

const ROLES = [
  { value: "reception", label: "Reception / Front desk", icon: Phone },
  { value: "reservations", label: "Reservations", icon: Mail },
  { value: "landlord", label: "Landlord / Owner", icon: Users },
  { value: "manager", label: "Property Manager", icon: ShieldCheck },
  { value: "concierge", label: "Concierge", icon: Globe },
  { value: "after_hours", label: "After-hours emergency", icon: Clock },
  { value: "other", label: "Other", icon: Phone },
];

export interface PropertyContact {
  id: string;
  property_id: string;
  role: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  hours: string | null;
  sort_order: number;
  is_public: boolean;
}

interface Props {
  propertyId: string;
}

export default function PropertyContactDetails({ propertyId }: Props) {
  const { toast } = useToast();
  const [contacts, setContacts] = useState<PropertyContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!propertyId) return;
    setLoading(true);
    supabase
      .from("property_contact_details")
      .select("*")
      .eq("property_id", propertyId)
      .order("sort_order", { ascending: true })
      .then(({ data, error }) => {
        if (error) {
          toast({ title: "Error loading contacts", description: error.message, variant: "destructive" });
        } else {
          setContacts((data as PropertyContact[]) || []);
        }
        setLoading(false);
      });
  }, [propertyId, toast]);

  const hasChanges = useMemo(() => {
    // Placeholder for dirty detection; we save immediately per row.
    return false;
  }, []);

  const addContact = () => {
    const next: PropertyContact = {
      id: crypto.randomUUID(),
      property_id: propertyId,
      role: "reception",
      name: "",
      email: "",
      phone: "",
      hours: "",
      sort_order: contacts.length,
      is_public: true,
    };
    setContacts([...contacts, next]);
  };

  const updateContact = (index: number, patch: Partial<PropertyContact>) => {
    const next = [...contacts];
    next[index] = { ...next[index], ...patch };
    setContacts(next);
  };

  const removeContact = async (index: number) => {
    const contact = contacts[index];
    if (contact.id && !contact.id.startsWith("temp-")) {
      setSaving(true);
      const { error } = await supabase.from("property_contact_details").delete().eq("id", contact.id);
      setSaving(false);
      if (error) {
        toast({ title: "Error removing contact", description: error.message, variant: "destructive" });
        return;
      }
    }
    const next = contacts.filter((_, i) => i !== index).map((c, i) => ({ ...c, sort_order: i }));
    setContacts(next);
  };

  const saveAll = async () => {
    setSaving(true);
    const rows = contacts.map((c, i) => ({
      ...c,
      sort_order: i,
    }));

    // Upsert all rows
    const { error } = await supabase
      .from("property_contact_details")
      .upsert(rows, { onConflict: "id" });

    setSaving(false);
    if (error) {
      toast({ title: "Error saving contacts", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Contacts saved", description: "Public contact details are now available via the API." });
  };

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading contact details…</div>;
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold">Public Contact Details</h2>
          <p className="text-xs text-muted-foreground max-w-xl">
            These contacts are returned by the public API and can be shown on booking pages, confirmation emails and guest portals.
            Only contacts marked <span className="font-medium text-foreground">Public</span> are exposed externally.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={addContact} className="gap-1">
            <Plus className="h-3.5 w-3.5" />
            Add contact
          </Button>
          <Button type="button" size="sm" onClick={saveAll} disabled={saving} className="gap-1">
            {saving ? "Saving…" : "Save contacts"}
          </Button>
        </div>
      </div>

      {contacts.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center">
            <p className="text-sm text-muted-foreground">No public contact details configured yet.</p>
            <Button type="button" variant="outline" size="sm" onClick={addContact} className="mt-3 gap-1">
              <Plus className="h-3.5 w-3.5" />
              Add your first contact
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {contacts.map((contact, index) => {
            const RoleIcon = ROLES.find((r) => r.value === contact.role)?.icon || Phone;
            return (
              <Card key={contact.id || index} className="overflow-hidden">
                <CardHeader className="flex flex-row items-center gap-3 bg-muted/30 px-4 py-3">
                  <GripVertical className="h-4 w-4 text-muted-foreground" />
                  <RoleIcon className="h-4 w-4 text-primary" />
                  <CardTitle className="text-xs font-medium flex-1">
                    {ROLES.find((r) => r.value === contact.role)?.label || contact.role}
                  </CardTitle>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <Switch
                        id={`public-${contact.id}`}
                        checked={contact.is_public}
                        onCheckedChange={(v) => updateContact(index, { is_public: v })}
                      />
                      <Label htmlFor={`public-${contact.id}`} className="text-[10px] cursor-pointer">
                        Public
                      </Label>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={() => removeContact(index)}
                      disabled={saving}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="space-y-1.5">
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Role</Label>
                    <Select
                      value={contact.role}
                      onValueChange={(v) => updateContact(index, { role: v })}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLES.map((r) => (
                          <SelectItem key={r.value} value={r.value} className="text-xs">
                            {r.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Name</Label>
                    <Input
                      value={contact.name || ""}
                      onChange={(e) => updateContact(index, { name: e.target.value })}
                      placeholder="e.g. Front Desk"
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Phone</Label>
                    <Input
                      value={contact.phone || ""}
                      onChange={(e) => updateContact(index, { phone: e.target.value })}
                      placeholder="+27 12 345 6789"
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Email</Label>
                    <Input
                      value={contact.email || ""}
                      onChange={(e) => updateContact(index, { email: e.target.value })}
                      placeholder="reservations@example.com"
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2 lg:col-span-4">
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Hours / Notes</Label>
                    <Input
                      value={contact.hours || ""}
                      onChange={(e) => updateContact(index, { hours: e.target.value })}
                      placeholder="Mon–Fri 08:00–17:00; 24-hour emergency line"
                      className="h-8 text-xs"
                    />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-2">
        <Button type="button" variant="outline" size="sm" onClick={addContact} className="gap-1">
          <Plus className="h-3.5 w-3.5" />
          Add contact
        </Button>
        <Button type="button" size="sm" onClick={saveAll} disabled={saving} className="gap-1">
          {saving ? "Saving…" : "Save contacts"}
        </Button>
      </div>
    </div>
  );
}
