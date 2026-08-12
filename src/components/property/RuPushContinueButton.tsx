import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { pushPropertyToRu } from "@/lib/ruPushDriver";
import { usePropertyReadiness } from "@/hooks/usePropertyReadiness";

interface RuPushContinueButtonProps {
  propertyId: string;
  className?: string;
}

/**
 * Appears in the Offerings frame once the mandatory readiness score hits 100%.
 * If the property has already been pushed to Rentals United it goes straight to
 * ROL'OS property setup; otherwise it performs the first push, then continues.
 */
export function RuPushContinueButton({ propertyId, className }: RuPushContinueButtonProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [pushing, setPushing] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  // The push gate uses the shared model with the channel report on: a field-only
  // "100%" must never be enough to publish.
  const { mandatoryScore, mandatoryOutstanding, hasData } = usePropertyReadiness(propertyId, {
    channelChecks: true,
  });

  const { data: ruState, isLoading } = useQuery({
    queryKey: ["ru-push-state", propertyId],
    enabled: !!propertyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("rentalsunited_property_id, rentalsunited_building_id")
        .eq("id", propertyId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const alreadyPushed = !!(ruState?.rentalsunited_property_id || ruState?.rentalsunited_building_id);

  const goToSetup = useCallback(() => {
    navigate(`/pms/property-setup?property=${propertyId}`);
  }, [navigate, propertyId]);

  const handleClick = useCallback(async () => {
    if (alreadyPushed) {
      goToSetup();
      return;
    }

    setPushing(true);
    try {
      // Walks the resumable batches so large multi-unit properties finish in one click.
      const data = await pushPropertyToRu(propertyId, {
        onProgress: ({ pushed, total }) => setProgress(`${pushed}/${total}`),
      });
      if (!data?.success) {
        throw new Error(data?.error?.message || "Publish to Channel Manager failed");
      }

      if (data.multi_unit) {
        const successCount = (data.units || []).filter((u) => u.success).length;
        toast.success(`${successCount}/${(data.units || []).length} units published to the Channel Manager`);
      } else {
        toast.success(`Property pushed to Rentals United (ID: ${data.rentalsunited_property_id})`);
      }

      await queryClient.invalidateQueries({ queryKey: ["ru-push-state", propertyId] });
      goToSetup();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Publish to Channel Manager failed");
    } finally {
      setPushing(false);
      setProgress(null);
    }
  }, [alreadyPushed, goToSetup, propertyId, queryClient]);

  if (!hasData || mandatoryOutstanding > 0 || mandatoryScore < 100 || isLoading) return null;

  return (
    <div className={className}>
      <div className="flex items-center gap-2 flex-wrap rounded-md border border-emerald-500/40 bg-emerald-500/5 px-3 py-2">
        <Badge variant="secondary" className="text-[10px] text-emerald-600">
          Mandatory 100%
        </Badge>
        <span className="text-xs text-muted-foreground">
          {alreadyPushed
            ? "Already distributed via the Channel Manager — continue to ROL'OS setup."
            : "All mandatory requirements met — publish this property to the Channel Manager."}
        </span>
        <Button type="button" size="sm" className="h-7 gap-1 text-xs ml-auto" onClick={handleClick} disabled={pushing}>
          {pushing ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" /> Publishing{progress ? ` ${progress}` : ""}…
            </>
          ) : alreadyPushed ? (
            <>
              Continue to ROL'OS setup <ArrowRight className="h-3 w-3" />
            </>
          ) : (
            <>
              <Upload className="h-3 w-3" /> Continue — Publish to Channel Manager
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
