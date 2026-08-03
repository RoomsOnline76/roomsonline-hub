import { useCallback, useEffect, useMemo, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, Check, ChevronDown } from "lucide-react";
import { RuLocationPicker } from "@/components/property/RuLocationPicker";
import {
  RU_TIME_ZONES,
  RU_TIME_ZONE_GROUPS,
  normalizeRuTimeZone,
} from "@/lib/ruTimeZones";
import { supabase } from "@/integrations/supabase/client";


/**
 * Company Information (formerly "Business Registration").
 *
 * Single home for the legal/company identity of a property: the contract
 * variables ROLOS already captured, the banking/payout block (merged in from the
 * old standalone "Banking Details" card) and the Rentals United company-profile
 * fields that used to live in a separate dialog under Portfolios → RU accounts.
 *
 * Deliberately excludes anything already captured on Identity & Location
 * (street address, city, postal code, country, phone, website) — the RU company
 * push falls back to those property fields when these are blank.
 */
export interface RuCompanyProfile {
  merchant_name?: string;
  /** VAT lives on the single form-level `vat_number` field; kept for legacy reads. */
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

export interface CompanyBankingFields {
  has_vat: boolean;
  vat_number: string;
  property_registration: string;
  bank_name: string;
  branch_code: string;
  account_holder: string;
  account_number: string;
  account_type: string;
  swift_code: string;
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
  propertyCountry?: string;
  propertyPostalCode?: string;
  /** Banking / VAT / registration block merged in from the old Banking Details card. */

