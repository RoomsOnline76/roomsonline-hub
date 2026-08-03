import { useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import { RuLocationPicker } from "@/components/property/RuLocationPicker";

/**
 * Company Information (formerly "Business Registration").
 *
 * Single home for the legal/company identity of a property: the contract
 * variables ROLOS already captured, plus the Rentals United company-profile
 * fields that used to live in a separate dialog under Portfolios → RU accounts.
 *
 * Deliberately excludes anything already captured on Identity & Location
 * (street address, city, postal code, country, phone, website) — the RU company
 * push falls back to those property fields when these are blank.
 */
export interface RuCompanyProfile {
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
    birthday?: string;
    nationality_id?: number;
    country_of_residence_id?: number;
  };
}

interface Props {
  registeredBusinessName: string;
  onRegisteredBusinessNameChange: (v: string) => void;
  mobileNumber: string;
  onMobileNumberChange: (v: string) => void;
  keyRepresentative: string;
  onKeyRepresentativeChange: (v: string) => void;
  postalAddress: string;
  onPostalAddressChange: (v: string) => void;
  companyProfile: RuCompanyProfile;
  onCompanyProfileChange: (next: RuCompanyProfile) => void;
  /** RU LocationID selected for the property itself (Identity & Location). */
  ruLocationId: number | null;
  onRuLocationIdChange: (id: number | null) => void;
  propertyCity?: string;
}

const COMPANY_TEXT_FIELDS: { key: keyof RuCompanyProfile; label: string; placeholder?: string }[] = [
  { key: "merchant_name", label: "Merchant name", placeholder: "As it appears on card statements" },
  { key: "vat_number", label: "VAT number" },
  { key: "manager_identification_number", label: "Manager ID number" },
  { key: "time_zone", label: "Time zone", placeholder: "UTC+02:00" },
  { key: "region", label: "Region / province" },
];

const COMPANY_NUMBER_FIELDS: { key: keyof RuCompanyProfile; label: string }[] = [
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
  { key: "birthday", label: "Date of birth", placeholder: "YYYY-MM-DD" },
];

