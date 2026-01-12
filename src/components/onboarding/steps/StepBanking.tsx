import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Shield } from "lucide-react";
import { StepProps } from "./types";

export function StepBanking({
  updateField,
  getAmenityValue
}: StepProps) {
  const bankName = getAmenityValue<string>("bank_name", "");
  const branchCode = getAmenityValue<string>("branch_code", "");
  const accountHolder = getAmenityValue<string>("account_holder", "");
  const accountNumber = getAmenityValue<string>("account_number", "");
  const swiftCode = getAmenityValue<string>("swift_code", "");

  return (
    <div className="space-y-6">
      <p className="text-muted-foreground">
        Provide your banking details for payment processing. This information 
        is securely stored and used only for transaction settlements.
      </p>

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

      {/* Info box */}
      <div className="rounded-lg border bg-muted/30 p-4">
        <h4 className="font-medium text-sm mb-2">Why we need this</h4>
        <p className="text-sm text-muted-foreground">
          Banking details are required to process payments from guests to your property. 
          We use secure, PCI-compliant systems to handle all financial data.
        </p>
      </div>
    </div>
  );
}
