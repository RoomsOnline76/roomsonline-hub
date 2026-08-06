import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2, Loader2, Users2 } from "lucide-react";
import { toast } from "sonner";
import { CRM_ACCOUNT_TYPES, type CrmAccountType } from "@/lib/crmSegmentation";
import type { CrmAccount, CrmAccountStats } from "@/hooks/useCrmAccounts";

export interface CrmAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Existing record to edit, or null to create. */
  account: CrmAccount | null;
  /** Pre-selected type and name when creating from a picker. */
  initialType?: CrmAccountType;
  initialName?: string;
  stats?: CrmAccountStats;
  isPortfolioScoped: boolean;
  onSave: (values: Partial<CrmAccount> & { name: string }) => Promise<string>;
  onSaved?: (id: string) => void;
}

type FormState = {
  account_type: CrmAccountType;
  name: string;
  contact_title: string;
  contact_first_name: string;
  contact_last_name: string;
  email: string;
  phone: string;
  website: string;
  vat_number: string;
  registration_number: string;
  address_line1: string;
  address_line2: string;
  city: string;
  postal_code: string;
  country: string;
  default_commission_rate: string;
  payment_terms_days: string;
  is_credit_account: boolean;
  currency: string;
  tags: string;
  notes: string;
  is_active: boolean;
};

const blank = (type: CrmAccountType, name = ""): FormState => ({
  account_type: type,
  name,
  contact_title: "",
  contact_first_name: "",
  contact_last_name: "",
  email: "",
  phone: "",
  website: "",
  vat_number: "",
  registration_number: "",
  address_line1: "",
  address_line2: "",
  city: "",
  postal_code: "",
  country: "South Africa",
  default_commission_rate: "",
  payment_terms_days: "",
  is_credit_account: false,
  currency: "ZAR",
  tags: "",
  notes: "",
  is_active: true,
});

const fromAccount = (a: CrmAccount): FormState => ({
  account_type: a.account_type,
  name: a.name || "",
  contact_title: a.contact_title || "",
  contact_first_name: a.contact_first_name || "",
  contact_last_name: a.contact_last_name || "",
  email: a.email || "",
  phone: a.phone || "",
  website: a.website || "",
  vat_number: a.vat_number || "",
  registration_number: a.registration_number || "",
  address_line1: a.address_line1 || "",
  address_line2: a.address_line2 || "",
  city: a.city || "",
  postal_code: a.postal_code || "",
  country: a.country || "",
  default_commission_rate: a.default_commission_rate != null ? String(a.default_commission_rate) : "",
  payment_terms_days: a.payment_terms_days != null ? String(a.payment_terms_days) : "",
  is_credit_account: !!a.is_credit_account,
  currency: a.currency || "ZAR",
  tags: (a.tags || []).join(", "),
  notes: a.notes || "",
  is_active: a.is_active,
});

