import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { RefreshCw, Rocket } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ROLOS_WP_PLUGIN_VERSION } from "@/config/wordpressPlugin";

export function WordPressPushUpdateButton() {
  const queryClient = useQueryClient();
  const [pushing, setPushing] = useState(false);

  // Fetch all wordpress integration configs to find the current global version
  const { data: configs } = useQuery({
    queryKey: ["wordpress-configs-all"],
    queryFn: async () => {
      const { data } = await supabase
        .from("integration_configs")
        .select("id, property_id, config")
        .eq("integration_type", "wordpress");
      return data || [];
    },
  });

  // Find the highest version across all properties
  const currentVersion = configs?.reduce((max, c) => {
    const v = (c.config as Record<string, unknown>)?.plugin_version as string;
    return v && v > max ? v : max;
  }, ROLOS_WP_PLUGIN_VERSION) || ROLOS_WP_PLUGIN_VERSION;

  const handlePushUpdate = async () => {
    setPushing(true);
    try {
      const parts = currentVersion.split(".").map(Number);
      parts[2] = (parts[2] || 0) + 1;
      const newVersion = parts.join(".");

      // Update all existing wordpress configs
      if (configs && configs.length > 0) {
        for (const config of configs) {
          const existingConfig = (config.config as Record<string, unknown>) || {};
          await supabase
            .from("integration_configs")
            .update({ config: { ...existingConfig, plugin_version: newVersion } })
            .eq("id", config.id);
        }
      }

      queryClient.invalidateQueries({ queryKey: ["wordpress-configs-all"] });
      toast({
        title: "Update pushed!",
        description: `Version ${newVersion} will be available to all WordPress sites within 12 hours.`,
      });
    } catch (err) {
      console.error("Push update error:", err);
      toast({ title: "Error", description: "Failed to push update.", variant: "destructive" });
    } finally {
      setPushing(false);
    }
  };

  return (
    <div className="flex items-center justify-between">
      <div className="space-y-0.5">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Current version</span>
          <Badge variant="outline" className="font-mono text-xs">v{currentVersion}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Bumps the plugin version across all properties
        </p>
      </div>
      <Button onClick={handlePushUpdate} variant="outline" className="gap-2" disabled={pushing}>
        {pushing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
        Push Update to All Sites
      </Button>
    </div>
  );
}
