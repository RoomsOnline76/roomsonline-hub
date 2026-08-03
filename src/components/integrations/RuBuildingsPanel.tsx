import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Building2, RefreshCw, Loader2, Copy, Archive } from "lucide-react";

/**
 * Rentals United building containers — duplicate audit and cleanup.
 *
 * Units are pushed to RU as standalone properties, so building containers are not
 * used by the sync. Historic pushes called Push_PutBuilding_RQ on every run and RU
 * created a fresh container each time, leaving duplicates in the white-label portal.
 * RU exposes no building-delete method, so this panel identifies the duplicates,
 * lets us retire our local mappings, and produces the ID list for RU support.
 */

type OwnerAccount = { id: string; ru_owner_id: string | null; ru_login_email: string | null; owner_email: string | null };
type RuBuilding = { id: string; name: string };
type BuildingMapping = { id: string; property_id: string | null; external_id: string; retired: boolean };

export function RuBuildingsPanel() {
  const [accounts, setAccounts] = useState<OwnerAccount[]>([]);
  const [ownerId, setOwnerId] = useState<string>("");
  const [buildings, setBuildings] = useState<RuBuilding[] | null>(null);
  const [mappings, setMappings] = useState<BuildingMapping[]>([]);
  const [linkedProps, setLinkedProps] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [retiring, setRetiring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadLocal = useCallback(async () => {
    const [{ data: accts }, { data: maps }, { data: props }] = await Promise.all([
      supabase.from("ru_owner_accounts" as any).select("id, ru_owner_id, ru_login_email, owner_email"),
      supabase.from("pms_mappings" as any).select("id, property_id, external_id, metadata").eq("metadata->>mapping_kind", "building"),
      supabase.from("properties").select("id, name, rentalsunited_building_id").not("rentalsunited_building_id", "is", null),
    ]);
    setAccounts(((accts ?? []) as unknown as OwnerAccount[]).filter((a) => a.ru_owner_id));
    setMappings(
      ((maps ?? []) as any[]).map((m) => ({
        id: m.id,
        property_id: m.property_id ?? null,
        external_id: String(m.external_id),
        retired: (m.metadata as any)?.retired === true,
      })),
    );
    const linked: Record<string, string> = {};
    for (const p of (props ?? []) as any[]) {
      if (p.rentalsunited_building_id) linked[String(p.rentalsunited_building_id)] = p.name;
    }
    setLinkedProps(linked);
  }, []);

  useEffect(() => {
    void loadLocal();
  }, [loadLocal]);

  useEffect(() => {
    if (!ownerId && accounts.length > 0) setOwnerId(String(accounts[0].ru_owner_id));
  }, [accounts, ownerId]);

  const listBuildings = useCallback(async () => {
    if (!ownerId) return;
    setLoading(true);
    setError(null);
    const { data, error: fnErr } = await supabase.functions.invoke("rentalsunited-api", {
      body: { action: "list_buildings", owner_id: ownerId },
    });
    setLoading(false);
    if (fnErr || !data?.success) {
      setBuildings(null);
      setError(data?.error?.message ?? fnErr?.message ?? "Failed to list buildings");
      return;
    }
    const list = ((data.buildings ?? []) as RuBuilding[]).map((b) => ({ id: String(b.id), name: String(b.name ?? "") }));
    setBuildings(list);
    toast.success(`${list.length} building(s) on RU account ${ownerId}`);
  }, [ownerId]);

  /** Group by (truncated) name so repeat containers surface as duplicates. */
  const groups = useMemo(() => {
    const byName = new Map<string, RuBuilding[]>();
    for (const b of buildings ?? []) {
      const key = b.name.trim().toUpperCase();
      byName.set(key, [...(byName.get(key) ?? []), b]);
    }
    return Array.from(byName.entries())
      .map(([name, items]) => ({
        name,
        items: [...items].sort((a, b) => Number(b.id) - Number(a.id)),
      }))
      .sort((a, b) => b.items.length - a.items.length);
  }, [buildings]);

  /** A building is "in use" when a property still stores it as its BuildingID. */
  const isInUse = (id: string) => !!linkedProps[id];
  const staleIds = useMemo(
    () => (buildings ?? []).filter((b) => !isInUse(b.id)).map((b) => b.id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [buildings, linkedProps],
  );
  const mappingByExternal = useMemo(() => {
    const m = new Map<string, BuildingMapping>();
    for (const row of mappings) m.set(row.external_id, row);
    return m;
  }, [mappings]);

  const copyStale = useCallback(async () => {
    if (staleIds.length === 0) return;
    await navigator.clipboard.writeText(staleIds.join(", "));
    toast.success(`Copied ${staleIds.length} building ID(s) for RU support`);
  }, [staleIds]);

  const retireStale = useCallback(async () => {
    const rows = staleIds.map((id) => mappingByExternal.get(id)).filter((r): r is BuildingMapping => !!r && !r.retired);
    if (rows.length === 0) {
      toast.info("No local building mappings left to retire");
      return;
    }
    setRetiring(true);
    let failed = 0;
    for (const row of rows) {
      const { error: upErr } = await supabase
        .from("pms_mappings" as any)
        .update({
          metadata: {
            mapping_kind: "building",
            retired: true,
            retired_at: new Date().toISOString(),
            retired_reason: "Duplicate/unused RU building container — units are pushed standalone",
            building_id: Number(row.external_id),
          },
        })
        .eq("id", row.id);
      if (upErr) failed += 1;
    }
    setRetiring(false);
    await loadLocal();
    if (failed > 0) toast.error(`${failed} mapping(s) could not be retired`);
    else toast.success(`Retired ${rows.length} building mapping(s)`);
  }, [staleIds, mappingByExternal, loadLocal]);

  const duplicateCount = groups.reduce((sum, g) => sum + Math.max(0, g.items.length - 1), 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Building2 className="h-4 w-4" />
          Building containers
        </CardTitle>
        <div className="flex items-center gap-2">
          <Select value={ownerId} onValueChange={setOwnerId}>
            <SelectTrigger className="w-[240px]">
              <SelectValue placeholder="RU sub-account" />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={String(a.ru_owner_id)}>
                  {a.ru_login_email ?? a.owner_email ?? "account"} ({a.ru_owner_id})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={listBuildings} disabled={loading || !ownerId}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            <span className="ml-2">List buildings</span>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <AlertDescription className="text-xs">
            Units are pushed to Rentals United as standalone properties, so building containers are no
            longer created or updated by any sync, cron or certification run. Rentals United has no
            building-delete API method — the stale containers listed below must be removed by RU support
            or in the RU portal. Retiring them here only clears our local mapping.
          </AlertDescription>
        </Alert>

        {error && (
          <Alert variant="destructive">
            <AlertDescription className="text-xs">{error}</AlertDescription>
          </Alert>
        )}

        {buildings && (
          <>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="secondary">{buildings.length} on RU</Badge>
              <Badge variant={duplicateCount > 0 ? "destructive" : "secondary"}>{duplicateCount} duplicate(s)</Badge>
              <Badge variant="outline">{staleIds.length} unused</Badge>
              <div className="ml-auto flex gap-2">
                <Button size="sm" variant="outline" onClick={copyStale} disabled={staleIds.length === 0}>
                  <Copy className="mr-2 h-3.5 w-3.5" />
                  Copy unused IDs
                </Button>
                <Button size="sm" variant="outline" onClick={retireStale} disabled={retiring || staleIds.length === 0}>
                  {retiring ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Archive className="mr-2 h-3.5 w-3.5" />}
                  Retire local mappings
                </Button>
              </div>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Building name</TableHead>
                  <TableHead>RU BuildingID</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Referenced by</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.flatMap((g) =>
                  g.items.map((b, idx) => (
                    <TableRow key={b.id}>
                      <TableCell className="text-xs">{idx === 0 ? g.name || "(unnamed)" : ""}</TableCell>
                      <TableCell className="font-mono text-xs">{b.id}</TableCell>
                      <TableCell className="text-xs">
                        {isInUse(b.id) ? (
                          <Badge variant="secondary">In use</Badge>
                        ) : g.items.length > 1 ? (
                          <Badge variant="destructive">Duplicate — remove at RU</Badge>
                        ) : (
                          <Badge variant="outline">Unused</Badge>
                        )}
                        {mappingByExternal.get(b.id)?.retired && (
                          <Badge variant="outline" className="ml-2">Retired locally</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {linkedProps[b.id] ?? (mappingByExternal.has(b.id) ? "mapping only" : "—")}
                      </TableCell>
                    </TableRow>
                  )),
                )}
                {buildings.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-xs text-muted-foreground">
                      No buildings on this account.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </>
        )}
      </CardContent>
    </Card>
  );
}
