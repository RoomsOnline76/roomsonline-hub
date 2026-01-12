import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Clock, Shield, ChevronDown, PawPrint, FileText, Landmark } from "lucide-react";
import { StepProps } from "./types";
import { cn } from "@/lib/utils";

const ACCOUNT_TYPES = [
  { value: "cheque", label: "Cheque/Current" },
  { value: "savings", label: "Savings" },
  { value: "transmission", label: "Transmission" },
  { value: "business", label: "Business" }
];

export function StepPoliciesPricing({
  updateField,
  getAmenityValue
}: StepProps) {
  const [openSections, setOpenSections] = useState({
    checkin: true,
    guests: true,
    banking: false,
    terms: false
  });

  // Check-in/out
  const checkInTime = getAmenityValue<string>("check_in_time", "");
  const checkOutTime = getAmenityValue<string>("check_out_time", "");
  const reception24h = getAmenityValue<boolean>("twenty_four_hour_reception", false);

  // Guest policies
  const minCheckInAge = getAmenityValue<number | null>("min_check_in_age", null);
  const childAdultAge = getAmenityValue<number | null>("child_adult_age", null);
  const petsAllowed = getAmenityValue<boolean>("pets_allowed", false);
  const petsPolicy = getAmenityValue<string>("pets_policy", "");

  // Banking
  const bankName = getAmenityValue<string>("bank_name", "");
  const branchCode = getAmenityValue<string>("branch_code", "");
  const accountHolder = getAmenityValue<string>("account_holder", "");
  const accountNumber = getAmenityValue<string>("account_number", "");
  const accountType = getAmenityValue<string>("account_type", "");
  const swiftCode = getAmenityValue<string>("swift_code", "");

  // Terms
  const paymentPolicy = getAmenityValue<string>("payment_policy", "");
  const cancellationPolicy = getAmenityValue<string>("cancellation_policy", "");

  const toggleSection = (section: keyof typeof openSections) => {
    setOpenSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  return (
    <div className="space-y-4">
      {/* Check-in & Check-out */}
      <Collapsible open={openSections.checkin} onOpenChange={() => toggleSection("checkin")}>
        <CollapsibleTrigger className="flex items-center justify-between w-full p-3 rounded-lg border hover:bg-muted/50 transition-colors">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            <span className="font-medium">Check-in & Check-out</span>
          </div>
          <ChevronDown className={cn("h-4 w-4 transition-transform", openSections.checkin && "rotate-180")} />
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="check_in_time">Check-in Time</Label>
              <Input
                id="check_in_time"
                type="time"
                value={checkInTime}
                onChange={(e) => updateField("amenities.check_in_time", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="check_out_time">Check-out Time</Label>
              <Input
                id="check_out_time"
                type="time"
                value={checkOutTime}
                onChange={(e) => updateField("amenities.check_out_time", e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <Label htmlFor="reception_24h" className="cursor-pointer">24-Hour Reception</Label>
            <Switch
              id="reception_24h"
              checked={reception24h}
              onCheckedChange={(checked) => updateField("amenities.twenty_four_hour_reception", checked)}
            />
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Guest Policies */}
      <Collapsible open={openSections.guests} onOpenChange={() => toggleSection("guests")}>
        <CollapsibleTrigger className="flex items-center justify-between w-full p-3 rounded-lg border hover:bg-muted/50 transition-colors">
          <div className="flex items-center gap-2">
            <PawPrint className="h-4 w-4 text-primary" />
            <span className="font-medium">Guest Policies</span>
          </div>
          <ChevronDown className={cn("h-4 w-4 transition-transform", openSections.guests && "rotate-180")} />
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="min_check_in_age">Min Check-in Age</Label>
              <Input
                id="min_check_in_age"
                type="number"
                min={0}
                max={99}
                value={minCheckInAge || ""}
                onChange={(e) => updateField("amenities.min_check_in_age", e.target.value ? parseInt(e.target.value) : null)}
                placeholder="18"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="child_adult_age">Child/Adult Age</Label>
              <Input
                id="child_adult_age"
                type="number"
                min={0}
                max={99}
                value={childAdultAge || ""}
                onChange={(e) => updateField("amenities.child_adult_age", e.target.value ? parseInt(e.target.value) : null)}
                placeholder="12"
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <Label htmlFor="pets_allowed" className="cursor-pointer">Pets Allowed</Label>
            <Switch
              id="pets_allowed"
              checked={petsAllowed}
              onCheckedChange={(checked) => updateField("amenities.pets_allowed", checked)}
            />
          </div>

          {petsAllowed && (
            <Textarea
              value={petsPolicy}
              onChange={(e) => updateField("amenities.pets_policy", e.target.value)}
              placeholder="Pet policy details (size restrictions, fees, etc.)"
              rows={2}
            />
          )}
        </CollapsibleContent>
      </Collapsible>

      {/* Banking Details */}
      <Collapsible open={openSections.banking} onOpenChange={() => toggleSection("banking")}>
        <CollapsibleTrigger className="flex items-center justify-between w-full p-3 rounded-lg border hover:bg-muted/50 transition-colors">
          <div className="flex items-center gap-2">
            <Landmark className="h-4 w-4 text-primary" />
            <span className="font-medium">Banking Details</span>
          </div>
          <ChevronDown className={cn("h-4 w-4 transition-transform", openSections.banking && "rotate-180")} />
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3 space-y-4">
          <Alert className="border-green-200 bg-green-50">
            <Shield className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800 text-sm">
              Banking info is encrypted and used only for booking payments.
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <Label htmlFor="bank_name">Bank Name</Label>
            <Input
              id="bank_name"
              value={bankName}
              onChange={(e) => updateField("amenities.bank_name", e.target.value)}
              placeholder="e.g., Standard Bank"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="branch_code">Branch Code</Label>
              <Input
                id="branch_code"
                value={branchCode}
                onChange={(e) => updateField("amenities.branch_code", e.target.value)}
                placeholder="e.g., 051001"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="swift_code">SWIFT Code</Label>
              <Input
                id="swift_code"
                value={swiftCode}
                onChange={(e) => updateField("amenities.swift_code", e.target.value)}
                placeholder="e.g., SBZAZAJJ"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="account_type">Account Type</Label>
            <Select
              value={accountType}
              onValueChange={(value) => updateField("amenities.account_type", value)}
            >
              <SelectTrigger id="account_type">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                {ACCOUNT_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="account_holder">Account Holder</Label>
            <Input
              id="account_holder"
              value={accountHolder}
              onChange={(e) => updateField("amenities.account_holder", e.target.value)}
              placeholder="Name on account"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="account_number">Account Number</Label>
            <Input
              id="account_number"
              value={accountNumber}
              onChange={(e) => updateField("amenities.account_number", e.target.value)}
              placeholder="Your account number"
              type="password"
              autoComplete="off"
            />
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Terms & Policies */}
      <Collapsible open={openSections.terms} onOpenChange={() => toggleSection("terms")}>
        <CollapsibleTrigger className="flex items-center justify-between w-full p-3 rounded-lg border hover:bg-muted/50 transition-colors">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            <span className="font-medium">Terms & Policies</span>
          </div>
          <ChevronDown className={cn("h-4 w-4 transition-transform", openSections.terms && "rotate-180")} />
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cancellation_policy">Cancellation Policy</Label>
            <Textarea
              id="cancellation_policy"
              value={cancellationPolicy}
              onChange={(e) => updateField("amenities.cancellation_policy", e.target.value)}
              placeholder="e.g., Free cancellation up to 48 hours before arrival..."
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="payment_policy">Payment Policy</Label>
            <Textarea
              id="payment_policy"
              value={paymentPolicy}
              onChange={(e) => updateField("amenities.payment_policy", e.target.value)}
              placeholder="e.g., 50% deposit required, balance due on arrival..."
              rows={3}
            />
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
