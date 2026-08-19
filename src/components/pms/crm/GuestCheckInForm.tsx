import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Loader2 } from "lucide-react";

export interface CheckInSubmission {
  full_name: string;
  email?: string;
  phone?: string;
  address?: string;
  nationality?: string;
  identity_number?: string;
  date_of_birth?: string;
  arrival_time?: string;
  dietary_requirements?: string;
  accessibility_needs?: string;
  preferences?: string;
  special_occasion?: string;
  marketing_consent?: boolean;
  vehicle_registration?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
}

interface GuestCheckInFormProps {
  /** Prefill from the booking or an earlier partial submission. */
  initial?: Partial<CheckInSubmission>;
  submitting?: boolean;
  submitLabel?: string;
  onSubmit: (submission: CheckInSubmission) => void | Promise<void>;
}

const FIELD = "space-y-1.5";

/**
 * Dense digital check-in capture. Shared by the tokenised guest page and the
 * staff-side dialog so both write the same shape.
 */
export function GuestCheckInForm({
  initial,
  submitting = false,
  submitLabel = "Complete check-in",
  onSubmit,
}: GuestCheckInFormProps) {
  const [form, setForm] = useState<CheckInSubmission>({
    full_name: initial?.full_name || "",
    email: initial?.email || "",
    phone: initial?.phone || "",
    address: initial?.address || "",
    nationality: initial?.nationality || "",
    identity_number: "",
    date_of_birth: "",
    arrival_time: initial?.arrival_time || "",
    dietary_requirements: initial?.dietary_requirements || "",
    accessibility_needs: initial?.accessibility_needs || "",
    preferences: initial?.preferences || "",
    special_occasion: initial?.special_occasion || "",
    marketing_consent: initial?.marketing_consent ?? false,
    vehicle_registration: initial?.vehicle_registration || "",
    emergency_contact_name: initial?.emergency_contact_name || "",
    emergency_contact_phone: initial?.emergency_contact_phone || "",
  });

  const set = <K extends keyof CheckInSubmission>(key: K, value: CheckInSubmission[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const nameMissing = !form.full_name.trim();

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (nameMissing) return;
        void onSubmit(form);
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className={FIELD}>
          <Label htmlFor="ci-name">Full name *</Label>
          <Input
            id="ci-name"
            value={form.full_name}
            maxLength={160}
            onChange={(e) => set("full_name", e.target.value)}
            required
          />
        </div>
        <div className={FIELD}>
          <Label htmlFor="ci-email">Email</Label>
          <Input
            id="ci-email"
            type="email"
            value={form.email}
            maxLength={255}
            onChange={(e) => set("email", e.target.value)}
          />
        </div>
        <div className={FIELD}>
          <Label htmlFor="ci-phone">Mobile</Label>
          <Input
            id="ci-phone"
            value={form.phone}
            maxLength={40}
            onChange={(e) => set("phone", e.target.value)}
          />
        </div>
        <div className={FIELD}>
          <Label htmlFor="ci-nat">Nationality</Label>
          <Input
            id="ci-nat"
            value={form.nationality}
            maxLength={120}
            onChange={(e) => set("nationality", e.target.value)}
          />
        </div>
        <div className={FIELD}>
          <Label htmlFor="ci-id">Identity / passport number</Label>
          <Input
            id="ci-id"
            value={form.identity_number}
            maxLength={60}
            onChange={(e) => set("identity_number", e.target.value)}
          />
        </div>
        <div className={FIELD}>
          <Label htmlFor="ci-dob">Date of birth</Label>
          <Input
            id="ci-dob"
            type="date"
            value={form.date_of_birth}
            onChange={(e) => set("date_of_birth", e.target.value)}
          />
        </div>
        <div className={`${FIELD} sm:col-span-2`}>
          <Label htmlFor="ci-addr">Home address</Label>
          <Input
            id="ci-addr"
            value={form.address}
            maxLength={400}
            onChange={(e) => set("address", e.target.value)}
          />
        </div>
      </div>

      <Separator />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className={FIELD}>
          <Label htmlFor="ci-arrival">Estimated arrival time</Label>
          <Input
            id="ci-arrival"
            placeholder="e.g. 16:30"
            value={form.arrival_time}
            maxLength={20}
            onChange={(e) => set("arrival_time", e.target.value)}
          />
        </div>
        <div className={FIELD}>
          <Label htmlFor="ci-vehicle">Vehicle registration</Label>
          <Input
            id="ci-vehicle"
            value={form.vehicle_registration}
            maxLength={40}
            onChange={(e) => set("vehicle_registration", e.target.value)}
          />
        </div>
        <div className={FIELD}>
          <Label htmlFor="ci-diet">Dietary requirements</Label>
          <Textarea
            id="ci-diet"
            rows={2}
            maxLength={600}
            value={form.dietary_requirements}
            onChange={(e) => set("dietary_requirements", e.target.value)}
          />
        </div>
        <div className={FIELD}>
          <Label htmlFor="ci-access">Accessibility needs</Label>
          <Textarea
            id="ci-access"
            rows={2}
            maxLength={600}
            value={form.accessibility_needs}
            onChange={(e) => set("accessibility_needs", e.target.value)}
          />
        </div>
        <div className={FIELD}>
          <Label htmlFor="ci-pref">Preferences we should know</Label>
          <Textarea
            id="ci-pref"
            rows={2}
            maxLength={600}
            value={form.preferences}
            onChange={(e) => set("preferences", e.target.value)}
          />
        </div>
        <div className={FIELD}>
          <Label htmlFor="ci-occasion">Special occasion</Label>
          <Input
            id="ci-occasion"
            placeholder="Anniversary, birthday…"
            value={form.special_occasion}
            maxLength={240}
            onChange={(e) => set("special_occasion", e.target.value)}
          />
        </div>
        <div className={FIELD}>
          <Label htmlFor="ci-em-name">Emergency contact</Label>
          <Input
            id="ci-em-name"
            value={form.emergency_contact_name}
            maxLength={160}
            onChange={(e) => set("emergency_contact_name", e.target.value)}
          />
        </div>
        <div className={FIELD}>
          <Label htmlFor="ci-em-phone">Emergency contact number</Label>
          <Input
            id="ci-em-phone"
            value={form.emergency_contact_phone}
            maxLength={40}
            onChange={(e) => set("emergency_contact_phone", e.target.value)}
          />
        </div>
      </div>

      <label className="flex items-start gap-2 text-sm text-muted-foreground">
        <Checkbox
          checked={Boolean(form.marketing_consent)}
          onCheckedChange={(v) => set("marketing_consent", v === true)}
        />
        <span>Keep me posted about offers and news from this property.</span>
      </label>

      <Button type="submit" disabled={submitting || nameMissing} className="w-full sm:w-auto">
        {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {submitLabel}
      </Button>
    </form>
  );
}