export function CompanyInformationCard({
  registeredBusinessName,
  onRegisteredBusinessNameChange,
  mobileNumber,
  onMobileNumberChange,
  keyRepresentative,
  onKeyRepresentativeChange,
  postalAddress,
  onPostalAddressChange,
  companyProfile,
  onCompanyProfileChange,
  ruLocationId,
  onRuLocationIdChange,
  propertyCity,
}: Props) {
  const setField = useCallback(
    (key: keyof RuCompanyProfile, raw: string, numeric = false) => {
      const next: RuCompanyProfile = { ...companyProfile };
      const trimmed = raw.trim();
      if (trimmed === "") {
        delete next[key];
      } else if (numeric) {
        const n = Number(trimmed);
        if (Number.isFinite(n)) (next[key] as unknown as number) = n;
      } else {
        (next[key] as unknown as string) = raw;
      }
      onCompanyProfileChange(next);
    },
    [companyProfile, onCompanyProfileChange],
  );

  const setRepField = useCallback(
    (key: string, raw: string | number | null) => {
      const rep = { ...(companyProfile.legal_rep ?? {}) } as Record<string, unknown>;
      if (raw === null || raw === "" || (typeof raw === "string" && raw.trim() === "")) delete rep[key];
      else rep[key] = raw;
      const next: RuCompanyProfile = { ...companyProfile };
      if (Object.keys(rep).length === 0) delete next.legal_rep;
      else next.legal_rep = rep as RuCompanyProfile["legal_rep"];
      onCompanyProfileChange(next);
    },
    [companyProfile, onCompanyProfileChange],
  );

  const rep = (companyProfile.legal_rep ?? {}) as Record<string, string | number | undefined>;
  const str = (v: unknown) => (v === undefined || v === null ? "" : String(v));

  return (
    <Collapsible defaultOpen={false}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer px-4 py-2 transition-colors hover:bg-muted/50">
            <CardTitle className="flex items-center justify-between text-sm">
              <span>Company Information</span>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </CardTitle>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="space-y-4 px-4 py-2">
            {/* ── Legal entity ── */}
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Legal entity
              </p>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                <div className="flex flex-col gap-1">
                  <Label htmlFor="registered_business_name" className="text-xs">
                    Registered Business Name
                  </Label>
                  <Input
                    id="registered_business_name"
                    value={registeredBusinessName}
                    onChange={(e) => onRegisteredBusinessNameChange(e.target.value)}
                    placeholder="e.g., Safari Lodge (Pty) Ltd"
                    className="h-7 text-xs"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="mobile_number" className="text-xs">
                    Mobile Number
                  </Label>
                  <Input
                    id="mobile_number"
                    value={mobileNumber}
                    onChange={(e) => onMobileNumberChange(e.target.value)}
                    placeholder="e.g., +27 82 123 4567"
                    className="h-7 text-xs"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="key_representative" className="text-xs">
                    Key Representative
                  </Label>
                  <Input
                    id="key_representative"
                    value={keyRepresentative}
                    onChange={(e) => onKeyRepresentativeChange(e.target.value)}
                    placeholder="e.g., John Smith"
                    className="h-7 text-xs"
                  />
                </div>
                {COMPANY_TEXT_FIELDS.map((f) => (
                  <div key={String(f.key)} className="flex flex-col gap-1">
                    <Label className="text-xs">{f.label}</Label>
                    <Input
                      value={str(companyProfile[f.key])}
                      placeholder={f.placeholder}
                      onChange={(e) => setField(f.key, e.target.value)}
                      className="h-7 text-xs"
                    />
                  </div>
                ))}
                {COMPANY_NUMBER_FIELDS.map((f) => (
                  <div key={String(f.key)} className="flex flex-col gap-1">
                    <Label className="text-xs">{f.label}</Label>
                    <Input
                      inputMode="numeric"
                      value={str(companyProfile[f.key])}
                      onChange={(e) => setField(f.key, e.target.value, true)}
                      className="h-7 text-xs"
                    />
                  </div>
                ))}
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="postal_address" className="text-xs">
                  Postal Address
                </Label>
                <Textarea
                  id="postal_address"
                  value={postalAddress}
                  onChange={(e) => onPostalAddressChange(e.target.value)}
                  placeholder="e.g., PO Box 123, Hoedspruit, 1380"
                  className="min-h-[50px] text-xs"
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs">Describe your business</Label>
                <Textarea
                  value={str(companyProfile.describe_your_business)}
                  onChange={(e) => setField("describe_your_business", e.target.value)}
                  placeholder="Short description of the business as it should appear on channel profiles"
                  className="min-h-[50px] text-xs"
                />
              </div>
            </div>

            {/* ── RU location register ── */}
            <div className="space-y-1.5 rounded-md border border-border bg-muted/30 p-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Rentals United location
              </p>
              <RuLocationPicker
                value={ruLocationId}
                onChange={(id) => onRuLocationIdChange(id)}
                initialQuery={propertyCity ?? ""}
              />
              <p className="text-[10px] leading-snug text-muted-foreground">
                Attaches a real RU LocationID to this property and its company push. Leave empty to
                let ROLOS resolve it from coordinates and city name at push time.
              </p>
            </div>

            {/* ── Legal representative ── */}
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Legal representative{" "}
                <span className="font-normal normal-case tracking-normal">
                  (optional — the only Rentals United block that carries a nationality)
                </span>
              </p>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                {REP_FIELDS.map((f) => (
                  <div key={f.key} className="flex flex-col gap-1">
                    <Label className="text-xs">{f.label}</Label>
                    <Input
                      value={str(rep[f.key])}
                      placeholder={f.placeholder}
                      onChange={(e) => setRepField(f.key, e.target.value)}
                      className="h-7 text-xs"
                    />
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <Label className="text-xs">Nationality (RU location)</Label>
                  <RuLocationPicker
                    value={Number(rep.nationality_id) || null}
                    onChange={(id) => setRepField("nationality_id", id)}
                    typeFilter={[1]}
                    placeholder="Search countries…"
                    allowRefresh={false}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-xs">Country of residence (RU location)</Label>
                  <RuLocationPicker
                    value={Number(rep.country_of_residence_id) || null}
                    onChange={(id) => setRepField("country_of_residence_id", id)}
                    typeFilter={[1]}
                    placeholder="Search countries…"
                    allowRefresh={false}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
