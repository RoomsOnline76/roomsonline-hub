import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface SupportingSystem {
  id: string;
  system_name: string;
  system_url: string | null;
  login_username: string | null;
  login_password_encrypted: string | null;
  system_function: string | null;
  category: string | null;
  is_active: boolean;
}

interface AddSupportingSystemModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingSystem: SupportingSystem | null;
}

const CATEGORIES = [
  { value: "pms", label: "PMS / Channel Manager" },
  { value: "payment", label: "Payment Gateway" },
  { value: "email", label: "Email / Communications" },
  { value: "analytics", label: "Analytics / Reporting" },
  { value: "hosting", label: "Hosting / Infrastructure" },
  { value: "general", label: "General" },
];

export function AddSupportingSystemModal({
  open,
  onOpenChange,
  editingSystem,
}: AddSupportingSystemModalProps) {
  const [formData, setFormData] = useState({
    system_name: "",
    system_url: "",
    login_username: "",
    login_password: "",
    system_function: "",
    category: "general",
    is_active: true,
  });

  const queryClient = useQueryClient();
  const isEditing = !!editingSystem;

  useEffect(() => {
    if (editingSystem) {
      setFormData({
        system_name: editingSystem.system_name || "",
        system_url: editingSystem.system_url || "",
        login_username: editingSystem.login_username || "",
        login_password: "", // Don't prefill password
        system_function: editingSystem.system_function || "",
        category: editingSystem.category || "general",
        is_active: editingSystem.is_active,
      });
    } else {
      setFormData({
        system_name: "",
        system_url: "",
        login_username: "",
        login_password: "",
        system_function: "",
        category: "general",
        is_active: true,
      });
    }
  }, [editingSystem, open]);

  const mutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { data: userData } = await supabase.auth.getUser();
      
      const payload: Record<string, unknown> = {
        system_name: data.system_name,
        system_url: data.system_url || null,
        login_username: data.login_username || null,
        system_function: data.system_function || null,
        category: data.category,
        is_active: data.is_active,
        created_by: userData.user?.id,
      };

      // Only update password if provided
      if (data.login_password) {
        // For now, store as plain text - encryption handled server-side
        // In production, use edge function to encrypt
        payload.login_password_encrypted = null; // Will be handled by trigger
      }

      if (isEditing && editingSystem) {
        const { error } = await supabase
          .from("supporting_systems")
          .update(payload as any)
          .eq("id", editingSystem.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("supporting_systems")
          .insert(payload as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["supporting-systems"] });
      toast.success(isEditing ? "System updated" : "System added");
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error("Failed to save: " + error.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.system_name.trim()) {
      toast.error("System name is required");
      return;
    }
    mutation.mutate(formData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit System" : "Add Supporting System"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="system_name">System Name *</Label>
              <Input
                id="system_name"
                value={formData.system_name}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, system_name: e.target.value }))
                }
                placeholder="e.g., Stripe Dashboard"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="system_url">URL</Label>
              <Input
                id="system_url"
                type="url"
                value={formData.system_url}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, system_url: e.target.value }))
                }
                placeholder="https://..."
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="login_username">Login Username</Label>
                <Input
                  id="login_username"
                  value={formData.login_username}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, login_username: e.target.value }))
                  }
                  placeholder="username or email"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="login_password">
                  Password {isEditing && "(leave blank to keep current)"}
                </Label>
                <Input
                  id="login_password"
                  type="password"
                  value={formData.login_password}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, login_password: e.target.value }))
                  }
                  placeholder="••••••••"
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="category">Category</Label>
              <Select
                value={formData.category}
                onValueChange={(value) =>
                  setFormData((prev) => ({ ...prev, category: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="system_function">Function / Purpose</Label>
              <Textarea
                id="system_function"
                value={formData.system_function}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, system_function: e.target.value }))
                }
                placeholder="Describe what this system is used for..."
                rows={3}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="is_active">Active</Label>
              <Switch
                id="is_active"
                checked={formData.is_active}
                onCheckedChange={(checked) =>
                  setFormData((prev) => ({ ...prev, is_active: checked }))
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              {isEditing ? "Update" : "Add System"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