  banking: CompanyBankingFields;
  onBankingChange: (key: keyof CompanyBankingFields, value: string | boolean) => void;
}

/** RU nationality/country fields are LocationIDs with LocationTypeID = 2. */
const RU_COUNTRY_TYPE_FILTER = [2];

/** Pink asterisk marking a field that is mandatory for the Rentals United push. */
function Req() {
  return (
    <span aria-hidden className="ml-0.5 font-semibold text-primary">
      *
    </span>
  );
}

/** Small format/description note under a constrained input. */
function Hint({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] leading-snug text-muted-foreground">{children}</p>;
}

const COMPANY_TEXT_FIELDS: {
  key: keyof RuCompanyProfile;
  label: string;
  placeholder?: string;
  required?: boolean;
  hint?: string;
}[] = [
  {
    key: "merchant_name",
    label: "Merchant name",
    placeholder: "As it appears on card statements",
    hint: "Max 22 characters, letters/numbers/spaces only — this is what guests see on their bank statement.",
  },
  {
    key: "manager_identification_number",
    label: "Manager ID number",
    hint: "National ID or passport number of the account manager, digits only, no spaces.",
  },
  {
    key: "region",
    label: "Region / province",
    required: true,
    hint: "Full province or state name as registered (e.g. Western Cape) — not an abbreviation.",
  },
];

const COMPANY_NUMBER_FIELDS: { key: keyof RuCompanyProfile; label: string; hint?: string }[] = [
  { key: "number_of_properties", label: "Number of properties", hint: "Whole number" },
  { key: "number_of_employees", label: "Number of employees", hint: "Whole number" },
  { key: "years_in_business", label: "Years in business", hint: "Whole number of years" },
];

const REP_FIELDS: {
  key: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  type?: string;
  hint?: string;
}[] = [
  { key: "first_name", label: "First name", required: true },
  { key: "last_name", label: "Last name", required: true },
  { key: "email", label: "Email", required: true, type: "email", hint: "name@domain.com" },
  { key: "city", label: "City" },
  { key: "address", label: "Address" },
  { key: "post_code", label: "Postal code" },
  {
    key: "birthday",
    label: "Date of birth",
    type: "date",
    hint: "Sent to Rentals United as YYYY-MM-DD",
  },
];

/** South African bank account types (RU/bank payout files accept these labels). */
const ACCOUNT_TYPES = ["Cheque / Current", "Savings", "Transmission", "Business", "Bond"];

const BANKING_FIELDS: {
  key: keyof CompanyBankingFields;
  label: string;
  placeholder: string;
  hint?: string;
  options?: string[];
  numeric?: boolean;
}[] = [
  { key: "bank_name", label: "Bank", placeholder: "Bank name" },
  {
    key: "branch_code",
    label: "Branch",
    placeholder: "6 digits",
    hint: "6-digit universal branch code",
    numeric: true,
  },
  { key: "account_holder", label: "Holder", placeholder: "Name", hint: "Exactly as registered at the bank" },
  { key: "account_number", label: "Account #", placeholder: "Number", hint: "Digits only", numeric: true },
  { key: "account_type", label: "Type", placeholder: "Select", options: ACCOUNT_TYPES },
  {
    key: "swift_code",
    label: "SWIFT",
    placeholder: "e.g. SBZAZAJJ",
    hint: "8 or 11 characters, uppercase (BIC)",
  },
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
  propertyCountry,
  propertyPostalCode,

  banking,
  onBankingChange,
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

  /** Legacy free-text time zones ("UTC+02:00") are mapped onto a canonical RU zone. */
  const rawTimeZone = str(companyProfile.time_zone).trim();
  const normalizedTimeZone = useMemo(() => {
    const canonical = normalizeRuTimeZone(rawTimeZone);
    return RU_TIME_ZONES.some((z) => z.value === canonical) ? canonical : "";
  }, [rawTimeZone]);

  /**
   * Auto-populate the fields that follow from the property address (city, postal
   * code, country) so the operator only fills them when they differ. Blank fields
   * only — an existing value (or a manual dropdown change) is never overwritten.
   */
  const profileRef = useRef(companyProfile);
  profileRef.current = companyProfile;
  const autofilledCountry = useRef<string | null>(null);

  useEffect(() => {
    const current = profileRef.current;
    const currentRep = (current.legal_rep ?? {}) as Record<string, string | number | undefined>;
    const patch: Record<string, string | number> = {};
    if (propertyCity?.trim() && !str(currentRep.city).trim()) patch.city = propertyCity.trim();
    if (propertyPostalCode?.trim() && !str(currentRep.post_code).trim()) {
      patch.post_code = propertyPostalCode.trim();
    }
    if (Object.keys(patch).length === 0) return;
    onCompanyProfileChange({
      ...current,
      legal_rep: { ...currentRep, ...patch } as RuCompanyProfile["legal_rep"],
    });
  }, [propertyCity, propertyPostalCode, onCompanyProfileChange]);

  useEffect(() => {
    const country = propertyCountry?.trim();
    if (!country || autofilledCountry.current === country) return;
    const current = profileRef.current;
    const currentRep = (current.legal_rep ?? {}) as Record<string, string | number | undefined>;
    const needsNationality = !Number(currentRep.nationality_id);
    const needsResidence = !Number(currentRep.country_of_residence_id);
    if (!needsNationality && !needsResidence) return;
    autofilledCountry.current = country;
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("ru_locations")
        .select("id, name")
        .in("location_type_id", RU_COUNTRY_TYPE_FILTER)
        .ilike("name", country)
        .order("depth", { ascending: true })
        .limit(1);
      const match = (data ?? [])[0] as { id: number } | undefined;
      if (cancelled || !match) return;
      const latest = profileRef.current;
      const latestRep = (latest.legal_rep ?? {}) as Record<string, string | number | undefined>;
      const patch: Record<string, string | number> = {};
      if (!Number(latestRep.nationality_id)) patch.nationality_id = match.id;
      if (!Number(latestRep.country_of_residence_id)) patch.country_of_residence_id = match.id;
      if (Object.keys(patch).length === 0) return;
      onCompanyProfileChange({
        ...latest,
        legal_rep: { ...latestRep, ...patch } as RuCompanyProfile["legal_rep"],
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [propertyCountry, onCompanyProfileChange]);


  /**
   * Mandatory set = everything that can block a Rentals United company/property
   * push, or that decides which RU LocationID (and therefore which currency) the
   * property gets locked into.
   */
  const missing = useMemo(() => {
    const out: string[] = [];
    const need = (label: string, value: unknown) => {
      if (!String(value ?? "").trim()) out.push(label);
    };
    need("Registered Business Name", registeredBusinessName);
    need("Key Representative", keyRepresentative);
    need("Mobile Number", mobileNumber);
    need("Country", propertyCountry);
    need("Region / province", companyProfile.region);
    need("City", propertyCity);
    if (!normalizeRuTimeZone(companyProfile.time_zone)) out.push("Time zone");
    if (!ruLocationId) out.push("RU LocationID");
    if (banking.has_vat) need("VAT number", banking.vat_number);
    need("Rep first name", rep.first_name);
    need("Rep last name", rep.last_name);
    need("Rep email", rep.email);
    if (!Number(rep.nationality_id)) out.push("Rep nationality");
    if (!Number(rep.country_of_residence_id)) out.push("Rep country of residence");
    return out;
  }, [
    registeredBusinessName,
    keyRepresentative,
    mobileNumber,
    propertyCountry,
    propertyCity,
    companyProfile.region,
    companyProfile.time_zone,
    ruLocationId,
    banking.has_vat,
    banking.vat_number,
    rep.first_name,
    rep.last_name,
    rep.email,
    rep.nationality_id,
    rep.country_of_residence_id,
  ]);

  return (
    <Collapsible defaultOpen={false}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer px-4 py-2 transition-colors hover:bg-muted/50">
            <CardTitle className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                Company Information
                <span className="text-[10px] font-normal text-muted-foreground">
                  (contract · banking · Rentals United)
                </span>
              </span>
              <span className="flex items-center gap-2">
                {missing.length === 0 ? (
                  <Badge variant="outline" className="h-5 gap-1 border-green-600 text-[10px] text-green-700">
                    <Check className="h-3 w-3" />
                    Complete
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="h-5 gap-1 text-[10px]">
                    <AlertTriangle className="h-3 w-3" />
                    {missing.length} missing
                  </Badge>
                )}
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </span>
            </CardTitle>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="space-y-4 px-4 py-2">
            {missing.length > 0 && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 px-2.5 py-2">
                <p className="text-[11px] font-semibold text-destructive">
                  {missing.length} mandatory field{missing.length === 1 ? "" : "s"} outstanding
                </p>
                <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">
                  {missing.join(" · ")}
                </p>
              </div>
            )}

            {/* ── Legal entity ── */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Legal entity
                </p>
                <div className="flex items-center gap-2">
                  <Label htmlFor="has_vat" className="text-xs font-normal text-muted-foreground">
                    VAT Registered?
                  </Label>
                  <Switch
                    id="has_vat"
                    checked={banking.has_vat}
                    onCheckedChange={(checked) => onBankingChange("has_vat", checked)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                <div className="flex flex-col gap-1">
                  <Label htmlFor="registered_business_name" className="text-xs">
                    Registered Business Name<Req />
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
                    Mobile Number<Req />
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
                    Key Representative<Req />
                  </Label>
                  <Input
                    id="key_representative"
                    value={keyRepresentative}
                    onChange={(e) => onKeyRepresentativeChange(e.target.value)}
                    placeholder="e.g., John Smith"
                    className="h-7 text-xs"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="property_registration" className="text-xs">
                    Registration #
                  </Label>
                  <Input
                    id="property_registration"
                    value={banking.property_registration}
                    onChange={(e) => onBankingChange("property_registration", e.target.value)}
                    placeholder="Company registration"
                    className="h-7 text-xs"
                  />
                </div>
                {banking.has_vat && (
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="vat_number" className="text-xs">
                      VAT #<Req />
                    </Label>
                    <Input
                      id="vat_number"
                      value={banking.vat_number}
                      onChange={(e) => onBankingChange("vat_number", e.target.value)}
                      placeholder="VAT number"
                      className="h-7 text-xs"
                    />
                  </div>
                )}
                <div className="flex flex-col gap-1">
                  <Label className="text-xs">
                    Time zone<Req />
                  </Label>
                  <Select
                    value={normalizedTimeZone}
                    onValueChange={(v) => setField("time_zone", v)}
                  >
                    <SelectTrigger className="h-7 text-xs">
                      <SelectValue placeholder="Select a time zone" />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      {RU_TIME_ZONE_GROUPS.map((group) => (
                        <SelectGroup key={group}>
                          <SelectLabel className="text-[10px] uppercase tracking-wide">
                            {group}
                          </SelectLabel>
                          {RU_TIME_ZONES.filter((z) => z.group === group).map((z) => (
                            <SelectItem key={z.value} value={z.value} className="text-xs">
                              ({z.offset}) {z.label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      ))}
                    </SelectContent>
                  </Select>
                  <Hint>
                    Rentals United requires a canonical zone name (e.g. Africa/Johannesburg) — free
                    text like “UTC+2” is rejected on the company push.
                  </Hint>
                  {rawTimeZone && !normalizedTimeZone && (
                    <p className="text-[10px] leading-snug text-destructive">
                      Stored value “{rawTimeZone}” is not a valid RU time zone — pick one above.
                    </p>
                  )}
                </div>
                {COMPANY_TEXT_FIELDS.map((f) => (
                  <div key={String(f.key)} className="flex flex-col gap-1">
                    <Label className="text-xs">
                      {f.label}
                      {f.required && <Req />}
                    </Label>
                    <Input
                      value={str(companyProfile[f.key])}
                      placeholder={f.placeholder}
                      onChange={(e) => setField(f.key, e.target.value)}
                      className="h-7 text-xs"
                    />
                    {f.hint && <Hint>{f.hint}</Hint>}
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
                    {f.hint && <Hint>{f.hint}</Hint>}
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

            {/* ── Banking (contract / payouts) ── */}
            <div className="space-y-2 border-t border-border pt-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Banking <span className="font-normal normal-case tracking-normal">(contract / payouts)</span>
              </p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-3 xl:grid-cols-6">
                {BANKING_FIELDS.map((f) => (
                  <div key={f.key} className="flex flex-col gap-1">
                    <Label htmlFor={f.key} className="text-xs">
                      {f.label}
                    </Label>
                    {f.options ? (
                      <Select
                        value={String(banking[f.key] ?? "")}
                        onValueChange={(v) => onBankingChange(f.key, v)}
                      >
                        <SelectTrigger id={f.key} className="h-7 text-xs">
                          <SelectValue placeholder={f.placeholder} />
                        </SelectTrigger>
                        <SelectContent>
                          {f.options.map((o) => (
                            <SelectItem key={o} value={o} className="text-xs">
                              {o}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        id={f.key}
                        inputMode={f.numeric ? "numeric" : undefined}
                        value={String(banking[f.key] ?? "")}
                        onChange={(e) =>
                          onBankingChange(
                            f.key,
                            f.key === "swift_code" ? e.target.value.toUpperCase() : e.target.value,
                          )
                        }
                        placeholder={f.placeholder}
                        className="h-7 text-xs"
                      />
                    )}
                    {f.hint && <Hint>{f.hint}</Hint>}
                  </div>
                ))}

              </div>
            </div>

            {/* ── RU location register ── */}
            <div className="space-y-1.5 rounded-md border border-border bg-muted/30 p-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Rentals United location<Req />
              </p>
              <RuLocationPicker
                value={ruLocationId}
                onChange={(id) => onRuLocationIdChange(id)}
                initialQuery={propertyCity ?? ""}
              />
              <p className="text-[10px] leading-snug text-muted-foreground">
                Attaches a real RU LocationID to this property and its company push. RU owns the
                currency on the LocationID, so an explicit selection here decides which currency the
                property is locked into.
              </p>
            </div>

            {/* ── Legal representative ── */}
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Legal representative{" "}
                <span className="font-normal normal-case tracking-normal">
                  (nationality is mandatory for Rentals United)
                </span>
              </p>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                {REP_FIELDS.map((f) => (
                  <div key={f.key} className="flex flex-col gap-1">
                    <Label className="text-xs">
                      {f.label}
                      {f.required && <Req />}
                    </Label>
                    <Input
                      type={f.type ?? "text"}
                      value={str(rep[f.key])}
                      placeholder={f.placeholder}
                      onChange={(e) => setRepField(f.key, e.target.value)}
                      className="h-7 text-xs"
                    />
                    {f.hint && <Hint>{f.hint}</Hint>}
                  </div>
                ))}

              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <Label className="text-xs">
                    Nationality (RU location)
                    <Req />
                  </Label>
                  <RuLocationPicker
                    value={Number(rep.nationality_id) || null}
                    onChange={(id) => setRepField("nationality_id", id)}
                    typeFilter={RU_COUNTRY_TYPE_FILTER}
                    placeholder="Search countries…"
                    allowRefresh={false}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-xs">
                    Country of residence (RU location)
                    <Req />
                  </Label>
                  <RuLocationPicker
                    value={Number(rep.country_of_residence_id) || null}
                    onChange={(id) => setRepField("country_of_residence_id", id)}
                    typeFilter={RU_COUNTRY_TYPE_FILTER}
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
