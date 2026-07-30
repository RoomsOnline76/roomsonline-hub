import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ALL_PMS_SYSTEMS, PMSSystemConfig } from "@/lib/pmsSystemsConfig";
import { Loader2 } from "lucide-react";

interface AddPMSModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ownerId: string;
  ownerName: string;
  ownerEmail: string;
  existingPMSSystems: string[];
  onCredentialAdded: () => void;
}

export function AddPMSModal({
  open,
  onOpenChange,
  ownerId,
  ownerName,
  ownerEmail,
  existingPMSSystems,
  onCredentialAdded,
}: AddPMSModalProps) {
  const [selectedPMS, setSelectedPMS] = useState<string>("");
  const [hostfullyAgencyUid, setHostfullyAgencyUid] = useState("");
  const [ownerWillProvideUid, setOwnerWillProvideUid] = useState(false);
  const [loading, setLoading] = useState(false);

  // Only true PMS systems — no channel managers, OTAs, financial or content-only systems.
  // Primary options first (Hostfully, Benson, ROL'OS), then the rest alphabetically.
  const PRIMARY_PMS_KEYS = ["hostfully", "benson", "roomsonline"];
  const EXCLUDED_PMS_KEYS = ["wetu"]; // content portal, not a PMS
  const availablePMSSystems = ALL_PMS_SYSTEMS
    .filter(
      (s) =>
        !s.hidden &&
        !EXCLUDED_PMS_KEYS.includes(s.key) &&
        (s.category === undefined || s.category === "pms")
    )
    .sort((a, b) => {
      const ai = PRIMARY_PMS_KEYS.indexOf(a.key);
      const bi = PRIMARY_PMS_KEYS.indexOf(b.key);
      if (ai !== -1 || bi !== -1) {
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      }
      return a.name.localeCompare(b.name);
    });


  const resetForm = () => {
    setSelectedPMS("");
    setHostfullyAgencyUid("");
    setOwnerWillProvideUid(false);
  };

  const handleSubmit = async () => {
    if (!selectedPMS) {
      toast.error("Please select a PMS system");
      return;
    }

    // For Hostfully, require either Agency UID or owner-will-provide
    if (selectedPMS === "hostfully" && !hostfullyAgencyUid && !ownerWillProvideUid) {
      toast.error("Please provide the Agency UID or select 'Owner will provide'");
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("add-pms-credential", {
        body: {
          owner_id: ownerId,
          system_type: selectedPMS,
          agency_uid: selectedPMS === "hostfully" && !ownerWillProvideUid ? hostfullyAgencyUid : undefined,
          owner_will_provide: selectedPMS === "hostfully" ? ownerWillProvideUid : false,
        },
      });

      if (error) throw error;

      toast.success(`${getPMSName(selectedPMS)} connection added for ${ownerName}`);
      resetForm();
      onOpenChange(false);
      onCredentialAdded();
    } catch (error: any) {
      console.error("Failed to add PMS credential:", error);
      toast.error(error.message || "Failed to add PMS connection");
    } finally {
      setLoading(false);
    }
  };

  const getPMSName = (key: string): string => {
    return availablePMSSystems.find(s => s.key === key)?.name || key;
  };

  const isHostfullySelected = selectedPMS === "hostfully";

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen) resetForm();
      onOpenChange(isOpen);
    }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add PMS Connection</DialogTitle>
          <DialogDescription>
            Add a new PMS system for {ownerName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* PMS Selection */}
          <div className="space-y-2">
            <Label>Select PMS System</Label>
            <Select value={selectedPMS} onValueChange={setSelectedPMS}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a PMS system..." />
              </SelectTrigger>
              <SelectContent>
                {availablePMSSystems.map((pms) => {
                  const alreadyConnected = existingPMSSystems.includes(pms.key);
                  return (
                    <SelectItem 
                      key={pms.key} 
                      value={pms.key}
                      disabled={alreadyConnected && pms.key !== "hostfully"}
                    >
                      {pms.name}
                      {alreadyConnected && pms.key !== "hostfully" && " (already connected)"}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {/* Hostfully-specific configuration */}
          {isHostfullySelected && (
            <div className="space-y-4 rounded-lg border p-4 bg-muted/30">
              <p className="text-sm font-medium">Hostfully Configuration</p>
              
              <RadioGroup
                value={ownerWillProvideUid ? "owner" : "admin"}
                onValueChange={(val) => setOwnerWillProvideUid(val === "owner")}
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="admin" id="admin-provides" />
                  <Label htmlFor="admin-provides" className="text-sm font-normal cursor-pointer">
                    I have the Agency UID
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="owner" id="owner-provides" />
                  <Label htmlFor="owner-provides" className="text-sm font-normal cursor-pointer">
                    Owner will provide details on first login
                  </Label>
                </div>
              </RadioGroup>

              {!ownerWillProvideUid && (
                <div className="space-y-2">
                  <Label htmlFor="pms-config-uid">Agency UID</Label>
                  {/* Hidden decoys to absorb autofill */}
                  <input 
                    type="text" 
                    autoComplete="username" 
                    className="hidden"
                    tabIndex={-1}
                    aria-hidden="true"
                  />
                  <input 
                    type="password" 
                    autoComplete="current-password" 
                    className="hidden"
                    tabIndex={-1}
                    aria-hidden="true"
                  />
                  <Input
                    id="pms-config-uid"
                    value={hostfullyAgencyUid}
                    onChange={(e) => setHostfullyAgencyUid(e.target.value)}
                    placeholder="e.g. c429dd30-c9b0-44e5-812f-d65f801f2584"
                    className="font-mono text-sm"
                    autoComplete="new-password"
                    data-form-type="other"
                    data-lpignore="true"
                    data-1p-ignore="true"
                  />
                  <p className="text-xs text-muted-foreground">
                    Find this in Hostfully dashboard under Agency settings
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading || !selectedPMS}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Add Connection
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
