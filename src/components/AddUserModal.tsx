import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { z } from "zod";
import { PMS_ONLY_SYSTEMS } from "@/lib/pmsSystemsConfig";

const userSchema = z.object({
  full_name: z.string().trim().min(1, "Name is required").max(100),
  email: z.string().trim().email("Invalid email address").max(255),
});

interface AddUserModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: "admin" | "user";
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

  useEffect(() => {
    if (open) {
      setFormData({
        full_name: defaultName || "",
        email: defaultEmail || "",
      });
      setSelectedPMSSystems([]);
    }
  }, [open, defaultEmail, defaultName]);

  const handlePMSToggle = (systemKey: string) => {
    setSelectedPMSSystems(prev => 
      prev.includes(systemKey)
        ? prev.filter(k => k !== systemKey)
        : [...prev, systemKey]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      // Validate form data
      const validated = userSchema.parse(formData);
      setLoading(true);

      // Call edge function to create user
      const { data, error } = await supabase.functions.invoke("create-user", {
        body: {
          email: validated.email,
          full_name: validated.full_name,
          role: role,
          pms_systems: role === "user" ? selectedPMSSystems : undefined,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success(`${role === "admin" ? "Admin" : "Property Owner"} created successfully`);
      setFormData({ full_name: "", email: "" });
      setSelectedPMSSystems([]);
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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add {role === "admin" ? "Admin" : "Property Owner"}</DialogTitle>
          <DialogDescription>
            Create a new {role === "admin" ? "admin" : "property owner"} account. They will receive an email to set their password.
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

          {role === "user" && (
            <div className="space-y-3">
              <Label>Which PMS do they use? <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <div className="grid gap-2 max-h-48 overflow-y-auto border rounded-md p-3">
                {PMS_ONLY_SYSTEMS.map((system) => (
                  <div 
                    key={system.key} 
                    className="flex items-start gap-3 p-2 rounded hover:bg-muted/50 cursor-pointer"
                    onClick={() => handlePMSToggle(system.key)}
                  >
                    <Checkbox
                      id={`pms-${system.key}`}
                      checked={selectedPMSSystems.includes(system.key)}
                      onCheckedChange={() => handlePMSToggle(system.key)}
                    />
                    <div className="flex-1 min-w-0">
                      <label 
                        htmlFor={`pms-${system.key}`} 
                        className="text-sm font-medium cursor-pointer"
                      >
                        {system.name}
                      </label>
                      <p className="text-xs text-muted-foreground truncate">
                        {system.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
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
