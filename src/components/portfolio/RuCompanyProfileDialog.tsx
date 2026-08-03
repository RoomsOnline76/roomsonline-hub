import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";

/**
 * Extra Rentals United company / contact / legal-representative fields.
 *
 * RU's Push_FillCompanyDetails_RQ accepts more than the mandatory contact block:
 * CompanyInfo carries TimeZone, Region, VATNumber, ManagerIdentificationNumber,
 * NumberOfProperties, NumberOfEmployees, YearsInBusiness and DescribeYourBusiness,
 * and an optional LegalRepresentativeInfo block is the only place RU accepts a
 * nationality. Everything captured here is merged into the company push.
 */
export interface RuCompanyProfile {
  // ContactInfo overrides
  first_name?: string;
  last_name?: string;
  phone?: string;
  city?: string;
  address?: string;
  zip_code?: string;
  birth_date?: string;
  // CompanyInfo
  website?: string;
  merchant_name?: string;
  vat_number?: string;
  manager_identification_number?: string;
  time_zone?: string;
  region?: string;
  number_of_properties?: number;
  number_of_employees?: number;
  years_in_business?: number;
  describe_your_business?: string;
  legal_rep?: {
    first_name?: string;
    last_name?: string;
    email?: string;
    city?: string;
    address?: string;
    post_code?: string;
    region?: string;
    birthday?: string;
    nationality_id?: number;
    country_of_residence_id?: number;
  };
}

interface Props {
  account: { id: string; email: string; ownerId: string | null } | null;
  onClose: () => void;
  onSaved?: () => void;
}

type Draft = Record<string, string>;

const CONTACT_FIELDS: { key: string; label: string; placeholder?: string }[] = [
  { key: "first_name", label: "Contact first name" },
  { key: "last_name", label: "Contact last name" },
  { key: "phone", label: "Contact phone", placeholder: "+27…" },
  { key: "city", label: "Contact city" },
  { key: "address", label: "Contact address" },
  { key: "zip_code", label: "Contact postal code" },
  { key: "birth_date", label: "Contact birth date", placeholder: "YYYY-MM-DD" },
];

const COMPANY_FIELDS: { key: string; label: string; placeholder?: string }[] = [
  { key: "website", label: "Website" },
  { key: "merchant_name", label: "Merchant name" },
  { key: "vat_number", label: "VAT number" },
  { key: "manager_identification_number", label: "Manager ID number" },
  { key: "time_zone", label: "Time zone", placeholder: "UTC+02:00" },
  { key: "region", label: "Region / province" },
  { key: "number_of_properties", label: "Number of properties" },
  { key: "number_of_employees", label: "Number of employees" },
  { key: "years_in_business", label: "Years in business" },
];

const REP_FIELDS: { key: string; label: string; placeholder?: string }[] = [
  { key: "first_name", label: "First name" },
  { key: "last_name", label: "Last name" },
  { key: "email", label: "Email" },
  { key: "city", label: "City" },
  { key: "address", label: "Address" },
  { key: "post_code", label: "Postal code" },
  { key: "region", label: "Region" },
  { key: "birthday", label: "Date of birth", placeholder: "YYYY-MM-DD" },
  { key: "nationality_id", label: "Nationality (RU location ID)", placeholder: "e.g. 153" },
  { key: "country_of_residence_id", label: "Country of residence (RU location ID)" },
];

const NUMERIC = new Set([
  "number_of_properties",
  "number_of_employees",
  "years_in_business",
  "nationality_id",
  "country_of_residence_id",
]);

