import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Phone, Mail, User } from "lucide-react";
import { StepProps } from "./types";

export function StepContactDetails({
  propertyData,
  updateField,
  getAmenityValue
}: StepProps) {
  // Main Contact
  const mainContactName = getAmenityValue<string>("main_contact_name", "");
  const mainContactEmail = getAmenityValue<string>("contact_email", "");
  const mainContactPhone = getAmenityValue<string>("telephone", "");

  // General Manager
  const gmEnabled = getAmenityValue<boolean>("general_manager_enabled", false);
  const gmName = getAmenityValue<string>("general_manager_name", "");
  const gmEmail = getAmenityValue<string>("general_manager_email", "");
  const gmPhone = getAmenityValue<string>("general_manager_phone", "");

  // Reservationist
  const reservationistName = getAmenityValue<string>("reservationist_name", "");
  const reservationistEmail = getAmenityValue<string>("reservationist_email", "");
  const reservationistPhone = getAmenityValue<string>("reservationist_phone", "");

  return (
    <div className="space-y-8">
      <p className="text-muted-foreground">
        Provide contact information for your property. This helps guests and our team 
        reach the right person for inquiries, bookings, and operations.
      </p>

      {/* Main Contact */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <User className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">Main Contact *</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Primary point of contact for all property communications.
        </p>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="main_contact_name">Contact Name</Label>
            <Input
              id="main_contact_name"
              value={mainContactName}
              onChange={(e) => updateField("amenities.main_contact_name", e.target.value)}
              placeholder="Full name"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="main_contact_email" className="flex items-center gap-2">
                <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                Email *
              </Label>
              <Input
                id="main_contact_email"
                type="email"
                value={mainContactEmail}
                onChange={(e) => updateField("amenities.contact_email", e.target.value)}
                placeholder="reservations@yourproperty.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="main_contact_phone" className="flex items-center gap-2">
                <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                Phone *
              </Label>
              <Input
                id="main_contact_phone"
                type="tel"
                value={mainContactPhone}
                onChange={(e) => updateField("amenities.telephone", e.target.value)}
                placeholder="+27 21 123 4567"
              />
            </div>
          </div>
        </div>
      </div>

      {/* General Manager */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <User className="h-5 w-5 text-muted-foreground" />
            <h3 className="font-semibold">General Manager</h3>
          </div>
          <Switch
            checked={gmEnabled}
            onCheckedChange={(checked) => updateField("amenities.general_manager_enabled", checked)}
          />
        </div>

        {gmEnabled && (
          <div className="space-y-4 pl-7 border-l-2 border-muted">
            <div className="space-y-2">
              <Label htmlFor="gm_name">Name</Label>
              <Input
                id="gm_name"
                value={gmName}
                onChange={(e) => updateField("amenities.general_manager_name", e.target.value)}
                placeholder="General Manager name"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="gm_email">Email</Label>
                <Input
                  id="gm_email"
                  type="email"
                  value={gmEmail}
                  onChange={(e) => updateField("amenities.general_manager_email", e.target.value)}
                  placeholder="gm@yourproperty.com"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="gm_phone">Phone</Label>
                <Input
                  id="gm_phone"
                  type="tel"
                  value={gmPhone}
                  onChange={(e) => updateField("amenities.general_manager_phone", e.target.value)}
                  placeholder="+27 21 123 4567"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Reservationist */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <User className="h-5 w-5 text-muted-foreground" />
          <h3 className="font-semibold">Reservationist</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Person responsible for handling booking inquiries and reservations.
        </p>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="reservationist_name">Name</Label>
            <Input
              id="reservationist_name"
              value={reservationistName}
              onChange={(e) => updateField("amenities.reservationist_name", e.target.value)}
              placeholder="Reservationist name"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="reservationist_email">Email</Label>
              <Input
                id="reservationist_email"
                type="email"
                value={reservationistEmail}
                onChange={(e) => updateField("amenities.reservationist_email", e.target.value)}
                placeholder="reservations@yourproperty.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="reservationist_phone">Phone</Label>
              <Input
                id="reservationist_phone"
                type="tel"
                value={reservationistPhone}
                onChange={(e) => updateField("amenities.reservationist_phone", e.target.value)}
                placeholder="+27 21 123 4567"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Info box */}
      <div className="rounded-lg border bg-muted/30 p-4">
        <h4 className="font-medium text-sm mb-2">Why this matters</h4>
        <p className="text-sm text-muted-foreground">
          Having multiple contacts ensures guests and partners can reach the right person.
          The main contact receives all booking notifications, while specific roles handle 
          their respective areas.
        </p>
      </div>
    </div>
  );
}
