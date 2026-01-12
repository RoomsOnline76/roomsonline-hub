import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Shield, Building2 } from "lucide-react";
import { StepProps } from "./types";

const ACCOUNT_TYPES = [
  { value: "cheque", label: "Cheque/Current Account" },
  { value: "savings", label: "Savings Account" },
  { value: "transmission", label: "Transmission Account" },
  { value: "business", label: "Business Account" }
];

export function StepBanking({
  updateField,
  getAmenityValue
}: StepProps) {
  // Business Registration Fields
  const registeredBusinessName = getAmenityValue<string>("registered_business_name", "");
  const registrationNumber = getAmenityValue<string>("registration_number", "");
  const vatNumber = getAmenityValue<string>("vat_number", "");
  const postalAddress = getAmenityValue<string>("postal_address", "");

  // Banking Fields
  const bankName = getAmenityValue<string>("bank_name", "");
  const branchCode = getAmenityValue<string>("branch_code", "");
  const accountHolder = getAmenityValue<string>("account_holder", "");
  const accountNumber = getAmenityValue<string>("account_number", "");
  const accountType = getAmenityValue<string>("account_type", "");
  const swiftCode = getAmenityValue<string>("swift_code", "");

  return (
    <div className="space-y-8">
      <p className="text-muted-foreground">
        Provide your business registration and banking details. This information 
        is required for your contract and payment processing.
      </p>

      {/* Business Registration Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Building2 className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">Business Registration</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          These details will appear on your contract agreement.
        </p>

        {/* Registered Business Name */}
        <div className="space-y-2">
          <Label htmlFor="registered_business_name">Registered Business Name</Label>
          <Input
            id="registered_business_name"
            value={registeredBusinessName}
            onChange={(e) => updateField("amenities.registered_business_name", e.target.value)}
            placeholder="e.g., Coral Tree Cottages (Pty) Ltd"
          />
          <p className="text-xs text-muted-foreground">
            Legal entity name as registered with CIPC (if applicable)
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Company Registration Number */}
          <div className="space-y-2">
            <Label htmlFor="registration_number">Company Registration Number</Label>
            <Input
              id="registration_number"
              value={registrationNumber}
              onChange={(e) => updateField("amenities.registration_number", e.target.value)}
              placeholder="e.g., 2018/123456/07"
            />
          </div>

          {/* VAT Number */}
          <div className="space-y-2">
            <Label htmlFor="vat_number">VAT Number (Optional)</Label>
            <Input
              id="vat_number"
              value={vatNumber}
              onChange={(e) => updateField("amenities.vat_number", e.target.value)}
              placeholder="e.g., 4123456789"
            />
          </div>
        </div>

        {/* Postal Address */}
        <div className="space-y-2">
          <Label htmlFor="postal_address">Postal Address</Label>
          <Textarea
            id="postal_address"
            value={postalAddress}
            onChange={(e) => updateField("amenities.postal_address", e.target.value)}
            placeholder="PO Box 123, Plettenberg Bay, 6600"
            rows={2}
          />
          <p className="text-xs text-muted-foreground">
            Leave blank if same as physical address
          </p>
        </div>
      </div>

      {/* Banking Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-green-600" />
          <h3 className="font-semibold">Banking Details</h3>
        </div>

        {/* Security notice */}
        <Alert className="border-green-200 bg-green-50">
          <Shield className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800 text-sm">
            Your banking information is encrypted and stored securely. It will only be 
            used for processing payments related to your property bookings.
          </AlertDescription>
        </Alert>

        {/* Bank Name */}
        <div className="space-y-2">
          <Label htmlFor="bank_name">Bank Name</Label>
          <Input
            id="bank_name"
            value={bankName}
            onChange={(e) => updateField("amenities.bank_name", e.target.value)}
            placeholder="e.g., Standard Bank, FNB, Nedbank"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Branch Code */}
          <div className="space-y-2">
            <Label htmlFor="branch_code">Branch Code</Label>
            <Input
              id="branch_code"
              value={branchCode}
              onChange={(e) => updateField("amenities.branch_code", e.target.value)}
              placeholder="e.g., 051001"
            />
          </div>

          {/* SWIFT Code */}
          <div className="space-y-2">
            <Label htmlFor="swift_code">SWIFT/BIC Code</Label>
            <Input
              id="swift_code"
              value={swiftCode}
              onChange={(e) => updateField("amenities.swift_code", e.target.value)}
              placeholder="e.g., SBZAZAJJ"
            />
            <p className="text-xs text-muted-foreground">
              For international payments
            </p>
          </div>
        </div>

        {/* Account Type */}
        <div className="space-y-2">
          <Label htmlFor="account_type">Account Type</Label>
          <Select
            value={accountType}
            onValueChange={(value) => updateField("amenities.account_type", value)}
          >
            <SelectTrigger id="account_type">
              <SelectValue placeholder="Select account type" />
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

        {/* Account Holder */}
        <div className="space-y-2">
          <Label htmlFor="account_holder">Account Holder Name</Label>
          <Input
            id="account_holder"
            value={accountHolder}
            onChange={(e) => updateField("amenities.account_holder", e.target.value)}
            placeholder="Name as it appears on the account"
          />
        </div>

        {/* Account Number */}
        <div className="space-y-2">
          <Label htmlFor="account_number">Account Number</Label>
          <Input
            id="account_number"
            value={accountNumber}
            onChange={(e) => updateField("amenities.account_number", e.target.value)}
            placeholder="Your bank account number"
            type="password"
            autoComplete="off"
          />
          <p className="text-xs text-muted-foreground">
            Account number is hidden for security
          </p>
        </div>
      </div>

      {/* Info box */}
      <div className="rounded-lg border bg-muted/30 p-4">
        <h4 className="font-medium text-sm mb-2">Why we need this</h4>
        <p className="text-sm text-muted-foreground">
          Business registration details are required for your partnership contract. 
          Banking details are used to process payments from guests to your property 
          using secure, PCI-compliant systems.
        </p>
      </div>
    </div>
  );
}