export function RuCompanyProfileDialog({ account, onClose, onSaved }: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [company, setCompany] = useState<Draft>({});
  const [rep, setRep] = useState<Draft>({});

  useEffect(() => {
    if (!account) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const { data, error } = await supabase
        .from("ru_owner_accounts")
        .select("company_profile")
        .eq("id", account.id)
        .maybeSingle();
      if (cancelled) return;
      if (error) toast.error(error.message);
      const profile = (data?.company_profile ?? {}) as RuCompanyProfile;
      const { legal_rep, ...rest } = profile ?? {};
      const flatten = (obj: Record<string, unknown> | undefined): Draft =>
        Object.fromEntries(
          Object.entries(obj ?? {}).map(([k, v]) => [k, v === null || v === undefined ? "" : String(v)]),
        );
      setCompany(flatten(rest as Record<string, unknown>));
      setRep(flatten(legal_rep as Record<string, unknown> | undefined));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [account]);

  const save = useCallback(async () => {
    if (!account) return;
    setSaving(true);
    const clean = (draft: Draft) =>
      Object.fromEntries(
        Object.entries(draft)
          .map(([k, v]) => [k, v.trim()])
          .filter(([, v]) => v !== "")
          .map(([k, v]) => [k, NUMERIC.has(k) ? Number(v) : v])
          .filter(([, v]) => !(typeof v === "number" && !Number.isFinite(v))),
      );
    const payload: Record<string, unknown> = clean(company);
    const repClean = clean(rep);
    if (Object.keys(repClean).length > 0) payload.legal_rep = repClean;

    const { error } = await supabase
      .from("ru_owner_accounts")
      .update({ company_profile: (Object.keys(payload).length > 0 ? payload : null) as never })
      .eq("id", account.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Company profile saved — it will be sent with the next company push");
    onSaved?.();
    onClose();
  }, [account, company, rep, onSaved, onClose]);

  return (
    <Dialog open={!!account} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-base">Rentals United company profile</DialogTitle>
          <DialogDescription className="text-xs">
            {account?.email}
            {account?.ownerId ? ` · OwnerID ${account.ownerId}` : ""} — extra fields sent with
            Push_FillCompanyDetails_RQ. Anything left blank falls back to the property /
            portfolio data ROLOS already holds.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center gap-2 py-6 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading profile…
          </div>
        ) : (
          <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
            <section className="space-y-2">
              <p className="text-xs font-medium">Contact person</p>
              <div className="grid grid-cols-2 gap-2">
                {CONTACT_FIELDS.map((f) => (
                  <div key={f.key} className="space-y-1">
                    <Label className="text-[11px]">{f.label}</Label>
                    <Input
                      className="h-8 text-sm"
                      value={company[f.key] ?? ""}
                      placeholder={f.placeholder}
                      onChange={(e) => setCompany((p) => ({ ...p, [f.key]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
            </section>

            <section className="space-y-2">
              <p className="text-xs font-medium">Company</p>
              <div className="grid grid-cols-2 gap-2">
                {COMPANY_FIELDS.map((f) => (
                  <div key={f.key} className="space-y-1">
                    <Label className="text-[11px]">{f.label}</Label>
                    <Input
                      className="h-8 text-sm"
                      inputMode={NUMERIC.has(f.key) ? "numeric" : undefined}
                      value={company[f.key] ?? ""}
                      placeholder={f.placeholder}
                      onChange={(e) => setCompany((p) => ({ ...p, [f.key]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">Describe your business</Label>
                <Textarea
                  className="min-h-[70px] text-sm"
                  value={company.describe_your_business ?? ""}
                  onChange={(e) =>
                    setCompany((p) => ({ ...p, describe_your_business: e.target.value }))
                  }
                />
              </div>
            </section>

            <section className="space-y-2">
              <p className="text-xs font-medium">
                Legal representative{" "}
                <span className="font-normal text-muted-foreground">
                  (optional — the only RU block that carries a nationality)
                </span>
              </p>
              <div className="grid grid-cols-2 gap-2">
                {REP_FIELDS.map((f) => (
                  <div key={f.key} className="space-y-1">
                    <Label className="text-[11px]">{f.label}</Label>
                    <Input
                      className="h-8 text-sm"
                      inputMode={NUMERIC.has(f.key) ? "numeric" : undefined}
                      value={rep[f.key] ?? ""}
                      placeholder={f.placeholder}
                      onChange={(e) => setRep((p) => ({ ...p, [f.key]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" onClick={save} disabled={saving || loading}>
            {saving && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
            Save profile
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
