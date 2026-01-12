import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Phone, Mail } from "lucide-react";
import { StepProps } from "./types";

export function StepContactDetails({
  propertyData,
  updateField,
  getAmenityValue
}: StepProps) {
  const telephone = getAmenityValue<string>("telephone", "");
  const contactEmail = getAmenityValue<string>("contact_email", "");

  return (
    <div className="space-y-6">
      <p className="text-muted-foreground">
        Provide contact information that guests can use to reach your property.
      </p>

      {/* Telephone */}
      <div className="space-y-2">
        <Label htmlFor="telephone" className="flex items-center gap-2">
          <Phone className="h-4 w-4 text-muted-foreground" />
          Telephone Number
        </Label>
        <Input
          id="telephone"
          type="tel"
          value={telephone}
          onChange={(e) => updateField("amenities.telephone", e.target.value)}
          placeholder="+27 21 123 4567"
        />
        <p className="text-xs text-muted-foreground">
          Include country code for international guests
        </p>
      </div>

      {/* Contact Email */}
      <div className="space-y-2">
        <Label htmlFor="contact_email" className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-muted-foreground" />
          Contact Email
        </Label>
        <Input
          id="contact_email"
          type="email"
          value={contactEmail}
          onChange={(e) => updateField("amenities.contact_email", e.target.value)}
          placeholder="reservations@yourproperty.com"
        />
        <p className="text-xs text-muted-foreground">
          Email address for booking inquiries and guest communication
        </p>
      </div>

      {/* Info box */}
      <div className="rounded-lg border bg-muted/30 p-4">
        <h4 className="font-medium text-sm mb-2">Why this matters</h4>
        <p className="text-sm text-muted-foreground">
          Clear contact information helps guests reach you quickly for questions, 
          special requests, or last-minute changes. This builds trust and improves 
          the booking experience.
        </p>
      </div>
    </div>
  );
}