const money = (v: number) => `R${(v || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

/**
 * Full profile editor for a CRM account — company, travel agent, tour operator
 * or source. Mirrors the classic "Edit Client" layout: identity + VAT/address,
 * account terms, and read-only performance.
 */
export function CrmAccountDialog({
  open,
  onOpenChange,
  account,
  initialType = "company",
  initialName = "",
  stats,
  isPortfolioScoped,
  onSave,
  onSaved,
}: CrmAccountDialogProps) {
  const [form, setForm] = useState<FormState>(() => blank(initialType, initialName));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(account ? fromAccount(account) : blank(initialType, initialName));
  }, [open, account, initialType, initialName]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error("Give the profile a name");
      return;
    }
    setSaving(true);
    try {
      const id = await onSave({
        ...(account ? { id: account.id } : {}),
        account_type: form.account_type,
        name: form.name.trim(),
        contact_title: form.contact_title || null,
        contact_first_name: form.contact_first_name || null,
        contact_last_name: form.contact_last_name || null,
        email: form.email || null,
        phone: form.phone || null,
        website: form.website || null,
        vat_number: form.vat_number || null,
        registration_number: form.registration_number || null,
        address_line1: form.address_line1 || null,
        address_line2: form.address_line2 || null,
        city: form.city || null,
        postal_code: form.postal_code || null,
        country: form.country || null,
        default_commission_rate: form.default_commission_rate ? parseFloat(form.default_commission_rate) : null,
        payment_terms_days: form.payment_terms_days ? parseInt(form.payment_terms_days, 10) : null,
        is_credit_account: form.is_credit_account,
        currency: form.currency || null,
        tags: form.tags
          ? form.tags.split(",").map((t) => t.trim()).filter(Boolean)
          : [],
        notes: form.notes || null,
        is_active: form.is_active,
      } as Partial<CrmAccount> & { name: string });
      toast.success(account ? "Profile updated" : "Profile created");
      onSaved?.(id);
      onOpenChange(false);
    } catch (e) {
      toast.error(`Could not save profile: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" />
            {account ? `Edit ${form.name || "profile"}` : "New CRM profile"}
          </DialogTitle>
          <DialogDescription>
            {isPortfolioScoped
              ? "Shared across every property in this portfolio — maintain it once."
              : "Stored against this property."}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="identity">
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="identity">Identity</TabsTrigger>
            <TabsTrigger value="vat">VAT &amp; Address</TabsTrigger>
            <TabsTrigger value="terms">Accounts &amp; Terms</TabsTrigger>
            <TabsTrigger value="extra">Extra Info</TabsTrigger>
            <TabsTrigger value="performance">Performance</TabsTrigger>
          </TabsList>

          <TabsContent value="identity" className="space-y-4 pt-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Profile Type *</Label>
                <Select value={form.account_type} onValueChange={(v) => set("account_type", v as CrmAccountType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CRM_ACCOUNT_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Name / Company Name *</Label>
                <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Acme Travel (Pty) Ltd" />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-4">
              <div>
                <Label>Title</Label>
                <Input value={form.contact_title} onChange={(e) => set("contact_title", e.target.value)} placeholder="Mr / Ms" />
              </div>
              <div>
                <Label>Contact First Name</Label>
                <Input value={form.contact_first_name} onChange={(e) => set("contact_first_name", e.target.value)} />
              </div>
              <div>
                <Label>Contact Surname</Label>
                <Input value={form.contact_last_name} onChange={(e) => set("contact_last_name", e.target.value)} />
              </div>
              <div>
                <Label>Phone</Label>
                <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+27..." />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Email</Label>
                <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
              </div>
              <div>
                <Label>Website</Label>
                <Input value={form.website} onChange={(e) => set("website", e.target.value)} placeholder="https://" />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <div>
                <p className="text-sm font-medium">Active</p>
                <p className="text-xs text-muted-foreground">Inactive profiles stay on past bookings but are hidden from pickers.</p>
              </div>
              <Switch checked={form.is_active} onCheckedChange={(v) => set("is_active", v)} />
            </div>
          </TabsContent>

          <TabsContent value="vat" className="space-y-4 pt-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>VAT Number</Label>
                <Input value={form.vat_number} onChange={(e) => set("vat_number", e.target.value)} />
              </div>
              <div>
                <Label>Company Registration No.</Label>
                <Input value={form.registration_number} onChange={(e) => set("registration_number", e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Address Line 1</Label>
              <Input value={form.address_line1} onChange={(e) => set("address_line1", e.target.value)} />
            </div>
            <div>
              <Label>Address Line 2</Label>
              <Input value={form.address_line2} onChange={(e) => set("address_line2", e.target.value)} />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label>City</Label>
                <Input value={form.city} onChange={(e) => set("city", e.target.value)} />
              </div>
              <div>
                <Label>Postal Code</Label>
                <Input value={form.postal_code} onChange={(e) => set("postal_code", e.target.value)} />
              </div>
              <div>
                <Label>Country</Label>
                <Input value={form.country} onChange={(e) => set("country", e.target.value)} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              These details populate the invoice header when this profile is set as the invoice-to company on a booking.
            </p>
          </TabsContent>

          <TabsContent value="terms" className="space-y-4 pt-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label>Default Commission %</Label>
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  max={100}
                  value={form.default_commission_rate}
                  onChange={(e) => set("default_commission_rate", e.target.value)}
                  placeholder="e.g. 10"
                />
              </div>
              <div>
                <Label>Payment Terms (days)</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.payment_terms_days}
                  onChange={(e) => set("payment_terms_days", e.target.value)}
                  placeholder="e.g. 30"
                />
              </div>
              <div>
                <Label>Currency</Label>
                <Input value={form.currency} onChange={(e) => set("currency", e.target.value)} placeholder="ZAR" />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <div>
                <p className="text-sm font-medium">Credit account</p>
                <p className="text-xs text-muted-foreground">Bookings may be invoiced on account instead of prepaid.</p>
              </div>
              <Switch checked={form.is_credit_account} onCheckedChange={(v) => set("is_credit_account", v)} />
            </div>
          </TabsContent>

          <TabsContent value="extra" className="space-y-4 pt-4">
            <div>
              <Label>Tags</Label>
              <Input value={form.tags} onChange={(e) => set("tags", e.target.value)} placeholder="Comma separated, e.g. inbound, german-market" />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={5} placeholder="Internal notes about this profile" />
            </div>
          </TabsContent>

          <TabsContent value="performance" className="space-y-4 pt-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: "Bookings", value: String(stats?.booking_count ?? 0) },
                { label: "Room Nights", value: String(stats?.room_nights ?? 0) },
                { label: "Revenue", value: money(stats?.total_revenue ?? 0) },
                { label: "Last Booking", value: stats?.last_booking_date || "—" },
              ].map((s) => (
                <div key={s.label} className="rounded-md bg-muted/50 p-3 text-center">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{s.label}</p>
                  <p className="text-sm font-semibold">{s.value}</p>
                </div>
              ))}
            </div>
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Users2 className="h-3 w-3" />
              Totals cover every booking in the portfolio linked to this profile as company, agent or source.
            </p>
            {!account && <Badge variant="outline">Available once the profile is saved</Badge>}
          </TabsContent>
        </Tabs>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
            {account ? "Save changes" : "Create profile"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
