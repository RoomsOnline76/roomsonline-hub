import { useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw } from "lucide-react";

interface Props {
  propertyId: string;
}

/**
 * Pulls the HyperGuest static + search data for the property's captured
 * hotel ID and writes the reflection snapshot (board bases, cancellation
 * policies, remarks, photos, facilities) onto the property so the QA
 * reflection inspector and HG verifiers see real data.
 */
export function HyperGuestSyncReflectionButton({ propertyId }: Props) {
  const { toast } = useToast();
  const [syncing, setSyncing] = useState(false);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("hyperguest-api", {
        body: { action: "sync_reflection", property_id: propertyId },
      });
      if (error) throw error;
      if (data?.success === false) throw new Error(data?.error?.message ?? "Sync failed");
      const written = data?.data?.written ?? {};
      const writtenKeys = Object.keys(written).filter((k) => written[k]);
      toast({
        title: "Reflection synced from HyperGuest",
        description: writtenKeys.length
          ? `Updated: ${writtenKeys.join(", ")}`
          : "No new data needed — property already populated.",
      });
    } catch (e: any) {
      toast({
        title: "Sync failed",
        description: e?.message ?? "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-7 text-xs gap-1"
      onClick={handleSync}
      disabled={syncing}
    >
      <RefreshCw className={`h-3 w-3 ${syncing ? "animate-spin" : ""}`} />
      {syncing ? "Syncing…" : "Sync from HyperGuest"}
    </Button>
  );
}
