import { useState, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { 
  Clock, Shield, ChevronDown, PawPrint, FileText, Landmark, 
  Upload, Loader2, Key, Phone, Baby, AlertTriangle
} from "lucide-react";
import { StepProps } from "./types";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const ACCOUNT_TYPES = [
  { value: "cheque", label: "Cheque/Current" },
  { value: "savings", label: "Savings" },
  { value: "transmission", label: "Transmission" },
  { value: "business", label: "Business" }
];

export function StepPoliciesPricing({
  propertyData,
  updateField,
  getAmenityValue
}: StepProps) {
  const { toast } = useToast();
  const [openSections, setOpenSections] = useState({
    checkin: true,
    procedures: false,
    guests: true,
    banking: false,
    terms: false
  });
  const [isUploadingLetter, setIsUploadingLetter] = useState(false);

  // ── Nested object helpers ──
  // The PropertyForm reads house_rules as an object (house_rules.check_in_from, etc.)
  // so the wizard must write into that nested structure to persist correctly.
  const houseRules = getAmenityValue<Record<string, unknown>>("house_rules", {});
  const banking = getAmenityValue<Record<string, unknown>>("banking", {});

  const getHouseRule = <T,>(key: string, defaultValue: T): T => {
    const val = houseRules?.[key];
    return (val !== undefined && val !== null ? val : defaultValue) as T;
  };

  const getBanking = <T,>(key: string, defaultValue: T): T => {
    const val = banking?.[key];
    return (val !== undefined && val !== null ? val : defaultValue) as T;
  };

  const updateHouseRule = (key: string, value: unknown) => {
    updateField("amenities.house_rules", { ...houseRules, [key]: value });
  };

  const updateBanking = (key: string, value: unknown) => {
    updateField("amenities.banking", { ...banking, [key]: value });
  };

  // Check-in/out time ranges — nested under house_rules
  const checkInFrom = getHouseRule<string>("check_in_from", "");
  const checkInTo = getHouseRule<string>("check_in_to", "");
  const checkOutFrom = getHouseRule<string>("check_out_from", "");
  const checkOutTo = getHouseRule<string>("check_out_to", "");
  const reception24h = getHouseRule<boolean>("twenty_four_hour_reception", false);

  // Operational procedures — nested under house_rules
  const keyCollectionProcedure = getHouseRule<string>("key_collection_procedure", "");
  const receptionHours = getHouseRule<string>("reception_hours", "");
  const lateCheckInProcedure = getHouseRule<string>("late_check_in_procedure", "");
  const afterHoursContact = getHouseRule<string>("after_hours_contact", "");

  // Guest policies — nested under house_rules
  const minCheckInAge = getHouseRule<number | null>("min_check_in_age", null);
  const childAdultAge = getHouseRule<number | null>("child_adult_age", null);
  const petsAllowed = getHouseRule<boolean>("pets_allowed", false);
  const petsPolicy = getHouseRule<string>("pets_policy", "");
  const childrenPolicy = getHouseRule<string>("children_policy", "");

  // Banking — nested under banking
  const bankName = getBanking<string>("bank_name", "");
  const branchCode = getBanking<string>("branch_code", "");
  const accountHolder = getBanking<string>("account_holder", "");
  const accountNumber = getBanking<string>("account_number", "");
  const accountType = getBanking<string>("account_type", "");
  const swiftCode = getBanking<string>("swift_code", "");
  const bankConfirmationLetterUrl = getBanking<string>("bank_confirmation_letter_url", "");

  // Terms — nested under house_rules (text fields)
  const paymentPolicy = getHouseRule<string>("payment_policy", "");
  const cancellationPolicy = getAmenityValue<string>("cancellation_policies", "");
  const noShowPolicy = getHouseRule<string>("no_show_policy", "");
  const houseRulesText = getHouseRule<string>("house_rules_text", "");

  const toggleSection = (section: keyof typeof openSections) => {
    setOpenSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const handleBankLetterUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "File too large", description: "Max 10MB", variant: "destructive" });
      return;
    }

    setIsUploadingLetter(true);
    try {
      const fileName = `${propertyData.id}/bank-confirmation-${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("property-documents")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("property-documents")
        .getPublicUrl(fileName);

      updateBanking("bank_confirmation_letter_url", publicUrl);
      toast({ title: "Bank confirmation letter uploaded" });
    } catch (error) {
      toast({ title: "Upload failed", variant: "destructive" });
    } finally {
      setIsUploadingLetter(false);
      e.target.value = "";
    }
  }, [propertyData.id, banking, updateField, toast]);

  return (
    <div className="space-y-4">
      {/* Check-in & Check-out */}
      <Collapsible open={openSections.checkin} onOpenChange={() => toggleSection("checkin")}>
        <CollapsibleTrigger className="flex items-center justify-between w-full p-3 rounded-lg border hover:bg-muted/50 transition-colors">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            <span className="font-medium">Check-in & Check-out Times</span>
          </div>
          <ChevronDown className={cn("h-4 w-4 transition-transform", openSections.checkin && "rotate-180")} />
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3 space-y-4">
          {/* Check-in time range */}
          <div className="space-y-2">
            <Label className="text-sm">Check-in Window</Label>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="check_in_from" className="text-xs text-muted-foreground">From</Label>
                <Input
                  id="check_in_from"
                  type="time"
                  value={checkInFrom}
                  onChange={(e) => updateHouseRule("check_in_from", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="check_in_to" className="text-xs text-muted-foreground">To</Label>
                <Input
                  id="check_in_to"
                  type="time"
                  value={checkInTo}
                  onChange={(e) => updateHouseRule("check_in_to", e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Check-out time range */}
          <div className="space-y-2">
            <Label className="text-sm">Check-out Window</Label>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="check_out_from" className="text-xs text-muted-foreground">From</Label>
                <Input
                  id="check_out_from"
                  type="time"
                  value={checkOutFrom}
                  onChange={(e) => updateHouseRule("check_out_from", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="check_out_to" className="text-xs text-muted-foreground">To</Label>
                <Input
                  id="check_out_to"
                  type="time"
                  value={checkOutTo}
                  onChange={(e) => updateHouseRule("check_out_to", e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <Label htmlFor="reception_24h" className="cursor-pointer">24-Hour Reception</Label>
            <Switch
              id="reception_24h"
              checked={reception24h}
              onCheckedChange={(checked) => updateHouseRule("twenty_four_hour_reception", checked)}
            />
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Operational Procedures */}
      <Collapsible open={openSections.procedures} onOpenChange={() => toggleSection("procedures")}>
        <CollapsibleTrigger className="flex items-center justify-between w-full p-3 rounded-lg border hover:bg-muted/50 transition-colors">
          <div className="flex items-center gap-2">
            <Key className="h-4 w-4 text-primary" />
            <span className="font-medium">Arrival Procedures</span>
          </div>
          <ChevronDown className={cn("h-4 w-4 transition-transform", openSections.procedures && "rotate-180")} />
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="key_collection_procedure">Key Collection Procedure</Label>
            <Textarea
              id="key_collection_procedure"
              value={keyCollectionProcedure}
              onChange={(e) => updateHouseRule("key_collection_procedure", e.target.value)}
              placeholder="Describe how guests collect keys (reception, lockbox, meet & greet, etc.)"
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="reception_hours">Reception Operating Hours</Label>
            <Input
              id="reception_hours"
              value={receptionHours}
              onChange={(e) => updateHouseRule("reception_hours", e.target.value)}
              placeholder="e.g., 08:00 - 20:00 daily"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="late_check_in_procedure">Late Check-in Procedure</Label>
            <Textarea
              id="late_check_in_procedure"
              value={lateCheckInProcedure}
              onChange={(e) => updateHouseRule("late_check_in_procedure", e.target.value)}
              placeholder="What should guests do if arriving after reception hours?"
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="after_hours_contact" className="flex items-center gap-1.5">
              <Phone className="h-3 w-3" />
              After-Hours Contact
            </Label>
            <Input
              id="after_hours_contact"
              value={afterHoursContact}
              onChange={(e) => updateHouseRule("after_hours_contact", e.target.value)}
              placeholder="Emergency contact number or instructions"
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
                onChange={(e) => updateHouseRule("min_check_in_age", e.target.value ? parseInt(e.target.value) : null)}
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
                onChange={(e) => updateHouseRule("child_adult_age", e.target.value ? parseInt(e.target.value) : null)}
                placeholder="12"
              />
            </div>
          </div>

          {/* Children Policy */}
          <div className="space-y-2">
            <Label htmlFor="children_policy" className="flex items-center gap-1.5">
              <Baby className="h-3 w-3" />
              Children Policy
            </Label>
            <Textarea
              id="children_policy"
              value={childrenPolicy}
              onChange={(e) => updateHouseRule("children_policy", e.target.value)}
              placeholder="e.g., Children of all ages welcome. Cots available on request. Children under 12 stay free..."
              rows={2}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <Label htmlFor="pets_allowed" className="cursor-pointer">Pets Allowed</Label>
            <Switch
              id="pets_allowed"
              checked={petsAllowed}
              onCheckedChange={(checked) => updateHouseRule("pets_allowed", checked)}
            />
          </div>

          {petsAllowed && (
            <Textarea
              value={petsPolicy}
              onChange={(e) => updateHouseRule("pets_policy", e.target.value)}
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

          {/* Bank Confirmation Letter Upload */}
          <div className="space-y-2">
            <Label>Bank Confirmation Letter (Preferred)</Label>
            {bankConfirmationLetterUrl ? (
              <div className="flex items-center gap-2 p-3 rounded-lg border bg-green-50">
                <FileText className="h-4 w-4 text-green-600" />
                <span className="text-sm text-green-800 flex-1">Letter uploaded</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => updateBanking("bank_confirmation_letter_url", "")}
                >
                  Remove
                </Button>
              </div>
            ) : (
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept=".pdf"
                  onChange={handleBankLetterUpload}
                  className="hidden"
                  disabled={isUploadingLetter}
                />
                <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-4 hover:border-primary transition-colors">
                  {isUploadingLetter ? (
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  ) : (
                    <>
                      <Upload className="h-6 w-6 text-muted-foreground mb-1" />
                      <p className="text-sm">Upload bank confirmation letter (PDF)</p>
                    </>
                  )}
                </div>
              </label>
            )}
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">Or enter manually</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bank_name">Bank Name</Label>
            <Input
              id="bank_name"
              value={bankName}
              onChange={(e) => updateBanking("bank_name", e.target.value)}
              placeholder="e.g., Standard Bank"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="branch_code">Branch Code</Label>
              <Input
                id="branch_code"
                value={branchCode}
                onChange={(e) => updateBanking("branch_code", e.target.value)}
                placeholder="e.g., 051001"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="swift_code">SWIFT Code</Label>
              <Input
                id="swift_code"
                value={swiftCode}
                onChange={(e) => updateBanking("swift_code", e.target.value)}
                placeholder="e.g., SBZAZAJJ"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="account_type">Account Type</Label>
            <Select
              value={accountType}
              onValueChange={(value) => updateBanking("account_type", value)}
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
              onChange={(e) => updateBanking("account_holder", e.target.value)}
              placeholder="Name on account"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="account_number">Account Number</Label>
            <Input
              id="account_number"
              value={accountNumber}
              onChange={(e) => updateBanking("account_number", e.target.value)}
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
              onChange={(e) => updateField("amenities.cancellation_policies", e.target.value)}
              placeholder="e.g., Free cancellation up to 48 hours before arrival..."
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="no_show_policy" className="flex items-center gap-1.5">
              <AlertTriangle className="h-3 w-3" />
              No-Show Policy
            </Label>
            <Textarea
              id="no_show_policy"
              value={noShowPolicy}
              onChange={(e) => updateHouseRule("no_show_policy", e.target.value)}
              placeholder="e.g., Full charge applies for no-shows. Guest must cancel 24 hours prior..."
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="payment_policy">Payment Policy</Label>
            <Textarea
              id="payment_policy"
              value={paymentPolicy}
              onChange={(e) => updateHouseRule("payment_policy", e.target.value)}
              placeholder="e.g., 50% deposit required, balance due on arrival..."
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="house_rules">House Rules / T&Cs</Label>
            <Textarea
              id="house_rules"
              value={houseRulesText}
              onChange={(e) => updateHouseRule("house_rules_text", e.target.value)}
              placeholder="Any specific rules, noise policies, smoking rules, etc."
              rows={4}
            />
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
