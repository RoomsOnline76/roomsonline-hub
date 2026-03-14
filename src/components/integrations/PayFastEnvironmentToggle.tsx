import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FlaskConical, Rocket, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface PayFastSystem {
  id: string;
  system_name: string;
  is_active: boolean;
}

export function PayFastEnvironmentToggle() {
  const queryClient = useQueryClient();

  const { data: systems, isLoading } = useQuery({
    queryKey: ["payfast-environments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supporting_systems")
        .select("id, system_name, is_active")
        .ilike("system_name", "PayFast%")
        .order("system_name");
      if (error) throw error;
      return data as PayFastSystem[];
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async (activateId: string) => {
      // The DB trigger `enforce_single_active_payment_gateway` handles
      // deactivating all other payment systems when one is activated.
      const { error } = await supabase
        .from("supporting_systems")
        .update({ is_active: true })
        .eq("id", activateId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payfast-environments"] });
      queryClient.invalidateQueries({ queryKey: ["active-payment-gateway"] });
      queryClient.invalidateQueries({ queryKey: ["supporting-systems"] });
      toast.success("PayFast environment switched");
    },
    onError: (err) => toast.error("Failed to switch: " + (err as Error).message),
  });

  const sandbox = systems?.find((s) => s.system_name.toLowerCase().includes("sandbox"));
  const production = systems?.find((s) => s.system_name.toLowerCase().includes("production"));

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!sandbox && !production) return null;

  const items = [
    {
      system: sandbox,
      label: "Sandbox",
      description: "Test transactions with no real money",
      icon: FlaskConical,
      accentClass: "border-amber-500/40 bg-amber-500/5",
      badgeClass: "bg-amber-500/10 text-amber-600 border-amber-500/30",
      dotClass: "bg-amber-500",
    },
    {
      system: production,
      label: "Production",
      description: "Live transactions with real payments",
      icon: Rocket,
      accentClass: "border-green-500/40 bg-green-500/5",
      badgeClass: "bg-green-500/10 text-green-600 border-green-500/30",
      dotClass: "bg-green-500",
    },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">PayFast Environment</CardTitle>
        <CardDescription>
          Only one environment can be active at a time. Switching deactivates the other.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3">
          {items.map(({ system, label, description, icon: Icon, accentClass, badgeClass, dotClass }) => {
            if (!system) return null;
            const isActive = system.is_active;
            return (
              <button
                key={system.id}
                type="button"
                disabled={isActive || toggleMutation.isPending}
                onClick={() => toggleMutation.mutate(system.id)}
                className={cn(
                  "relative rounded-lg border-2 p-4 text-left transition-all",
                  isActive
                    ? cn(accentClass, "ring-2 ring-offset-2 ring-offset-background ring-primary/30 cursor-default")
                    : "border-border hover:border-muted-foreground/40 cursor-pointer opacity-60 hover:opacity-100"
                )}
              >
                {isActive && (
                  <span className="absolute top-2 right-2 flex h-2.5 w-2.5">
                    <span className={cn("animate-ping absolute inline-flex h-full w-full rounded-full opacity-75", dotClass)} />
                    <span className={cn("relative inline-flex rounded-full h-2.5 w-2.5", dotClass)} />
                  </span>
                )}
                <div className="flex items-center gap-2 mb-1">
                  <Icon className="h-4 w-4" />
                  <span className="font-medium text-sm">{label}</span>
                  {isActive && (
                    <Badge variant="outline" className={cn("text-xs", badgeClass)}>
                      Active
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{description}</p>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
