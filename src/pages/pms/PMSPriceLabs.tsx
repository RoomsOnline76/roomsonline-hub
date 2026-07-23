import { useMemo, useState } from "react";
import { usePmsPropertyId } from "@/hooks/usePmsPropertyId";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowUpRight, ArrowDownRight, Minus, RefreshCw, Upload, Zap, Info, Sparkles } from "lucide-react";
import { format } from "date-fns";

interface PriceLabsConfig {
  enabled?: boolean;
  managed_rate_plan_ids?: string[];
  managed_room_type_ids?: string[];
  auto_apply?: boolean;
  min_price_floor?: number;
  max_price_ceiling?: number;
  last_pull_at?: string;
  credentials?: { integration_name?: string; integration_token?: string };
}

interface Suggestion {
  id: string;
  property_id: string;
  room_type_id: string | null;
  rate_plan_id: string | null;
  date: string;
  suggested_price: number;
  current_price: number | null;
  occupancy: number | null;
  demand_signal: string | null;
  applied_at: string | null;
  applied_price: number | null;
  pulled_at: string;
}

export default function PMSPriceLabs() {
  const { propertyId, loading: propLoading } = usePmsPropertyId();
  const { isAdmin, isDev, isFearlessLeader } = useAuth();
  const canManage = isAdmin || isDev || isFearlessLeader;
  const qc = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Load property + config
  const { data: property, isLoading: pLoading } = useQuery({
    queryKey: ["pricelabs-property", propertyId],
    enabled: !!propertyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("id, name, pricelabs_config")
        .eq("id", propertyId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const cfg = (property?.pricelabs_config ?? {}) as PriceLabsConfig;

  const { data: roomTypes = [] } = useQuery({
    queryKey: ["pricelabs-room-types", propertyId],
    enabled: !!propertyId,
    queryFn: async () => {
      const { data } = await supabase
        .from("rolos_room_types")
        .select("id, name")
        .eq("property_id", propertyId!)
        .eq("is_active", true);
      return data ?? [];
    },
  });

  const { data: ratePlans = [] } = useQuery({
    queryKey: ["pricelabs-rate-plans", propertyId],
    enabled: !!propertyId,
    queryFn: async () => {
      const { data } = await supabase
        .from("rolos_rate_plans")
        .select("id, name")
        .eq("property_id", propertyId!)
        .eq("is_active", true);
      return data ?? [];
    },
  });

  const { data: suggestions = [], isFetching: sLoading, refetch: refetchSuggestions } = useQuery({
    queryKey: ["pricelabs-suggestions", propertyId],
    enabled: !!propertyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pricelabs_price_suggestions")
        .select("*")
        .eq("property_id", propertyId!)
        .gte("date", format(new Date(), "yyyy-MM-dd"))
        .order("date", { ascending: true })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as Suggestion[];
    },
  });

  const roomNameById = useMemo(() => {
    const m = new Map<string, string>();
    roomTypes.forEach((r) => m.set(r.id, r.name));
    return m;
  }, [roomTypes]);

  const saveConfig = useMutation({
    mutationFn: async (next: PriceLabsConfig) => {
      const { error } = await supabase
        .from("properties")
        .update({ pricelabs_config: next })
        .eq("id", propertyId!);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pricelabs-property", propertyId] });
      toast.success("PriceLabs settings saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const callApi = async (action: string, body: Record<string, unknown> = {}) => {
    const { data, error } = await supabase.functions.invoke("pricelabs-api", {
      body: { action, property_id: propertyId, ...body },
    });
    if (error) throw error;
    if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
    return data;
  };

  const pushProperty = useMutation({
    mutationFn: () => callApi("sync_property_to_pricelabs"),
    onSuccess: (d: any) => toast.success(`Pushed ${d?.listings_pushed ?? 0} listings, ${d?.reservations_pushed ?? 0} reservations`),
    onError: (e: Error) => toast.error(`Push failed: ${e.message}`),
  });

  const pullSuggestions = useMutation({
    mutationFn: () => callApi("pull_price_suggestions"),
    onSuccess: (d: any) => {
      toast.success(`Pulled ${d?.suggestions_upserted ?? 0} suggestions`);
      refetchSuggestions();
    },
    onError: (e: Error) => toast.error(`Pull failed: ${e.message}`),
  });

  const applySelected = useMutation({
    mutationFn: () => callApi("apply_suggestions", { suggestion_ids: Array.from(selectedIds) }),
    onSuccess: (d: any) => {
      toast.success(`Applied ${d?.applied ?? 0} price suggestions`);
      setSelectedIds(new Set());
      refetchSuggestions();
    },
    onError: (e: Error) => toast.error(`Apply failed: ${e.message}`),
  });

  const toggleId = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = (checked: boolean) => {
    if (checked) setSelectedIds(new Set(suggestions.filter((s) => !s.applied_at).map((s) => s.id)));
    else setSelectedIds(new Set());
  };

  const [draftCfg, setDraftCfg] = useState<PriceLabsConfig | null>(null);
  const editing = draftCfg ?? cfg;

  const updateCfg = (patch: Partial<PriceLabsConfig>) => setDraftCfg({ ...(editing), ...patch });

  if (propLoading || pLoading) {
    return <div className="p-6 space-y-4"><Skeleton className="h-32" /><Skeleton className="h-64" /></div>;
  }

  if (!propertyId) {
    return <div className="p-6"><Alert><AlertDescription>Select a property to configure PriceLabs.</AlertDescription></Alert></div>;
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Sparkles className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-semibold">PriceLabs Revenue Management</h1>
          <p className="text-sm text-muted-foreground">
            AI-driven dynamic pricing suggestions for {property?.name}. Suggestions never change your rates automatically — click Apply to promote.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Configuration</CardTitle>
          <CardDescription>
            {canManage ? "Admin-only controls. Enable PriceLabs, pick which rate plans it drives, and set safety rails." : "Read-only. Ask an admin to change these settings."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-base">Enabled</Label>
              <p className="text-sm text-muted-foreground">Show suggestions and allow syncing.</p>
            </div>
            <Switch checked={!!editing.enabled} disabled={!canManage} onCheckedChange={(v) => updateCfg({ enabled: v })} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Price floor (min)</Label>
              <Input type="number" value={editing.min_price_floor ?? ""} disabled={!canManage}
                onChange={(e) => updateCfg({ min_price_floor: e.target.value ? Number(e.target.value) : undefined })} />
              <p className="text-xs text-muted-foreground mt-1">Suggestions below this are lifted to the floor when applied.</p>
            </div>
            <div>
              <Label>Price ceiling (max)</Label>
              <Input type="number" value={editing.max_price_ceiling ?? ""} disabled={!canManage}
                onChange={(e) => updateCfg({ max_price_ceiling: e.target.value ? Number(e.target.value) : undefined })} />
              <p className="text-xs text-muted-foreground mt-1">Suggestions above this are capped when applied.</p>
            </div>
          </div>

          <div>
            <Label className="text-base">Managed rate plans</Label>
            <p className="text-sm text-muted-foreground mb-2">Only these rate plans receive PriceLabs pricing on Apply.</p>
            <div className="flex flex-wrap gap-2">
              {ratePlans.map((rp) => {
                const managed = (editing.managed_rate_plan_ids ?? []).includes(rp.id);
                return (
                  <Badge
                    key={rp.id}
                    variant={managed ? "default" : "outline"}
                    className={canManage ? "cursor-pointer" : ""}
                    onClick={() => {
                      if (!canManage) return;
                      const cur = new Set(editing.managed_rate_plan_ids ?? []);
                      if (cur.has(rp.id)) cur.delete(rp.id); else cur.add(rp.id);
                      updateCfg({ managed_rate_plan_ids: Array.from(cur) });
                    }}
                  >
                    {rp.name}
                  </Badge>
                );
              })}
              {ratePlans.length === 0 && <span className="text-sm text-muted-foreground">No active rate plans.</span>}
            </div>
          </div>

          {canManage && (
            <>
              <div className="border-t pt-4">
                <Label className="text-base">Per-property credentials (optional override)</Label>
                <p className="text-sm text-muted-foreground mb-2">Leave blank to use the platform-wide PriceLabs account.</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <Input placeholder="Integration name"
                    value={editing.credentials?.integration_name ?? ""}
                    onChange={(e) => updateCfg({ credentials: { ...editing.credentials, integration_name: e.target.value } })} />
                  <Input placeholder="Integration token" type="password"
                    value={editing.credentials?.integration_token ?? ""}
                    onChange={(e) => updateCfg({ credentials: { ...editing.credentials, integration_token: e.target.value } })} />
                </div>
              </div>

              <div className="flex gap-2">
                <Button onClick={() => { if (draftCfg) saveConfig.mutate(draftCfg); }} disabled={!draftCfg || saveConfig.isPending}>
                  Save settings
                </Button>
                {draftCfg && <Button variant="outline" onClick={() => setDraftCfg(null)}>Cancel</Button>}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sync & pull</CardTitle>
          <CardDescription>
            Push listings + reservations to PriceLabs, then pull optimised prices.
            {cfg.last_pull_at && <span className="block text-xs mt-1">Last pull: {format(new Date(cfg.last_pull_at), "PPp")}</span>}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => pushProperty.mutate()} disabled={pushProperty.isPending || !cfg.enabled}>
            <Upload className="h-4 w-4 mr-2" /> Push property to PriceLabs
          </Button>
          <Button onClick={() => pullSuggestions.mutate()} disabled={pullSuggestions.isPending || !cfg.enabled}>
            <RefreshCw className={`h-4 w-4 mr-2 ${pullSuggestions.isPending ? "animate-spin" : ""}`} /> Pull latest suggestions
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Suggestions</CardTitle>
            <CardDescription>
              {selectedIds.size > 0 ? `${selectedIds.size} selected` : "Select rows to apply. Applied suggestions create a 1-day rate season on your managed rate plan."}
            </CardDescription>
          </div>
          <Button onClick={() => applySelected.mutate()} disabled={selectedIds.size === 0 || applySelected.isPending}>
            <Zap className="h-4 w-4 mr-2" /> Apply selected ({selectedIds.size})
          </Button>
        </CardHeader>
        <CardContent>
          {sLoading ? (
            <Skeleton className="h-40" />
          ) : suggestions.length === 0 ? (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>No suggestions yet</AlertTitle>
              <AlertDescription>Click "Pull latest suggestions" after pushing your property to PriceLabs.</AlertDescription>
            </Alert>
          ) : (
            <div className="border rounded-md overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8">
                      <Checkbox
                        checked={selectedIds.size > 0 && selectedIds.size === suggestions.filter((s) => !s.applied_at).length}
                        onCheckedChange={(v) => toggleAll(!!v)}
                      />
                    </TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Room</TableHead>
                    <TableHead className="text-right">Current</TableHead>
                    <TableHead className="text-right">Suggested</TableHead>
                    <TableHead className="text-right">Δ</TableHead>
                    <TableHead>Signal</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {suggestions.map((s) => {
                    const delta = s.current_price ? ((s.suggested_price - s.current_price) / s.current_price) * 100 : 0;
                    const Icon = delta > 1 ? ArrowUpRight : delta < -1 ? ArrowDownRight : Minus;
                    const deltaColor = delta > 1 ? "text-green-600" : delta < -1 ? "text-red-600" : "text-muted-foreground";
                    return (
                      <TableRow key={s.id} className={s.applied_at ? "opacity-60" : ""}>
                        <TableCell>
                          <Checkbox
                            disabled={!!s.applied_at}
                            checked={selectedIds.has(s.id)}
                            onCheckedChange={() => toggleId(s.id)}
                          />
                        </TableCell>
                        <TableCell className="font-mono text-sm">{s.date}</TableCell>
                        <TableCell>{s.room_type_id ? roomNameById.get(s.room_type_id) ?? "—" : "—"}</TableCell>
                        <TableCell className="text-right font-mono">{s.current_price ? s.current_price.toFixed(2) : "—"}</TableCell>
                        <TableCell className="text-right font-mono font-semibold">{s.suggested_price.toFixed(2)}</TableCell>
                        <TableCell className={`text-right ${deltaColor}`}>
                          <span className="inline-flex items-center gap-1">
                            <Icon className="h-3 w-3" />
                            {delta.toFixed(1)}%
                          </span>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{s.demand_signal ?? (s.occupancy != null ? `${Math.round(s.occupancy * 100)}% occ` : "—")}</TableCell>
                        <TableCell>
                          {s.applied_at ? (
                            <Badge variant="secondary">Applied @ {s.applied_price?.toFixed(2)}</Badge>
                          ) : (
                            <Badge variant="outline">Pending</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
