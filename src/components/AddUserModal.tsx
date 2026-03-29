import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { z } from "zod";
import { getPMSSystemByKey, ALL_PMS_SYSTEMS } from "@/lib/pmsSystemsConfig";
import { CheckCircle2, Building2, Handshake } from "lucide-react";

const userSchema = z.object({
  full_name: z.string().trim().min(1, "Name is required").max(100),
  email: z.string().trim().email("Invalid email address").max(255),
});

interface AddUserModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: "admin" | "user" | "sales_rep";
  onUserAdded: () => void;
  defaultEmail?: string;
  defaultName?: string;
}

export function AddUserModal({ open, onOpenChange, role, onUserAdded, defaultEmail, defaultName }: AddUserModalProps) {
  const [formData, setFormData] = useState({
    full_name: defaultName || "",
    email: defaultEmail || "",
  });
  const [selectedPMSSystems, setSelectedPMSSystems] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Sales rep fields
  const [repCode, setRepCode] = useState("");
  const [commissionTier, setCommissionTier] = useState<"base" | "accelerated" | "elite">("base");

  // Multi-PMS toggle
  const [showMultiPMS, setShowMultiPMS] = useState(false);

  // Hostfully-specific state
  const [hostfullyAgencyUid, setHostfullyAgencyUid] = useState("");
  const [ownerWillProvideUid, setOwnerWillProvideUid] = useState(false);

  const isHostfullySelected = selectedPMSSystems.includes("hostfully");
  const hasValidAgencyUid = hostfullyAgencyUid.trim().length > 0;

  // Get deployed/active PMS systems (non-hidden, deployed or ready status)
  const allPMSSystems = ALL_PMS_SYSTEMS.filter(s => !s.hidden && (s.deploymentStatus === 'deployed' || s.deploymentStatus === 'ready' || s.deploymentStatus === 'in_development'));

  // For single-select dropdown, use the same list
  const activePMSSystems = allPMSSystems.map(s => ({ key: s.key, name: s.name }));

  useEffect(() => {
    if (open) {
      setFormData({
        full_name: defaultName || "",
        email: defaultEmail || "",
      });
      setSelectedPMSSystems([]);
      setShowMultiPMS(false);
      setRepCode("");
      setCommissionTier("base");
      resetHostfullyState();
    }
  }, [open, defaultEmail, defaultName]);

  const resetHostfullyState = () => {
    setHostfullyAgencyUid("");
    setOwnerWillProvideUid(false);
  };

  const handlePMSChange = (value: string) => {
    if (value === "none") {
      setSelectedPMSSystems([]);
      resetHostfullyState();
    } else {
      setSelectedPMSSystems([value]);
      if (value !== "hostfully") {
        resetHostfullyState();
      }
    }
  };

  const handleMultiPMSToggle = (pmsKey: string, checked: boolean) => {
    if (checked) {
      setSelectedPMSSystems(prev => [...prev, pmsKey]);
    } else {
      setSelectedPMSSystems(prev => prev.filter(k => k !== pmsKey));
      if (pmsKey === "hostfully") {
        resetHostfullyState();
      }
    }
  };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      // Validate form data
      const validated = userSchema.parse(formData);
      
      // Validate Hostfully requirements if selected and admin is providing UID
      if (isHostfullySelected && !ownerWillProvideUid && !hasValidAgencyUid) {
        toast.error("Please enter the Hostfully Agency UID");
        return;
      }

      setLoading(true);

      // Build payload
      const payload: Record<string, any> = {
        email: validated.email,
        full_name: validated.full_name,
        role: role === "sales_rep" ? "user" : role,
        pms_systems: role === "user" ? selectedPMSSystems : undefined,
        sales_rep: role === "sales_rep" ? {
          rep_code: repCode || `REP-${Date.now().toString(36).toUpperCase()}`,
          commission_tier: commissionTier,
        } : undefined,
      };

      // Add Hostfully-specific data if selected
      if (isHostfullySelected) {
        if (ownerWillProvideUid) {
          // Owner will provide details on first login - just mark as pending
          payload.hostfully_owner_will_provide = true;
        } else if (hasValidAgencyUid) {
          // Admin provided Agency UID - owner will provide API key on first login
          payload.hostfully_agency_uid = hostfullyAgencyUid.trim();
        }
      }

      // Call edge function to create user
      const { data, error } = await supabase.functions.invoke("create-user", {
        body: payload,
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      let successMessage: string;
      if (ownerWillProvideUid) {
        successMessage = "Property Owner created. They will complete PMS setup on first login.";
      } else if (isHostfullySelected && hasValidAgencyUid) {
        successMessage = "Property Owner created with Hostfully Agency linked. They will add API key on first login.";
      } else {
        successMessage = `${role === "admin" ? "Admin" : role === "sales_rep" ? "Sales Rep" : "Property Owner"} created successfully`;
      }

      toast.success(successMessage);
      setFormData({ full_name: "", email: "" });
      setSelectedPMSSystems([]);
      resetHostfullyState();
      onOpenChange(false);
      onUserAdded();
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        toast.error(error.errors[0].message);
      } else {
        toast.error(error.message || "Failed to create user");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add {role === "admin" ? "Admin" : role === "sales_rep" ? "Sales Rep / Referral Partner" : "Property Owner"}</DialogTitle>
          <DialogDescription>
            Create a new {role === "admin" ? "admin" : role === "sales_rep" ? "sales rep / referral partner" : "property owner"} account. They will receive an email to set their password.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="full_name">Full Name</Label>
            <Input
              id="full_name"
              value={formData.full_name}
              onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
              placeholder="John Doe"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="john@example.com"
              required
            />
          </div>

          {/* Sales Rep Fields */}
          {role === "sales_rep" && (
            <div className="space-y-4 border rounded-lg p-4 bg-muted/30">
              <div className="flex items-center gap-2">
                <Handshake className="h-4 w-4 text-primary" />
                <Label className="font-medium">Referral Partner Details</Label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="rep-code">Rep Code (optional)</Label>
                  <Input
                    id="rep-code"
                    value={repCode}
                    onChange={(e) => setRepCode(e.target.value)}
                    placeholder="REP-001"
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">Auto-generated if left empty</p>
                </div>
                <div className="space-y-2">
                  <Label>Commission Tier</Label>
                  <Select value={commissionTier} onValueChange={(v: "base" | "accelerated" | "elite") => setCommissionTier(v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="base">Base (20% / 5%)</SelectItem>
                      <SelectItem value="accelerated">Accelerated (25% / 7.5%)</SelectItem>
                      <SelectItem value="elite">Elite (30% / 10%)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}

          {role === "user" && (
            <>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Which PMS do they use? <span className="text-muted-foreground text-xs">(optional)</span></Label>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="multi-pms"
                      checked={showMultiPMS}
                      onCheckedChange={(checked) => {
                        setShowMultiPMS(!!checked);
                        if (!checked) {
                          // Keep first selection when switching back to single mode
                          setSelectedPMSSystems(prev => prev.slice(0, 1));
                        }
                      }}
                    />
                    <Label htmlFor="multi-pms" className="text-xs text-muted-foreground cursor-pointer">
                      Multiple PMS
                    </Label>
                  </div>
                </div>
                
                {!showMultiPMS ? (
                  // Single PMS dropdown
                  <Select
                    value={selectedPMSSystems[0] || "none"}
                    onValueChange={handlePMSChange}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select PMS (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {activePMSSystems.map((system) => (
                        <SelectItem key={system.key} value={system.key}>
                          {system.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  // Multi-PMS checkboxes
                  <div className="grid grid-cols-2 gap-2 p-3 border rounded-lg bg-muted/30">
                    {allPMSSystems.map((system) => (
                      <div key={system.key} className="flex items-center gap-2">
                        <Checkbox
                          id={`pms-${system.key}`}
                          checked={selectedPMSSystems.includes(system.key)}
                          onCheckedChange={(checked) => handleMultiPMSToggle(system.key, !!checked)}
                        />
                        <Label htmlFor={`pms-${system.key}`} className="text-sm cursor-pointer">
                          {system.name}
                        </Label>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Hostfully Configuration Section */}
              {isHostfullySelected && (
                <div className="space-y-4 border rounded-lg p-4 bg-muted/30">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-primary" />
                    <Label className="font-medium">Hostfully Configuration</Label>
                  </div>

                  {/* Toggle: Admin provides UID OR owner will provide */}
                  <div className="space-y-2">
                    <div 
                      className={`flex items-center gap-3 p-3 rounded-md border cursor-pointer transition-colors ${
                        !ownerWillProvideUid ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                      }`}
                      onClick={() => setOwnerWillProvideUid(false)}
                    >
                      <input
                        type="radio"
                        name="hostfully-uid-mode"
                        checked={!ownerWillProvideUid}
                        onChange={() => setOwnerWillProvideUid(false)}
                        className="h-4 w-4"
                      />
                      <div className="flex-1">
                        <p className="text-sm font-medium">I have the Agency UID</p>
                        <p className="text-xs text-muted-foreground">Enter the UID now (owner will add API key on first login)</p>
                      </div>
                    </div>
                    <div 
                      className={`flex items-center gap-3 p-3 rounded-md border cursor-pointer transition-colors ${
                        ownerWillProvideUid ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                      }`}
                      onClick={() => {
                        setOwnerWillProvideUid(true);
                        resetHostfullyState();
                        setOwnerWillProvideUid(true); // Re-set after reset
                      }}
                    >
                      <input
                        type="radio"
                        name="hostfully-uid-mode"
                        checked={ownerWillProvideUid}
                        onChange={() => setOwnerWillProvideUid(true)}
                        className="h-4 w-4"
                      />
                      <div className="flex-1">
                        <p className="text-sm font-medium">Owner will provide details on first login</p>
                        <p className="text-xs text-muted-foreground">They'll see a setup wizard when they log in</p>
                      </div>
                    </div>
                  </div>

                  {/* Only show Agency UID input if admin is providing */}
                  {!ownerWillProvideUid && (
                    <div className="space-y-2">
                      <Label htmlFor="hostfully-agency-uid">Agency UID</Label>
                      <Input
                        id="hostfully-agency-uid"
                        value={hostfullyAgencyUid}
                        onChange={(e) => setHostfullyAgencyUid(e.target.value)}
                        placeholder="e.g. c429dd30-c9b0-44e5-812f-d65f801f2584"
                        className="font-mono text-sm"
                      />
                      <p className="text-xs text-muted-foreground">
                        Find this in Hostfully dashboard under Agency settings. The owner will provide their API key on first login.
                      </p>
                      {hasValidAgencyUid && (
                        <div className="flex items-center gap-2 p-2 bg-green-50 dark:bg-green-950/30 rounded-md border border-green-200 dark:border-green-800">
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                          <span className="text-sm">Agency UID provided</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          <div className="flex gap-2 justify-end pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Creating..." : "Create User"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
