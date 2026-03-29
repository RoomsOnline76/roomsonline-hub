import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Building2, CheckCircle } from "lucide-react";
import { useRepBankDetails } from "@/hooks/useRepBankDetails";

interface RepBankingFormProps {
  repId: string;
}

export function RepBankingForm({ repId }: RepBankingFormProps) {
  const { bankDetails, isLoading, upsert } = useRepBankDetails(repId);
  const [form, setForm] = useState({
    bank_name: "",
    branch_code: "",
    account_holder: "",
    account_number: "",
    account_type: "cheque",
    swift_code: "",
  });

  useEffect(() => {
    if (bankDetails) {
      setForm({
        bank_name: bankDetails.bank_name || "",
        branch_code: bankDetails.branch_code || "",
        account_holder: bankDetails.account_holder || "",
        account_number: "",
        account_type: bankDetails.account_type || "cheque",
        swift_code: bankDetails.swift_code || "",
      });
    }
  }, [bankDetails]);

  const handleSave = () => {
    upsert.mutate({
      rep_id: repId,
      bank_name: form.bank_name,
      branch_code: form.branch_code || null,
      account_holder: form.account_holder,
      account_number: form.account_number || undefined,
      account_type: form.account_type,
      swift_code: form.swift_code || null,
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-3 border-t pt-3 mt-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium">Banking Details</span>
        </div>
        {bankDetails?.is_verified && (
          <Badge variant="outline" className="text-[10px] gap-1 text-emerald-600 border-emerald-200">
            <CheckCircle className="h-2.5 w-2.5" /> Verified
          </Badge>
        )}
      </div>

      {bankDetails && !form.account_number && bankDetails.account_number_masked && (
        <p className="text-xs text-muted-foreground">
          Account on file: <span className="font-mono">{bankDetails.account_number_masked}</span>
        </p>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Bank Name</Label>
          <Input
            value={form.bank_name}
            onChange={(e) => setForm({ ...form, bank_name: e.target.value })}
            placeholder="FNB"
            className="h-7 text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Branch Code</Label>
          <Input
            value={form.branch_code}
            onChange={(e) => setForm({ ...form, branch_code: e.target.value })}
            placeholder="250655"
            className="h-7 text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Account Holder</Label>
          <Input
            value={form.account_holder}
            onChange={(e) => setForm({ ...form, account_holder: e.target.value })}
            placeholder="John Smith"
            className="h-7 text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Account Number</Label>
          <Input
            value={form.account_number}
            onChange={(e) => setForm({ ...form, account_number: e.target.value })}
            placeholder={bankDetails?.account_number_masked || "Enter account number"}
            className="h-7 text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Account Type</Label>
          <Select value={form.account_type} onValueChange={(v) => setForm({ ...form, account_type: v })}>
            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="cheque">Cheque</SelectItem>
              <SelectItem value="savings">Savings</SelectItem>
              <SelectItem value="transmission">Transmission</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">SWIFT Code</Label>
          <Input
            value={form.swift_code}
            onChange={(e) => setForm({ ...form, swift_code: e.target.value })}
            placeholder="FIRNZAJJ"
            className="h-7 text-xs"
          />
        </div>
      </div>

      <div className="flex justify-end">
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={handleSave}
          disabled={upsert.isPending || !form.bank_name || !form.account_holder}
        >
          {upsert.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
          Save Banking
        </Button>
      </div>
    </div>
  );
}
