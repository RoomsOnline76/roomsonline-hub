import { useState, useEffect } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface IntegrationToggleProps {
  propertyId: string;
  integrationType: string;
  onConfigChange?: (config: any) => void;
}

export function IntegrationToggle({ propertyId, integrationType, onConfigChange }: IntegrationToggleProps) {
  const [isActive, setIsActive] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchConfig = async () => {
      const { data } = await supabase
        .from("integration_configs")
        .select("*")
        .eq("property_id", propertyId)
        .eq("integration_type", integrationType)
        .maybeSingle();

      if (data) {
        setIsActive(data.is_active ?? false);
        onConfigChange?.(data);
      }
      setLoading(false);
    };
    fetchConfig();
  }, [propertyId, integrationType]);

  const handleToggle = async (checked: boolean) => {
    setIsActive(checked);

    const { data: existing } = await supabase
      .from("integration_configs")
      .select("id")
      .eq("property_id", propertyId)
      .eq("integration_type", integrationType)
      .maybeSingle();

    if (existing) {
      await supabase
        .from("integration_configs")
        .update({ is_active: checked })
        .eq("id", existing.id);
    } else {
      const { data } = await supabase
        .from("integration_configs")
        .insert({ property_id: propertyId, integration_type: integrationType, is_active: checked })
        .select()
        .single();
      onConfigChange?.(data);
    }

    toast({ title: checked ? "Integration enabled" : "Integration disabled" });
  };

  return (
    <div className="flex items-center gap-2">
      <Switch checked={isActive} onCheckedChange={handleToggle} disabled={loading} />
      <Label className="text-sm text-muted-foreground">
        {isActive ? "Active" : "Inactive"}
      </Label>
    </div>
  );
}
