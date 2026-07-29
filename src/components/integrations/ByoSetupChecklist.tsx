import { useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { ClipboardCheck, ExternalLink, AlertTriangle, Loader2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  getByoChecklist,
  autoCompletedIds,
  computeByoProgress,
  readSavedChecklist,
  BYO_CHECKLIST_KEY,
  type ByoAutoState,
} from "@/lib/byoSetupChecklist";

interface ByoSetupChecklistProps {
  propertyId: string;
  /** Provider the property settles with (e.g. "payfast"). */
  provider?: string | null;
  /** Backend-derived state used to auto-tick items. */
  auto?: ByoAutoState;
  /** Read-only mode for admin views. */
  readOnly?: boolean;
  className?: string;
}

/**
 * Recommendations the property must complete inside their own gateway account
 * after an admin enables the BYO payment gateway (live mode, ITN/webhook,
 * onsite activation, refunds permission, settlement account).
 */
export function ByoSetupChecklist({
  propertyId,
  provider,
  auto,
  readOnly = false,
  className,
}: ByoSetupChecklistProps) {
  const queryClient = useQueryClient();
  const items = useMemo(() => getByoChecklist(provider), [provider]);

  const { data: savedConfig, isLoading } = useQuery({
    queryKey: ["byo-checklist", propertyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("integration_configs")
        .select("id, config")
        .eq("property_id", propertyId)
        .eq("integration_type", "payment_credentials")
        .maybeSingle();
      if (error) throw error;
      return data as { id: string; config: Record<string, unknown> } | null;
    },
    enabled: !!propertyId,
  });

  const manualIds = useMemo(() => readSavedChecklist(savedConfig?.config), [savedConfig]);
  const autoIds = useMemo(() => autoCompletedIds(items, auto || {}), [items, auto]);
  const completedIds = useMemo(
    () => Array.from(new Set([...manualIds, ...autoIds])),
    [manualIds, autoIds],
  );
  const progress = useMemo(() => computeByoProgress(items, completedIds), [items, completedIds]);

  const saveMutation = useMutation({
    mutationFn: async (nextIds: string[]) => {
      if (savedConfig?.id) {
        const nextConfig = { ...(savedConfig.config || {}), [BYO_CHECKLIST_KEY]: nextIds };
        const { error } = await supabase
          .from("integration_configs")
          .update({ config: nextConfig as never, updated_at: new Date().toISOString() })
          .eq("id", savedConfig.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("integration_configs").insert({
          property_id: propertyId,
          integration_type: "payment_credentials",
          config: { [BYO_CHECKLIST_KEY]: nextIds } as never,
          is_active: true,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["byo-checklist", propertyId] });
      queryClient.invalidateQueries({ queryKey: ["payment-credentials", propertyId] });
    },
    onError: (e: unknown) =>
      toast.error("Could not save your progress", {
        description: e instanceof Error ? e.message : "Please try again.",
      }),
  });

  const toggle = (id: string, checked: boolean) => {
    if (readOnly) return;
    const next = checked ? [...manualIds, id] : manualIds.filter((x) => x !== id);
    saveMutation.mutate(Array.from(new Set(next)));
  };

  const pct = progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;
  const sandboxWarning = auto?.credentialsResolved && auto?.isSandbox;

  return (
    <Card className={cn("border-amber-500/40", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2 min-w-0">
            <ClipboardCheck className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
            <div className="min-w-0">
              <CardTitle className="text-sm">
                {readOnly ? "Owner setup checklist (BYO gateway)" : "Finish activating your payment gateway"}
              </CardTitle>
              <CardDescription className="text-xs">
                {readOnly
                  ? "Steps the property must complete inside their own gateway account."
                  : "Your own payment gateway is enabled. Complete these steps in your provider account so live payments and booking confirmations work."}
              </CardDescription>
            </div>
          </div>
          <Badge variant={progress.requiredOutstanding.length === 0 ? "default" : "secondary"} className="shrink-0">
            {progress.completed} / {progress.total}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Progress value={pct} className="h-1.5" />
          <p className="text-[11px] text-muted-foreground">
            {progress.completed} of {progress.total} recommended steps complete
            {progress.requiredOutstanding.length > 0
              ? ` — ${progress.requiredOutstanding.length} required step${
                  progress.requiredOutstanding.length === 1 ? "" : "s"
                } outstanding.`
              : " — all required steps done."}
          </p>
        </div>

        {sandboxWarning && (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 px-2.5 py-2">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-600" />
            <p className="text-[11px] text-amber-800 dark:text-amber-300">
              Credentials are saved but the account still resolves as <strong>sandbox</strong>. Real guest
              payments will not be collected until the account is switched to live mode.
            </p>
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <ul className="space-y-1.5">
            {items.map((item) => {
              const done = completedIds.includes(item.id);
              const autoDone = autoIds.includes(item.id);
              return (
                <li
                  key={item.id}
                  className={cn(
                    "flex items-start gap-2.5 rounded-lg border px-3 py-2.5",
                    done ? "border-emerald-500/40 bg-emerald-500/5" : "border-border",
                  )}
                >
                  <Checkbox
                    checked={done}
                    disabled={readOnly || autoDone || saveMutation.isPending}
                    onCheckedChange={(v) => toggle(item.id, v === true)}
                    className="mt-0.5"
                    aria-label={item.title}
                  />
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={cn("text-xs font-medium", done && "text-muted-foreground line-through")}>
                        {item.title}
                      </span>
                      {item.required ? (
                        <Badge variant="outline" className="text-[9px] px-1 py-0">Required</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[9px] px-1 py-0">Optional</Badge>
                      )}
                      {autoDone && (
                        <Badge variant="outline" className="text-[9px] px-1 py-0 border-emerald-500/50 text-emerald-600">
                          Verified
                        </Badge>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground">{item.detail}</p>
                    {item.docsUrl && (
                      <a
                        href={item.docsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Provider guide
                      </a>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export default ByoSetupChecklist;
